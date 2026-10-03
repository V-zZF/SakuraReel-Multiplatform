use super::*;
use crate::local;
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    thread,
};

struct Database(PathBuf);
impl Database {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("sakurareel-native-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn open(&self) -> LocalData {
        LocalData::open(self.0.clone()).unwrap()
    }
}
impl Drop for Database {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
struct Fixture {
    url: String,
    calls: Arc<Mutex<Vec<String>>>,
    broken: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Fixture {
    fn new() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let calls = Arc::new(Mutex::new(vec![]));
        let broken = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let calls = calls.clone();
            let broken = broken.clone();
            let stop = stop.clone();
            thread::spawn(move || {
                let mut workers = vec![];
                while !stop.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let calls = calls.clone();
                            let broken = broken.clone();
                            workers.push(thread::spawn(move||{
                    stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();let mut bytes=[0;8192];let n=stream.read(&mut bytes).unwrap_or(0);let line=String::from_utf8_lossy(&bytes[..n]);let path=line.split_whitespace().nth(1).unwrap_or("/").to_string();calls.lock().unwrap().push(path.clone());
                    let path=path.split('?').next().unwrap_or("/");
                    let (status,body)=if path.contains("/images/") {
                        thread::sleep(Duration::from_millis(10));
                        if path.ends_with("shared.png")&&broken.load(Ordering::Relaxed){(502,vec![])}else{(200,b"\x89PNG\r\n\x1a\nfixture".to_vec())}
                    } else {(200,serde_json::to_vec(&route(path)).unwrap())};
                    let _=write!(stream,"HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());let _=stream.write_all(&body);
                }));
                        }
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(2))
                        }
                        Err(_) => break,
                    }
                }
                for worker in workers {
                    worker.join().unwrap();
                }
            })
        };
        Self {
            url,
            calls,
            broken,
            stop,
            thread: Some(thread),
        }
    }
    fn options(&self) -> Value {
        json!({"key":"fixture-key","api_base":self.url,"image_base":format!("{}/images",self.url),"language":"zh-CN"})
    }
    fn downloads(&self) -> usize {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|p| p.contains("/images/"))
            .count()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            t.join().unwrap();
        }
    }
}
fn route(path: &str) -> Value {
    let person = json!({"id":1,"name":"共同演员","character":"角色","job":"导演","profile_path":"/shared.png"});
    let credits = json!({"cast":[person.clone()],"crew":[person.clone()]});
    let episode = json!({"id":12,"episode_number":1,"season_number":1,"name":"第一集","overview":"单集简介","air_date":"2026-01-02","runtime":24,"still_path":"/still.png","guest_stars":[person.clone()],"crew":[person]});
    if path == "/configuration" {
        return json!({});
    }
    if path.contains("/discover/") || path.contains("/search/") {
        return json!({"total_pages":3,"results":[{"id":10,"name":"番剧","genre_ids":[16],"origin_country":["JP"],"poster_path":"/poster.png"},{"id":11,"name":"节目","genre_ids":[18],"origin_country":["JP"]}]});
    }
    if path.contains("/season/") {
        return json!({"name":"第一季","overview":"季度简介","air_date":"2026-01-01","poster_path":"/season.png","credits":credits,"images":{"posters":[{"file_path":"/season.png"}]},"videos":{"results":[]},"episodes":[episode]});
    }
    json!({"id":10,"title":"电影标题","name":"剧集标题","original_title":"Original movie","original_name":"Original TV","original_language":"zh-CN","overview":"作品简介","release_date":"2026-01-01","first_air_date":"2026-01-01","runtime":120,"number_of_episodes":1,"number_of_seasons":1,"episode_run_time":[24],"poster_path":"/poster.png","backdrop_path":"/backdrop.png","credits":credits,"created_by":[{"id":1,"name":"共同演员","profile_path":"/shared.png"}],"genres":[{"id":16,"name":"动画"}],"production_companies":[{"name":"公司"}],"origin_country":["JP"],"images":{"posters":[{"file_path":"/poster.png"}],"backdrops":[{"file_path":"/backdrop.png"}],"logos":[{"file_path":"/logo.png"}]},"videos":{"results":[{"name":"预告片","site":"YouTube","key":"video123","type":"Trailer"}]},"seasons":[{"season_number":0,"name":"特别篇","episode_count":1},{"season_number":1,"name":"第一季","episode_count":1}]})
}
fn request(state: &NativeTmdb, data: &LocalData, path: &str, body: Value) -> Result<Value> {
    state.dispatch(data, path, "POST", body, Arc::new(AtomicBool::new(false)))
}
fn preview(
    state: &NativeTmdb,
    data: &LocalData,
    fixture: &Fixture,
    media: &str,
    season: Value,
    id: i64,
) -> Value {
    request(state,data,"/tmdb/preview",json!({"options":fixture.options(),"media_type":media,"tmdb_id":10,"season_number":season,"existing_id":id})).unwrap()
}
#[test]
fn native_import_is_local_atomic_and_reuses_prepared_images() {
    let folder = Database::new();
    let data = folder.open();
    let state = NativeTmdb::default();
    let fixture = Fixture::new();
    let config = state
        .dispatch(
            &data,
            "/tmdb/config",
            "GET",
            Value::Null,
            Arc::new(AtomicBool::new(false)),
        )
        .unwrap();
    assert_eq!(config["default_available"], false);
    request(
        &state,
        &data,
        "/tmdb/validate",
        json!({"options":fixture.options()}),
    )
    .unwrap();
    let search = request(
        &state,
        &data,
        "/tmdb/search",
        json!({"options":fixture.options(),"category":"anime","query":"作品","page":1}),
    )
    .unwrap();
    assert_eq!(array(&search["results"]).len(), 1);
    let p = preview(&state, &data, &fixture, "movie", Value::Null, 0);
    let mut payload = json!({"token":p["token"],"category":"watched","fields":["title","overview","runtime","cast","crew","creators","videos"],"images":{"poster":"/poster.png","backdrop":"/backdrop.png","logo":"/logo.png"},"personal":{"title":"自定义标题","rating":8,"note":"我的短评","watch_date":"2026-01","play_link":"https://example.org/watch"},"prepare_only":true});
    request(&state, &data, "/tmdb/import", payload.clone()).unwrap();
    assert_eq!(fixture.downloads(), 4);
    assert_eq!(
        data.conn
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM anime", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    payload["prepare_only"] = json!(false);
    let saved = request(&state, &data, "/tmdb/import", payload.clone()).unwrap();
    assert_eq!(fixture.downloads(), 4);
    assert_eq!(saved["title"], "自定义标题");
    assert_eq!(saved["rating"], 8);
    assert_eq!(saved["metadata"]["overview"], "作品简介");
    assert_eq!(saved["metadata"]["runtime"], 120);
    assert_eq!(
        saved["metadata"]["cast"][0]["photo"],
        saved["metadata"]["creators"][0]["photo"]
    );
    for filename in [
        text(&saved, "poster"),
        text(&saved["metadata"], "backdrop"),
        text(&saved["metadata"], "logo"),
        text(&saved["metadata"]["cast"][0], "photo"),
    ] {
        assert!(!filename.contains('/'));
        assert!(folder.0.join("posters").join(filename).is_file());
    }
    assert_eq!(
        text(&saved, "poster"),
        format!("{}.png", text(&saved, "uid"))
    );
    let duplicate = preview(&state, &data, &fixture, "movie", Value::Null, 0);
    assert_eq!(duplicate["duplicate"]["id"], saved["id"]);
    payload["token"] = duplicate["token"].clone();
    assert_eq!(
        request(&state, &data, "/tmdb/import", payload.clone())
            .unwrap_err()
            .existing_id,
        saved["id"].as_i64()
    );
    let update = preview(
        &state,
        &data,
        &fixture,
        "movie",
        Value::Null,
        number(&saved, "id"),
    );
    let updated=request(&state,&data,"/tmdb/import",json!({"token":update["token"],"fields":["release_date"],"images":{},"category":"wantwatch"})).unwrap();
    for key in [
        "title",
        "category",
        "rating",
        "note",
        "watch_date",
        "play_link",
        "poster",
    ] {
        assert_eq!(updated[key], saved[key]);
    }
    assert_eq!(updated["metadata"]["cast"], saved["metadata"]["cast"]);
    let stale=state.dispatch(&data,&format!("/anime/{}/metadata",saved["id"]),"PUT",json!({"title":"过期","poster":saved["poster"],"fields":{},"expected_rev":saved["server_rev"]}),Arc::new(AtomicBool::new(false))).unwrap_err();
    assert!(stale.error.contains("记录已变化"));
    let edited = state.dispatch(&data, &format!("/anime/{}/metadata", saved["id"]), "PUT", json!({"title":"编辑资料","poster":updated["poster"],"fields":{"overview":"本地编辑简介","runtime":121},"expected_rev":updated["server_rev"]}), Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(edited["metadata"]["overview"], "本地编辑简介");
    assert_eq!(edited["rating"], saved["rating"]);
    let tampered = state.dispatch(&data, &format!("/anime/{}/metadata", saved["id"]), "PUT", json!({"title":"编辑资料","poster":edited["poster"],"fields":{"tmdb_id":999},"expected_rev":edited["server_rev"]}), Arc::new(AtomicBool::new(false)));
    assert!(tampered.is_err());
    drop(fixture);
    drop(data);
    let reopened = folder.open();
    let offline = state
        .dispatch(
            &reopened,
            &format!("/anime/{}", saved["id"]),
            "GET",
            Value::Null,
            Arc::new(AtomicBool::new(false)),
        )
        .unwrap();
    assert_eq!(offline["metadata"], edited["metadata"]);
    assert!(!fs::read(folder.0.join("anime.db"))
        .unwrap()
        .windows(b"fixture-key".len())
        .any(|w| w == b"fixture-key"));
}
#[test]
fn seasons_episodes_failures_and_cancelled_imports() {
    let folder = Database::new();
    let data = folder.open();
    let state = NativeTmdb::default();
    let fixture = Fixture::new();
    let seasons = request(
        &state,
        &data,
        "/tmdb/seasons",
        json!({"options":fixture.options(),"tmdb_id":10}),
    )
    .unwrap();
    assert_eq!(array(&seasons).len(), 2);
    let p = preview(&state, &data, &fixture, "tv", json!(1), 0);
    assert_eq!(p["candidate"]["metadata"]["episode_count"], 1);
    assert_eq!(p["candidate"]["metadata"]["season_name"], "第一季");
    let payload = json!({"token":p["token"],"category":"wantwatch","fields":["title","episodes","cast"],"images":{"poster":"/season.png"}});
    fixture.broken.store(true, Ordering::Relaxed);
    let error = request(&state, &data, "/tmdb/import", payload.clone()).unwrap_err();
    let failures = error.image_errors.unwrap();
    assert!(failures.contains_key("cast") && failures.contains_key("episodes"));
    assert_eq!(fixture.downloads(), 3);
    assert_eq!(fs::read_dir(folder.0.join("posters")).unwrap().count(), 0);
    fixture.broken.store(false, Ordering::Relaxed);
    let cancelled = Arc::new(AtomicBool::new(true));
    assert!(state
        .dispatch(&data, "/tmdb/import", "POST", payload.clone(), cancelled)
        .is_err());
    assert_eq!(fixture.downloads(), 3);
    let saved = request(&state, &data, "/tmdb/import", payload).unwrap();
    assert!(text(&saved["metadata"]["episodes"][0], "still").ends_with(".png"));
    assert_eq!(
        saved["metadata"]["episodes"][0]["guest_stars"][0]["photo"],
        saved["metadata"]["cast"][0]["photo"]
    );
    let whole = preview(&state, &data, &fixture, "tv", Value::Null, 0);
    assert_eq!(whole["candidate"]["metadata"]["episode_count"], 1);
    assert_eq!(array(&whole["candidate"]["metadata"]["episodes"]).len(), 2);
}
#[test]
fn migration_preserves_existing_personal_records() {
    let folder = Database::new();
    let conn = rusqlite::Connection::open(folder.0.join("anime.db")).unwrap();
    conn.execute_batch("CREATE TABLE anime(id INTEGER PRIMARY KEY,uid TEXT UNIQUE,title TEXT,category TEXT,rating INTEGER,note TEXT,poster TEXT,watch_date TEXT,play_link TEXT,position INTEGER,leaderboard_position INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT,server_rev INTEGER);INSERT INTO anime VALUES(1,'legacy','旧收藏','watched',9,'旧短评','','2025-12','',0,0,'2025-12-01','2025-12-01','',0);").unwrap();
    drop(conn);
    let data = folder.open();
    let a = local::get(&data.conn.lock().unwrap(), 1).unwrap();
    assert_eq!(a.title, "旧收藏");
    assert_eq!(a.rating, 9);
    assert_eq!(a.note, "旧短评");
    assert_eq!(a.metadata, json!({}));
    drop(data);
    folder.open();
}
