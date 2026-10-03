use super::{array, number, text, Error, Preview, Result};
use crate::local::{self, Anime, AnimeInput, LocalData};
use chrono::NaiveDate;
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;

const FIELDS: &[&str] = &[
    "overview",
    "release_date",
    "original_title",
    "companies",
    "cast",
    "crew",
    "seasons",
    "episodes",
    "runtime",
    "episode_count",
    "episode_runtime",
    "backdrop",
    "logo",
    "season_name",
    "genres",
    "status",
    "tagline",
    "original_language",
    "countries",
    "spoken_languages",
    "last_air_date",
    "season_count",
    "vote_average",
    "vote_count",
    "budget",
    "revenue",
    "collection",
    "networks",
    "creators",
    "homepage",
    "keywords",
    "aliases",
    "translations",
    "certifications",
    "external_ids",
    "videos",
];
fn lock(data: &LocalData) -> Result<std::sync::MutexGuard<'_, rusqlite::Connection>> {
    data.conn.lock().map_err(|_| Error::new("数据库不可用"))
}
fn duplicate(conn: &rusqlite::Connection, metadata: &Value, exclude: i64) -> Result<Option<Anime>> {
    if number(metadata, "tmdb_id") <= 0 {
        return Ok(None);
    }
    let id=conn.query_row("SELECT id FROM anime WHERE deleted_at='' AND id<>?1 AND json_extract(metadata,'$.media_type')=?2 AND json_extract(metadata,'$.tmdb_id')=?3 AND COALESCE(json_extract(metadata,'$.season_number'),-1)=?4",params![exclude,text(metadata,"media_type"),number(metadata,"tmdb_id"),metadata["season_number"].as_i64().unwrap_or(-1)],|r|r.get::<_,i64>(0)).optional()?;
    id.map(|id| local::get(conn, id).map_err(Error::from))
        .transpose()
}
pub(super) fn preview_records(
    data: &LocalData,
    id: i64,
    candidate: &Value,
) -> Result<(Option<Anime>, Option<Anime>, Vec<Anime>)> {
    let conn = lock(data)?;
    let existing = if id > 0 {
        Some(local::get(&conn, id)?)
    } else {
        None
    };
    let duplicate = duplicate(&conn, &candidate["metadata"], 0)?;
    let mut possible = vec![];
    if id == 0 {
        let mut stmt=conn.prepare("SELECT id FROM anime WHERE deleted_at='' AND COALESCE(json_extract(metadata,'$.tmdb_id'),0)=0 AND lower(trim(title))=lower(trim(?1))")?;
        let ids = stmt
            .query_map([text(candidate, "title")], |r| r.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for id in ids {
            possible.push(local::get(&conn, id)?);
        }
    }
    Ok((existing, duplicate, possible))
}
fn check_revision(data: &LocalData, preview: &Preview) -> Result<Option<Anime>> {
    let conn = lock(data)?;
    if preview.existing_id == 0 {
        if let Some(a) = duplicate(&conn, &preview.candidate["metadata"], 0)? {
            return Err(Error {
                error: "作品已收藏，请打开已有收藏".into(),
                existing_id: Some(a.id),
                image_errors: None,
            });
        }
        return Ok(None);
    }
    let a = local::get(&conn, preview.existing_id)?;
    if a.server_rev != preview.revision {
        return Err(Error::new("记录已变化，请重新预览后保存"));
    }
    Ok(Some(a))
}
fn personal(body: &Value, title: &str) -> Result<AnimeInput> {
    let p = &body["personal"];
    let mut input = AnimeInput {
        title: if p.is_object() {
            text(p, "title").into()
        } else {
            title.into()
        },
        category: text(body, "category").into(),
        rating: number(p, "rating"),
        note: text(p, "note").trim().into(),
        poster: String::new(),
        watch_date: text(p, "watch_date").into(),
        play_link: text(p, "play_link").into(),
    };
    local::validate(&mut input)?;
    Ok(input)
}
pub(super) fn import_document(data: &LocalData, preview: &Preview, body: &Value) -> Result<Value> {
    let old = check_revision(data, preview)?;
    if old.is_none() {
        personal(body, text(&preview.candidate, "title"))?;
    }
    let mut metadata = old
        .as_ref()
        .map(|a| a.metadata.clone())
        .unwrap_or(json!({}));
    if !metadata.is_object() {
        metadata = json!({});
    }
    let source = &preview.candidate["metadata"];
    for key in ["tmdb_id", "media_type", "season_number", "language"] {
        metadata[key] = source[key].clone();
    }
    let mut title = old
        .as_ref()
        .map(|a| a.title.clone())
        .unwrap_or_else(|| text(&preview.candidate, "title").into());
    let fields = body["fields"]
        .as_array()
        .ok_or_else(|| Error::new("导入字段格式无效"))?;
    for key in fields {
        let key = key.as_str().ok_or_else(|| Error::new("导入字段无效"))?;
        if array(&preview.candidate["failed_fields"]).contains(&json!(key)) {
            return Err(Error::new("此资料尚未完整获取，请重试后导入"));
        }
        if key == "title" {
            title = text(&preview.candidate, "title").into();
            continue;
        }
        if !FIELDS.contains(&key) || ["backdrop", "logo"].contains(&key) {
            return Err(Error::new("无效的导入字段"));
        }
        metadata[key] = source[key].clone();
    }
    Ok(
        json!({"title":title,"poster":old.as_ref().map(|a|a.poster.clone()).unwrap_or_default(),"metadata":metadata,"new":old.is_none(),"uid":old.as_ref().map(|a|a.uid.clone()).unwrap_or_else(||Uuid::new_v4().to_string())}),
    )
}
fn local_name(s: &str) -> bool {
    !s.is_empty() && s.len() < 200 && !s.contains(['/', '\\']) && s != "." && s != ".."
}
fn valid_images(value: &Value) -> bool {
    match value {
        Value::Object(map) => map.iter().all(|(key, value)| {
            if ["photo", "still", "backdrop", "logo"].contains(&key.as_str()) {
                value.as_str().is_none_or(|s| s.is_empty() || local_name(s))
            } else {
                valid_images(value)
            }
        }),
        Value::Array(items) => items.iter().all(valid_images),
        _ => true,
    }
}
fn validate_metadata(metadata: &Value) -> Result<()> {
    if !metadata.is_object() || !valid_images(metadata) {
        return Err(Error::new("资料格式或本地图片文件名无效"));
    }
    let media = text(metadata, "media_type");
    let id = number(metadata, "tmdb_id");
    if id < 0
        || (!media.is_empty() && !matches!(media, "movie" | "tv"))
        || (id > 0 && media.is_empty())
        || metadata["season_number"]
            .as_i64()
            .is_some_and(|n| n < 0 || media != "tv")
    {
        return Err(Error::new("作品来源信息无效"));
    }
    for key in [
        "runtime",
        "episode_count",
        "episode_runtime",
        "season_count",
        "vote_count",
        "budget",
        "revenue",
    ] {
        if !metadata[key].is_null() && metadata[key].as_i64().is_none_or(|n| n < 0) {
            return Err(Error::new("时长、集数或统计值须为非负整数"));
        }
    }
    if !metadata["vote_average"].is_null()
        && metadata["vote_average"]
            .as_f64()
            .is_none_or(|n| !(0.0..=10.0).contains(&n))
    {
        return Err(Error::new("TMDb 评分范围为 0–10"));
    }
    for key in ["release_date", "last_air_date"] {
        let date = text(metadata, key);
        if !date.is_empty()
            && (date.len() != 10 || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err())
        {
            return Err(Error::new("日期格式无效"));
        }
    }
    if text(metadata, "overview").len() > 100000 {
        return Err(Error::new("简介过长"));
    }
    for key in [
        "companies",
        "cast",
        "crew",
        "creators",
        "seasons",
        "episodes",
        "genres",
        "countries",
        "spoken_languages",
        "networks",
        "keywords",
        "aliases",
        "translations",
        "certifications",
        "external_ids",
        "videos",
    ] {
        if !metadata[key].is_null() && !metadata[key].is_array() {
            return Err(Error::new("列表资料格式无效"));
        }
    }
    for item in array(&metadata["seasons"])
        .iter()
        .chain(array(&metadata["episodes"]).iter())
    {
        for key in ["number", "season_number", "runtime", "episode_count"] {
            if !item[key].is_null() && item[key].as_i64().is_none_or(|n| n < 0) {
                return Err(Error::new("季度或单集资料格式无效"));
            }
        }
        let date = text(item, "air_date");
        if !date.is_empty()
            && (date.len() != 10 || NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err())
        {
            return Err(Error::new("季度或单集日期无效"));
        }
    }
    Ok(())
}
pub(super) fn save_import(
    data: &LocalData,
    preview: &Preview,
    body: &Value,
    document: &Value,
    cancelled: &AtomicBool,
) -> Result<Value> {
    let input = if preview.existing_id == 0 {
        Some(personal(body, text(document, "title"))?)
    } else {
        None
    };
    save(
        data,
        preview.existing_id,
        preview.revision,
        text(document, "title"),
        text(document, "poster"),
        &document["metadata"],
        input,
        text(document, "uid"),
        cancelled,
    )
}
pub(super) fn edit(data: &LocalData, id: i64, body: &Value) -> Result<Value> {
    let old = {
        let conn = lock(data)?;
        local::get(&conn, id)?
    };
    let mut metadata = old.metadata.clone();
    if !metadata.is_object() {
        metadata = json!({});
    }
    let fields = body["fields"]
        .as_object()
        .ok_or_else(|| Error::new("资料字段无效"))?;
    for (key, value) in fields {
        if !FIELDS.contains(&key.as_str()) || key == "external_ids" {
            return Err(Error::new("不允许编辑此资料字段"));
        }
        metadata[key] = value.clone();
    }
    save(
        data,
        id,
        number(body, "expected_rev"),
        text(body, "title"),
        text(body, "poster"),
        &metadata,
        None,
        &old.uid,
        &AtomicBool::new(false),
    )
}
#[allow(clippy::too_many_arguments)]
fn save(
    data: &LocalData,
    id: i64,
    revision: i64,
    title: &str,
    poster: &str,
    metadata: &Value,
    personal: Option<AnimeInput>,
    uid: &str,
    cancelled: &AtomicBool,
) -> Result<Value> {
    let title = title.trim();
    if title.is_empty()
        || title.chars().count() > 200
        || (!poster.is_empty() && !local_name(poster))
    {
        return Err(Error::new("片名或图片文件名无效"));
    }
    validate_metadata(metadata)?;
    let mut conn = lock(data)?;
    let tx = conn.transaction()?;
    if id > 0 {
        let a = local::get(&tx, id)?;
        if a.server_rev != revision {
            return Err(Error::new("记录已变化，请重新预览后保存"));
        }
    }
    if let Some(a) = duplicate(&tx, metadata, id)? {
        return Err(Error {
            error: "作品已收藏，请打开已有收藏".into(),
            existing_id: Some(a.id),
            image_errors: None,
        });
    }
    if cancelled.load(Ordering::Relaxed) {
        return Err(Error::new("请求已取消"));
    }
    let time = local::now();
    let encoded = serde_json::to_string(metadata)?;
    let saved_id = if id > 0 {
        tx.execute("UPDATE anime SET title=?1,poster=?2,metadata=?3,updated_at=?4,server_rev=0,local_revision=local_revision+1 WHERE id=?5 AND deleted_at=''",params![title,poster,encoded,time,id])?;
        id
    } else {
        let p = personal.ok_or_else(|| Error::new("个人记录缺失"))?;
        let position = if p.watch_date.is_empty() {
            local::max_position(&tx, "position", Some(&p.category))?
        } else {
            local::shift_month(&tx, &p.category, &p.watch_date)?;
            0
        };
        let leader = local::max_position(&tx, "leaderboard_position", None)?;
        tx.execute("INSERT INTO anime(uid,title,category,rating,note,poster,watch_date,play_link,metadata,position,leaderboard_position,created_at,updated_at,local_revision) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,1)",params![uid,p.title,p.category,p.rating,p.note,poster,p.watch_date,p.play_link,encoded,position,leader,time])?;
        tx.last_insert_rowid()
    };
    tx.commit()?;
    Ok(serde_json::to_value(local::get(&conn, saved_id)?)?)
}
