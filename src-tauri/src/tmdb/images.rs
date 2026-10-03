use super::client::{valid_image_path, Remote};
use super::{array, text, Error, Result};
use crate::local::LocalData;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};
use uuid::Uuid;

pub(super) struct Prepared {
    pub signature: String,
    pub document: Value,
    pub files: Vec<PathBuf>,
}
impl Drop for Prepared {
    fn drop(&mut self) {
        for file in &self.files {
            let _ = fs::remove_file(file);
        }
    }
}
struct Job {
    path: String,
    kind: String,
    targets: Vec<(String, String)>,
}
fn collect(value: &Value, pointer: &str, group: &str, jobs: &mut HashMap<String, Job>) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                let pointer = format!("{pointer}/{key}");
                if ["photo", "still"].contains(&key.as_str()) {
                    if let Some(path) = value.as_str().filter(|p| p.starts_with('/')) {
                        add(jobs, path, "portrait", &pointer, group);
                    }
                } else {
                    collect(value, &pointer, group, jobs);
                }
            }
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                collect(item, &format!("{pointer}/{i}"), group, jobs);
            }
        }
        _ => {}
    }
}
fn add(jobs: &mut HashMap<String, Job>, path: &str, kind: &str, target: &str, group: &str) {
    jobs.entry(format!("{kind}:{path}"))
        .or_insert_with(|| Job {
            path: path.into(),
            kind: kind.into(),
            targets: vec![],
        })
        .targets
        .push((target.into(), group.into()));
}
pub(super) fn prepare(
    data: &LocalData,
    remote: &Remote,
    candidate: &Value,
    mut document: Value,
    body: &Value,
    signature: String,
) -> Result<Prepared> {
    let folder = data.dir.join("posters");
    fs::create_dir_all(&folder).map_err(|_| Error::new("无法创建图片目录"))?;
    let mut jobs = HashMap::new();
    if let Some(images) = body["images"].as_object() {
        for (kind, path) in images {
            let path = path.as_str().ok_or_else(|| Error::new("图片路径无效"))?;
            if !["poster", "backdrop", "logo"].contains(&kind.as_str()) {
                return Err(Error::new("无效的图片类型"));
            }
            if !array(&candidate["images"][kind])
                .iter()
                .any(|v| text(v, "path") == path)
            {
                return Err(Error::new("图片不属于本次预览"));
            }
            if kind != "poster" {
                document["metadata"][kind] = json!("");
            }
            let target = if kind == "poster" {
                "/poster".to_owned()
            } else {
                format!("/metadata/{kind}")
            };
            add(&mut jobs, path, kind, &target, kind);
        }
    }
    for group in ["cast", "crew", "creators", "episodes"] {
        collect(
            &document["metadata"][group],
            &format!("/metadata/{group}"),
            group,
            &mut jobs,
        );
    }
    let jobs: Vec<_> = jobs.into_values().collect();
    let next = AtomicUsize::new(0);
    let results = Mutex::new(Vec::new());
    std::thread::scope(|scope| {
        for _ in 0..6.min(jobs.len()) {
            let jobs = &jobs;
            let next = &next;
            let results = &results;
            let folder = &folder;
            scope.spawn(move || loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= jobs.len() {
                    break;
                }
                let result = download(remote, folder, &jobs[i]);
                if let Ok(mut results) = results.lock() {
                    results.push((i, result));
                }
            });
        }
    });
    let mut prepared = Prepared {
        signature,
        document: json!({}),
        files: vec![],
    };
    let mut errors = HashMap::new();
    for (i, result) in results
        .into_inner()
        .map_err(|_| Error::new("图片保存状态不可用"))?
    {
        match result {
            Ok(name) => {
                prepared.files.push(folder.join(&name));
                for (pointer, _) in &jobs[i].targets {
                    if let Some(value) = document.pointer_mut(pointer) {
                        *value = json!(name);
                    }
                }
            }
            Err(error) => {
                for (_, group) in &jobs[i].targets {
                    errors.insert(
                        group.clone(),
                        if jobs[i].kind == "portrait" {
                            "关联图片保存失败，可取消此资料组后重试".into()
                        } else {
                            error.error.clone()
                        },
                    );
                }
            }
        }
    }
    if !errors.is_empty() {
        return Err(Error {
            error: "部分图片保存失败，收藏尚未写入。请重试或取消失败图片。".into(),
            existing_id: None,
            image_errors: Some(errors),
        });
    }
    remote.check()?;
    if document["new"] == true && !text(&document, "poster").is_empty() {
        let old = folder.join(text(&document, "poster"));
        let ext = old
            .extension()
            .and_then(|s| s.to_str())
            .ok_or_else(|| Error::new("海报格式无效"))?;
        let name = format!("{}.{}", text(&document, "uid"), ext);
        let new = folder.join(&name);
        fs::rename(&old, &new).map_err(|_| Error::new("海报保存失败"))?;
        for file in &mut prepared.files {
            if file == &old {
                *file = new.clone();
            }
        }
        document["poster"] = json!(name);
    }
    prepared.document = document;
    Ok(prepared)
}
fn download(remote: &Remote, folder: &std::path::Path, job: &Job) -> Result<String> {
    remote.check()?;
    if !valid_image_path(&job.path) {
        return Err(Error::new("图片路径无效"));
    }
    let size = match job.kind.as_str() {
        "poster" => "w780",
        "backdrop" => "w1280",
        _ => "original",
    };
    let response = remote
        .http
        .get(remote.image_url(&job.path, size))
        .send()
        .map_err(|_| Error::new("图片下载失败或超时"))?;
    if response.status() != 200 {
        return Err(Error::new("图片下载失败"));
    }
    let mut bytes = vec![];
    response
        .take(10 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error::new("图片读取失败"))?;
    if bytes.len() > 10 * 1024 * 1024 {
        return Err(Error::new("图片超过 10MB"));
    }
    let ext = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "jpg"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "webp"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "gif"
    } else if job.kind != "poster" && job.path.to_lowercase().ends_with(".svg") && valid_svg(&bytes)
    {
        "svg"
    } else {
        return Err(Error::new("图片格式不支持"));
    };
    remote.check()?;
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    let path = folder.join(&name);
    if fs::write(&path, bytes).is_err() {
        let _ = fs::remove_file(path);
        return Err(Error::new("保存图片失败"));
    }
    Ok(name)
}
fn valid_svg(bytes: &[u8]) -> bool {
    let mut reader = quick_xml::Reader::from_reader(bytes);
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(e) | quick_xml::events::Event::Empty(e)) => {
                return e.local_name().as_ref() == "svg"
            }
            Ok(quick_xml::events::Event::Eof) | Err(_) => return false,
            _ => {}
        }
    }
}
