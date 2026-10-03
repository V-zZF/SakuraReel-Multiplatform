mod client;
mod images;
mod storage;
#[cfg(test)]
mod tests;

use crate::local::LocalData;
use client::Remote;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::State;
use uuid::Uuid;

pub(super) type Result<T> = std::result::Result<T, Error>;
#[derive(Debug, Serialize, Deserialize)]
pub struct Error {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_errors: Option<HashMap<String, String>>,
}
impl Error {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
            existing_id: None,
            image_errors: None,
        }
    }
}
impl From<String> for Error {
    fn from(s: String) -> Self {
        Self::new(s)
    }
}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Self::new(e.to_string())
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::new("资料格式无效")
    }
}
pub(super) fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().unwrap_or("")
}
pub(super) fn number(value: &Value, key: &str) -> i64 {
    value[key].as_i64().unwrap_or(0)
}
pub(super) fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}

struct Preview {
    candidate: Value,
    options: Value,
    existing_id: i64,
    revision: i64,
    expires: Instant,
    prepared: Option<images::Prepared>,
}
#[derive(Default, Clone)]
pub struct NativeTmdb {
    previews: Arc<Mutex<HashMap<String, Preview>>>,
    requests: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}
#[tauri::command]
pub fn cancel_native_request(request_id: String, state: State<'_, NativeTmdb>) {
    if let Ok(mut requests) = state.requests.lock() {
        requests
            .entry(request_id)
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .store(true, Ordering::Relaxed);
    }
}
#[tauri::command]
pub async fn native_request(
    path: String,
    body: Value,
    method: String,
    request_id: String,
    state: State<'_, NativeTmdb>,
    data: State<'_, LocalData>,
) -> Result<Value> {
    let state = state.inner().clone();
    let data = data.inner().clone();
    let flag = {
        let mut requests = state
            .requests
            .lock()
            .map_err(|_| Error::new("请求状态不可用"))?;
        requests
            .entry(request_id.clone())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    };
    let state_for_worker = state.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        state_for_worker.dispatch(&data, &path, &method, body, flag)
    })
    .await
    .map_err(|_| Error::new("本地请求执行失败"));
    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(&request_id);
    }
    result?
}
impl NativeTmdb {
    fn previews(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, Preview>>> {
        self.previews
            .lock()
            .map_err(|_| Error::new("预览状态不可用"))
    }
    fn dispatch(
        &self,
        data: &LocalData,
        path: &str,
        method: &str,
        body: Value,
        cancelled: Arc<AtomicBool>,
    ) -> Result<Value> {
        if cancelled.load(Ordering::Relaxed) {
            return Err(Error::new("请求已取消"));
        }
        if path == "/tmdb/config" && method == "GET" {
            return Ok(json!({"default_available":false}));
        }
        if path.starts_with("/anime/") {
            let parts: Vec<_> = path.trim_matches('/').split('/').collect();
            let id = parts
                .get(1)
                .and_then(|v| v.parse::<i64>().ok())
                .filter(|id| *id > 0)
                .ok_or_else(|| Error::new("无效的 ID"))?;
            if parts.len() == 2 && method == "GET" {
                let conn = data.conn.lock().map_err(|_| Error::new("数据库不可用"))?;
                return Ok(serde_json::to_value(crate::local::get(&conn, id)?)?);
            }
            if parts.len() == 3 && parts[2] == "metadata" && method == "PUT" {
                return storage::edit(data, id, &body);
            }
        }
        if method != "POST" {
            return Err(Error::new("不支持的本地请求"));
        }
        if path == "/tmdb/import" {
            return self.import(data, body, cancelled);
        }
        let remote = Remote::new(body["options"].clone(), cancelled)?;
        match path {
            "/tmdb/validate" => {
                remote.get("/configuration", &[])?;
                Ok(json!({"valid":true}))
            }
            "/tmdb/search" => remote.search(&body),
            "/tmdb/seasons" => {
                let id = number(&body, "tmdb_id");
                if id <= 0 {
                    return Err(Error::new("作品 ID 无效"));
                }
                Ok(json!(client::seasons(&remote.work(
                    &format!("/tv/{id}"),
                    false,
                    ""
                )?)))
            }
            "/tmdb/preview" => self.preview(data, &remote, &body),
            _ => Err(Error::new("不支持的本地请求")),
        }
    }
    fn preview(&self, data: &LocalData, remote: &Remote, body: &Value) -> Result<Value> {
        let media = text(body, "media_type");
        let id = number(body, "tmdb_id");
        let season = body["season_number"].as_i64();
        let existing_id = number(body, "existing_id");
        let mut candidate = remote.details(media, id, season)?;
        let previous = text(body, "previous_token");
        if !previous.is_empty() {
            let previews = self.previews()?;
            let prior = previews
                .get(previous)
                .filter(|p| p.expires > Instant::now())
                .ok_or_else(|| Error::new("预览已过期，请重新获取资料"))?;
            if prior.existing_id != existing_id
                || prior.candidate["metadata"]["tmdb_id"] != id
                || prior.candidate["metadata"]["media_type"] != media
                || prior.candidate["metadata"]["season_number"] != body["season_number"]
            {
                return Err(Error::new("预览不匹配"));
            }
            let mut merged = prior.candidate.clone();
            for key in array(&body["retry_fields"]) {
                let key = key.as_str().ok_or_else(|| Error::new("无效的重试字段"))?;
                if key != "videos" {
                    return Err(Error::new("无效的重试字段"));
                }
                merged["metadata"][key] = candidate["metadata"][key].clone();
                merged["failed_fields"] = json!(array(&candidate["failed_fields"])
                    .iter()
                    .filter(|f| f.as_str() == Some(key))
                    .cloned()
                    .chain(
                        array(&prior.candidate["failed_fields"])
                            .iter()
                            .filter(|f| f.as_str() != Some(key))
                            .cloned()
                    )
                    .collect::<Vec<_>>());
                merged["warnings"] = json!(array(&prior.candidate["warnings"])
                    .iter()
                    .filter(|v| !v.as_str().unwrap_or("").contains("预告片"))
                    .cloned()
                    .chain(
                        array(&candidate["warnings"])
                            .iter()
                            .filter(|v| v.as_str().unwrap_or("").contains("预告片"))
                            .cloned()
                    )
                    .collect::<Vec<_>>());
            }
            let kind = text(body, "refresh_images");
            if !kind.is_empty() {
                if !["poster", "backdrop", "logo"].contains(&kind) {
                    return Err(Error::new("无效的图片类型"));
                }
                merged["images"][kind] = candidate["images"][kind].clone();
            }
            candidate = merged;
        }
        remote.check()?;
        let (existing, duplicate, possible) =
            storage::preview_records(data, existing_id, &candidate)?;
        let revision = existing.as_ref().map(|a| a.server_rev).unwrap_or(0);
        let token = Uuid::new_v4().to_string();
        let mut previews = self.previews()?;
        previews.retain(|_, p| p.expires > Instant::now());
        if previews.len() >= 100 {
            return Err(Error::new("预览过多，请关闭后稍候重试"));
        }
        previews.insert(
            token.clone(),
            Preview {
                candidate: candidate.clone(),
                options: remote.options.clone(),
                existing_id,
                revision,
                expires: Instant::now() + Duration::from_secs(1800),
                prepared: None,
            },
        );
        Ok(
            json!({"token":token,"candidate":candidate,"existing":existing,"duplicate":duplicate,"possible_duplicates":possible}),
        )
    }
    fn import(&self, data: &LocalData, body: Value, cancelled: Arc<AtomicBool>) -> Result<Value> {
        let token = text(&body, "token").to_owned();
        // Taking ownership prevents concurrent saves from consuming the same staged files.
        let mut preview = self
            .previews()?
            .remove(&token)
            .filter(|p| p.expires > Instant::now())
            .ok_or_else(|| Error::new("预览已过期或正在保存，请重新获取资料"))?;
        let outcome = (|| {
            let remote = Remote::new(preview.options.clone(), cancelled.clone())?;
            let mut fields: Vec<_> = array(&body["fields"])
                .iter()
                .filter_map(Value::as_str)
                .collect();
            fields.sort();
            fields.dedup();
            let signature =
                serde_json::to_string(&json!({"fields":fields,"images":body["images"]}))?;
            let doc = storage::import_document(data, &preview, &body)?;
            if preview
                .prepared
                .as_ref()
                .is_some_and(|p| p.signature != signature)
            {
                preview.prepared = None;
            }
            let mut prepared = match preview.prepared.take() {
                Some(p) => p,
                None => images::prepare(data, &remote, &preview.candidate, doc, &body, signature)?,
            };
            remote.check()?;
            if body["prepare_only"].as_bool().unwrap_or(false) {
                preview.prepared = Some(prepared);
                return Ok(json!({"ready":true}));
            }
            let saved =
                storage::save_import(data, &preview, &body, &prepared.document, &cancelled)?;
            prepared.files.clear();
            Ok(saved)
        })();
        if outcome.is_err() || body["prepare_only"].as_bool().unwrap_or(false) {
            self.previews()?.insert(token, preview);
        }
        outcome
    }
}
