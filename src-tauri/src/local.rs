use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::State;
use uuid::Uuid;

pub struct LocalData {
    conn: Mutex<Connection>,
    dir: PathBuf,
}

impl LocalData {
    pub fn open(dir: PathBuf) -> rusqlite::Result<Self> {
        let conn = Connection::open(dir.join("anime.db"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS anime (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'wantwatch',
                rating INTEGER NOT NULL DEFAULT 0,
                note TEXT NOT NULL DEFAULT '',
                poster TEXT NOT NULL DEFAULT '',
                watch_date TEXT NOT NULL DEFAULT '',
                play_link TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL DEFAULT 0,
                leaderboard_position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT NOT NULL DEFAULT '',
                server_rev INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_anime_server_rev ON anime(server_rev);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS rev (id INTEGER PRIMARY KEY CHECK (id = 1), current INTEGER NOT NULL DEFAULT 0);
            INSERT OR IGNORE INTO rev (id, current) VALUES (1, 0);
            INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '2');",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
            dir,
        })
    }
}

#[derive(Clone, Serialize)]
pub struct Anime {
    id: i64,
    uid: String,
    title: String,
    category: String,
    rating: i64,
    note: String,
    poster: String,
    watch_date: String,
    play_link: String,
    position: i64,
    leaderboard_position: i64,
    created_at: String,
    updated_at: String,
    deleted_at: String,
    server_rev: i64,
}

#[derive(Deserialize)]
pub struct AnimeInput {
    title: String,
    category: String,
    rating: i64,
    note: String,
    poster: String,
    watch_date: String,
    play_link: String,
}

#[derive(Deserialize)]
pub struct AnimePatch {
    title: Option<String>,
    category: Option<String>,
    rating: Option<i64>,
    note: Option<String>,
    poster: Option<String>,
    watch_date: Option<String>,
    play_link: Option<String>,
}

#[derive(Deserialize)]
pub struct PositionItem {
    id: i64,
    position: i64,
}

const COLUMNS: &str = "id, uid, title, category, rating, note, poster, watch_date, play_link, position, leaderboard_position, created_at, updated_at, deleted_at, server_rev";

fn scan(row: &Row<'_>) -> rusqlite::Result<Anime> {
    Ok(Anime {
        id: row.get(0)?,
        uid: row.get(1)?,
        title: row.get(2)?,
        category: row.get(3)?,
        rating: row.get(4)?,
        note: row.get(5)?,
        poster: row.get(6)?,
        watch_date: row.get(7)?,
        play_link: row.get(8)?,
        position: row.get(9)?,
        leaderboard_position: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        deleted_at: row.get(13)?,
        server_rev: row.get(14)?,
    })
}

fn now() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn valid_category(value: &str) -> bool {
    matches!(value, "watched" | "watching" | "wantwatch")
}

fn valid_watch_date(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    let bytes = value.as_bytes();
    bytes.len() == 7
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || b.is_ascii_digit())
        && matches!(
            &value[5..],
            "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12"
        )
}

fn validate(input: &mut AnimeInput) -> Result<(), String> {
    input.title = input.title.trim().to_string();
    input.play_link = input.play_link.trim().to_string();
    if input.title.is_empty() || input.title.chars().count() > 200 {
        return Err("片名不能为空且不能超过 200 字".into());
    }
    if !valid_category(&input.category) {
        return Err("无效的分类".into());
    }
    if !(0..=10).contains(&input.rating) {
        return Err("评分范围为 0–10".into());
    }
    if input.note.chars().count() > 500 {
        return Err("短评不能超过 500 字".into());
    }
    if !valid_watch_date(&input.watch_date) {
        return Err("观看年月格式应为 YYYY-MM".into());
    }
    if !input.play_link.is_empty()
        && (!input.play_link.starts_with("http://") && !input.play_link.starts_with("https://")
            || input.play_link.len() > 2000)
    {
        return Err("播放链接必须以 http:// 或 https:// 开头，最长 2000 字符".into());
    }
    Ok(())
}

fn get(conn: &Connection, id: i64) -> Result<Anime, String> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM anime WHERE id=?1 AND deleted_at=''"),
        [id],
        scan,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "番剧不存在".into())
}

fn max_position(
    tx: &Transaction<'_>,
    column: &str,
    category: Option<&str>,
) -> rusqlite::Result<i64> {
    let sql = match (column, category) {
        ("position", Some(_)) => {
            "SELECT COALESCE(MAX(position), -1)+1 FROM anime WHERE category=?1 AND deleted_at=''"
        }
        _ => "SELECT COALESCE(MAX(leaderboard_position), -1)+1 FROM anime WHERE deleted_at=''",
    };
    match category {
        Some(category) if column == "position" => tx.query_row(sql, [category], |r| r.get(0)),
        _ => tx.query_row(sql, [], |r| r.get(0)),
    }
}

fn shift_month(tx: &Transaction<'_>, category: &str, date: &str) -> rusqlite::Result<()> {
    tx.execute("UPDATE anime SET position=position+1, updated_at=?1, server_rev=0 WHERE category=?2 AND watch_date=?3 AND deleted_at=''", params![now(), category, date])?;
    Ok(())
}

fn compact(tx: &Transaction<'_>, category: &str) -> rusqlite::Result<()> {
    let ids = {
        let mut stmt = tx.prepare(
            "SELECT id FROM anime WHERE category=?1 AND deleted_at='' ORDER BY position, id",
        )?;
        let rows = stmt.query_map([category], |r| r.get::<_, i64>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    for (position, id) in ids.iter().enumerate() {
        tx.execute("UPDATE anime SET position=?1, updated_at=?2, server_rev=0 WHERE id=?3 AND position<>?1", params![position as i64, now(), id])?;
    }
    Ok(())
}

fn store_poster(dir: &PathBuf, poster: &str, uid: &str) -> Result<String, String> {
    if poster.is_empty() {
        return Ok(String::new());
    }
    if poster.contains('/') || poster.contains('\\') || poster.contains("..") {
        return Err("无效的海报文件名".into());
    }
    let ext = PathBuf::from(poster)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif") {
        return Err("不支持的海报格式".into());
    }
    let target = format!("{uid}.{ext}");
    if poster == target {
        return Ok(target);
    }
    let folder = dir.join("posters");
    let source = folder.join(poster);
    if !source.is_file() {
        return Err("海报文件不存在".into());
    }
    fs::copy(&source, folder.join(&target)).map_err(|e| e.to_string())?;
    fs::remove_file(source).map_err(|e| e.to_string())?;
    Ok(target)
}

#[tauri::command]
pub fn list_anime(
    category: Option<String>,
    state: State<'_, LocalData>,
) -> Result<Vec<Anime>, String> {
    if let Some(ref category) = category {
        if !valid_category(category) {
            return Err("无效的分类".into());
        }
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let sql = if category.is_some() {
        format!("SELECT {COLUMNS} FROM anime WHERE deleted_at='' AND category=?1 ORDER BY watch_date DESC, position ASC, created_at DESC")
    } else {
        format!("SELECT {COLUMNS} FROM anime WHERE deleted_at='' ORDER BY rating DESC, leaderboard_position DESC")
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = match category {
        Some(category) => stmt.query_map([category], scan),
        None => stmt.query_map([], scan),
    }
    .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_anime(id: i64, state: State<'_, LocalData>) -> Result<Anime, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    get(&conn, id)
}

#[tauri::command]
pub fn create_anime(mut input: AnimeInput, state: State<'_, LocalData>) -> Result<Anime, String> {
    validate(&mut input)?;
    let uid = Uuid::new_v4().to_string();
    input.poster = store_poster(&state.dir, &input.poster, &uid)?;
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let position = if input.watch_date.is_empty() {
        max_position(&tx, "position", Some(&input.category)).map_err(|e| e.to_string())?
    } else {
        shift_month(&tx, &input.category, &input.watch_date).map_err(|e| e.to_string())?;
        0
    };
    let leader = max_position(&tx, "leaderboard_position", None).map_err(|e| e.to_string())?;
    let time = now();
    tx.execute("INSERT INTO anime (uid,title,category,rating,note,poster,watch_date,play_link,position,leaderboard_position,created_at,updated_at,deleted_at,server_rev) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11,'',0)",
        params![uid, input.title, input.category, input.rating, input.note, input.poster, input.watch_date, input.play_link, position, leader, time]
    ).map_err(|e| e.to_string())?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(|e| e.to_string())?;
    get(&conn, id)
}

#[tauri::command]
pub fn update_anime(
    id: i64,
    input: AnimePatch,
    state: State<'_, LocalData>,
) -> Result<Anime, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut old = get(&conn, id)?;
    let old_category = old.category.clone();
    let old_date = old.watch_date.clone();
    if let Some(value) = input.title {
        old.title = value;
    }
    if let Some(value) = input.category {
        old.category = value;
    }
    if let Some(value) = input.rating {
        old.rating = value;
    }
    if let Some(value) = input.note {
        old.note = value;
    }
    if let Some(value) = input.poster {
        old.poster = value;
    }
    if let Some(value) = input.watch_date {
        old.watch_date = value;
    }
    if let Some(value) = input.play_link {
        old.play_link = value;
    }
    let mut merged = AnimeInput {
        title: old.title,
        category: old.category,
        rating: old.rating,
        note: old.note,
        poster: old.poster,
        watch_date: old.watch_date,
        play_link: old.play_link,
    };
    validate(&mut merged)?;
    merged.poster = store_poster(&state.dir, &merged.poster, &old.uid)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut position = old.position;
    if merged.category != old_category {
        position = if merged.watch_date.is_empty() {
            max_position(&tx, "position", Some(&merged.category)).map_err(|e| e.to_string())?
        } else {
            shift_month(&tx, &merged.category, &merged.watch_date).map_err(|e| e.to_string())?;
            0
        };
    } else if merged.watch_date != old_date && !merged.watch_date.is_empty() {
        shift_month(&tx, &merged.category, &merged.watch_date).map_err(|e| e.to_string())?;
        position = 0;
    }
    tx.execute("UPDATE anime SET title=?1,category=?2,rating=?3,note=?4,poster=?5,watch_date=?6,play_link=?7,position=?8,updated_at=?9,server_rev=0 WHERE id=?10 AND deleted_at=''",
        params![merged.title, merged.category, merged.rating, merged.note, merged.poster, merged.watch_date, merged.play_link, position, now(), id]
    ).map_err(|e| e.to_string())?;
    if merged.category != old_category {
        compact(&tx, &old_category).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    get(&conn, id)
}

#[tauri::command]
pub fn delete_anime(id: i64, state: State<'_, LocalData>) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let old = get(&conn, id)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let time = now();
    tx.execute(
        "UPDATE anime SET deleted_at=?1,updated_at=?1,server_rev=0 WHERE id=?2",
        params![time, id],
    )
    .map_err(|e| e.to_string())?;
    compact(&tx, &old.category).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_anime(
    scope: String,
    items: Vec<PositionItem>,
    state: State<'_, LocalData>,
) -> Result<(), String> {
    if items.is_empty() {
        return Err("排序列表不能为空".into());
    }
    let column = match scope.as_str() {
        "home" | "" => "position",
        "leaderboard" => "leaderboard_position",
        _ => return Err("无效的排序范围".into()),
    };
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let sql = format!(
        "UPDATE anime SET {column}=?1,updated_at=?2,server_rev=0 WHERE id=?3 AND deleted_at=''"
    );
    let time = now();
    for item in items {
        if tx
            .execute(&sql, params![item.position, time, item.id])
            .map_err(|e| e.to_string())?
            != 1
        {
            return Err(format!("番剧 {} 不存在", item.id));
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upload_poster(
    filename: String,
    bytes: Vec<u8>,
    state: State<'_, LocalData>,
) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("海报大小必须在 10MB 以内".into());
    }
    let ext = PathBuf::from(filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let valid = match ext.as_str() {
        "jpg" | "jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        _ => false,
    };
    if !valid {
        return Err("不支持的图片格式或文件内容无效".into());
    }
    let folder = state.dir.join("posters");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let name = format!("pending-{}.{}", Uuid::new_v4(), ext);
    fs::write(folder.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command]
pub fn poster_directory(state: State<'_, LocalData>) -> Result<String, String> {
    let path = state.dir.join("posters");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
