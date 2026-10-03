use super::{array, number, text, Error, Result};
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::Read,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

#[derive(Clone)]
pub(super) struct Remote {
    pub options: Value,
    pub http: Client,
    pub cancelled: Arc<AtomicBool>,
}
impl Remote {
    pub fn new(mut options: Value, cancelled: Arc<AtomicBool>) -> Result<Self> {
        if text(&options, "credential_mode") == "server" {
            return Err(Error::new("原生 App 请填写个人 TMDb API Key／读取令牌"));
        }
        if text(&options, "key").trim().is_empty() {
            return Err(Error::new("请先在 API 设置中填写个人 Key"));
        }
        for (key, default) in [
            ("api_base", "https://api.themoviedb.org/3"),
            ("image_base", "https://image.tmdb.org/t/p"),
            ("language", "zh-CN"),
        ] {
            if text(&options, key).is_empty() {
                options[key] = json!(default);
            }
        }
        for key in ["api_base", "image_base"] {
            let base =
                reqwest::Url::parse(text(&options, key)).map_err(|_| Error::new("代理地址无效"))?;
            if !["http", "https"].contains(&base.scheme())
                || base.host_str().is_none()
                || !base.username().is_empty()
                || base.password().is_some()
                || base.query().is_some()
                || base.fragment().is_some()
            {
                return Err(Error::new(
                    "代理地址须为完整的 http(s) 基础地址，不含查询参数或账号",
                ));
            }
        }
        let http = Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| Error::new("无法初始化网络连接"))?;
        Ok(Self {
            options,
            http,
            cancelled,
        })
    }
    pub fn check(&self) -> Result<()> {
        if self.cancelled.load(Ordering::Relaxed) {
            return Err(Error::new("请求已取消"));
        }
        Ok(())
    }
    pub fn get(&self, path: &str, params: &[(&str, String)]) -> Result<Value> {
        self.check()?;
        let url = format!(
            "{}{}",
            text(&self.options, "api_base").trim_end_matches('/'),
            path
        );
        let key = text(&self.options, "key").trim();
        let mut request = self
            .http
            .get(url)
            .query(&[("language", text(&self.options, "language"))])
            .query(params);
        if key.contains('.') {
            request = request.bearer_auth(key);
        } else {
            request = request.query(&[("api_key", key)]);
        }
        let response = request
            .send()
            .map_err(|_| Error::new("TMDb 连接失败或超时，请检查网络与代理设置后重试"))?;
        let status = response.status().as_u16();
        if status != 200 {
            return Err(Error::new(match status {
                401 | 403 => "TMDb Key 无效或没有访问权限",
                429 => "TMDb 请求过于频繁，请稍后重试",
                404 => "TMDb 未找到作品或季度",
                _ => "TMDb 请求失败，请稍后重试",
            }));
        }
        let mut bytes = Vec::new();
        response
            .take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::new("TMDb 资料读取失败"))?;
        self.check()?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(Error::new("TMDb 资料超过大小限制"));
        }
        serde_json::from_slice(&bytes).map_err(|_| Error::new("TMDb 返回的资料格式无效"))
    }
    pub fn image_url(&self, path: &str, size: &str) -> String {
        if !valid_image_path(path) {
            return String::new();
        }
        format!(
            "{}/{size}{path}",
            text(&self.options, "image_base").trim_end_matches('/')
        )
    }
    pub fn work(&self, path: &str, append: bool, original_language: &str) -> Result<Value> {
        let mut params = vec![];
        if append {
            params.push(("append_to_response", "credits,images,videos".to_string()));
            params.push((
                "include_image_language",
                format!(
                    "{},en,ja,null",
                    text(&self.options, "language")
                        .split('-')
                        .next()
                        .unwrap_or("zh")
                ),
            ));
        }
        let mut work = match self.get(path, &params) {
            Ok(v) => v,
            Err(_) if append => self.get(path, &[])?,
            Err(e) => return Err(e),
        };
        if append {
            for section in ["credits", "images", "videos"] {
                if !work[section].is_object() {
                    match self.get(&format!("{path}/{section}"), &[]) {
                        Ok(v) => work[section] = v,
                        Err(_) => work[format!("_failed_{section}")] = json!(true),
                    }
                }
            }
        }
        let missing = text(&work, "overview").is_empty()
            || array(&work["episodes"])
                .iter()
                .chain(array(&work["seasons"]).iter())
                .any(|v| text(v, "overview").is_empty());
        let language = if original_language.is_empty() {
            text(&work, "original_language")
        } else {
            original_language
        };
        let language = if language.is_empty() {
            "en-US"
        } else {
            language
        };
        if missing && language != text(&self.options, "language") {
            let mut fallback = self.clone();
            fallback.options["language"] = json!(language);
            if let Ok(original) = fallback.get(path, &[]) {
                for key in ["overview", "title", "name"] {
                    if text(&work, key).is_empty() {
                        work[key] = original[key].clone();
                    }
                }
                for (group, id) in [("episodes", "episode_number"), ("seasons", "season_number")] {
                    if let Some(items) = work[group].as_array_mut() {
                        for item in items {
                            if let Some(other) =
                                array(&original[group]).iter().find(|v| v[id] == item[id])
                            {
                                for key in ["overview", "name"] {
                                    if text(item, key).is_empty() {
                                        item[key] = other[key].clone();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(work)
    }
    pub fn search(&self, body: &Value) -> Result<Value> {
        let category = text(body, "category");
        if !["anime", "tv", "movie"].contains(&category) {
            return Err(Error::new("无效的作品分类"));
        }
        let media = if category == "movie" { "movie" } else { "tv" };
        let page = body["page"].as_i64().unwrap_or(1);
        if !(1..=500).contains(&page) {
            return Err(Error::new("页码须为 1–500"));
        }
        let query = text(body, "query").trim();
        let path = format!(
            "/{}/{media}",
            if query.is_empty() {
                "discover"
            } else {
                "search"
            }
        );
        let mut params = vec![
            ("page", page.to_string()),
            ("include_adult", "false".into()),
        ];
        if !query.is_empty() {
            params.push(("query", query.into()));
        } else {
            params.push(("sort_by", "popularity.desc".into()));
            if category == "anime" {
                params.push(("with_genres", "16".into()));
                params.push(("with_origin_country", "JP".into()));
            }
        }
        let out = self.get(&path, &params)?;
        let results:Vec<Value>=array(&out["results"]).iter().filter(|w|{
            let anime=array(&w["genre_ids"]).contains(&json!(16)) && array(&w["origin_country"]).contains(&json!("JP"));
            media=="movie" || (category=="anime" && anime) || (category=="tv" && !anime)
        }).map(|w|json!({"id":w["id"],"title":title(w),"date":date(w),"overview":text(w,"overview"),"poster":self.image_url(text(w,"poster_path"),"w342"),"media_type":media})).collect();
        Ok(
            json!({"page":page,"total_pages":number(&out,"total_pages").min(500),"results":results,"filtered":media=="tv"}),
        )
    }
    pub fn details(&self, media: &str, id: i64, season: Option<i64>) -> Result<Value> {
        if !["movie", "tv"].contains(&media)
            || id <= 0
            || season.is_some_and(|s| s < 0 || media != "tv")
        {
            return Err(Error::new("作品标识无效"));
        }
        let path = format!("/{media}/{id}");
        let work = self.work(&path, true, "")?;
        let mut metadata = json!({"tmdb_id":id,"media_type":media,"season_number":season,"language":text(&self.options,"language"),"overview":text(&work,"overview"),"release_date":date(&work),"original_title":if media=="movie"{text(&work,"original_title")}else{text(&work,"original_name")},"runtime":if media=="movie"{number(&work,"runtime")}else{0},"episode_count":number(&work,"number_of_episodes"),"episode_runtime":work["episode_run_time"][0].as_i64().unwrap_or(0),"season_count":number(&work,"number_of_seasons"),"season_name":"","collection":text(&work["belongs_to_collection"],"name"),"backdrop":"","logo":"","cast":people(&work["credits"]["cast"],"character"),"crew":people(&work["credits"]["crew"],"job"),"creators":people(&work["created_by"],"creator"),"seasons":seasons(&work),"episodes":[],"videos":videos(&work["videos"])});
        for key in [
            "status",
            "tagline",
            "original_language",
            "last_air_date",
            "homepage",
        ] {
            metadata[key] = json!(text(&work, key));
        }
        for key in ["vote_count", "budget", "revenue"] {
            metadata[key] = json!(number(&work, key));
        }
        metadata["vote_average"] = json!(work["vote_average"].as_f64().unwrap_or(0.0));
        for (target, source) in [
            ("genres", "genres"),
            ("companies", "production_companies"),
            ("networks", "networks"),
            ("countries", "production_countries"),
            ("spoken_languages", "spoken_languages"),
        ] {
            metadata[target] = json!(array(&work[source])
                .iter()
                .map(|v| text(v, "name").to_owned())
                .collect::<Vec<_>>());
        }
        if array(&metadata["countries"]).is_empty() {
            metadata["countries"] = json!(array(&work["origin_country"]));
        }
        let mut warnings = vec![];
        let mut failed = vec![];
        if work["_failed_credits"] == true {
            warnings.push(json!("演职员资料未获取，可重试"));
            failed.extend([json!("cast"), json!("crew")]);
        }
        if work["_failed_images"] == true {
            warnings.push(json!("图片候选未完整获取，可重试"));
        }
        if work["_failed_videos"] == true {
            warnings.push(json!("预告片未获取，可重试"));
            failed.push(json!("videos"));
        }
        let mut poster_work = work.clone();
        let mut display = title(&work).to_owned();
        if media == "tv" {
            if let Some(n) = season {
                let sw = self.work(
                    &format!("/tv/{id}/season/{n}"),
                    true,
                    text(&work, "original_language"),
                )?;
                let name = if text(&sw, "name").is_empty() {
                    if n == 0 {
                        "特别篇".to_string()
                    } else {
                        format!("第 {n} 季")
                    }
                } else {
                    text(&sw, "name").into()
                };
                display = format!("{display} · {name}");
                metadata["season_name"] = json!(name);
                metadata["overview"] = json!(text(&sw, "overview"));
                metadata["release_date"] = json!(text(&sw, "air_date"));
                metadata["episode_count"] = json!(array(&sw["episodes"]).len());
                metadata["episodes"] = json!(episodes(&sw));
                metadata["seasons"] = json!([{"number":n,"name":text(&sw,"name"),"overview":text(&sw,"overview"),"air_date":text(&sw,"air_date"),"episode_count":array(&sw["episodes"]).len()}]);
                if !array(&sw["credits"]["cast"]).is_empty() {
                    metadata["cast"] = json!(people(&sw["credits"]["cast"], "character"));
                }
                if !text(&sw, "poster_path").is_empty()
                    || !array(&sw["images"]["posters"]).is_empty()
                {
                    poster_work = sw;
                }
            } else {
                metadata["episode_count"] = json!(array(&work["seasons"])
                    .iter()
                    .filter(|s| number(s, "season_number") > 0)
                    .map(|s| number(s, "episode_count"))
                    .sum::<i64>());
                let season_numbers: Vec<i64> = array(&work["seasons"])
                    .iter()
                    .map(|s| number(s, "season_number"))
                    .collect();
                let mut all = vec![];
                for chunk in season_numbers.chunks(4) {
                    let original_language = text(&work, "original_language");
                    let results = std::thread::scope(|scope| {
                        let handles: Vec<_> = chunk
                            .iter()
                            .map(|n| {
                                scope.spawn(move || {
                                    self.work(
                                        &format!("/tv/{id}/season/{n}"),
                                        false,
                                        original_language,
                                    )
                                })
                            })
                            .collect();
                        handles
                            .into_iter()
                            .map(|h| {
                                h.join()
                                    .unwrap_or_else(|_| Err(Error::new("季度资料获取失败")))
                            })
                            .collect::<Vec<_>>()
                    });
                    for result in results {
                        match result {
                            Ok(sw) => all.extend(episodes(&sw)),
                            Err(_) => {
                                warnings.push(json!("单集摘要未完整获取，可重新获取"));
                                if !failed.contains(&json!("episodes")) {
                                    failed.push(json!("episodes"));
                                }
                            }
                        }
                    }
                }
                all.sort_by_key(|e| (number(e, "season_number"), number(e, "number")));
                metadata["episodes"] = json!(all);
            }
        }
        let mut images = json!({});
        for kind in ["poster", "backdrop", "logo"] {
            let w = if kind == "poster" {
                &poster_work
            } else {
                &work
            };
            let group = format!("{kind}s");
            let mut paths = vec![];
            if kind != "logo" {
                paths.push(text(w, &format!("{kind}_path")).to_owned());
            }
            paths.extend(
                array(&w["images"][&group])
                    .iter()
                    .map(|v| text(v, "file_path").into()),
            );
            let mut seen = HashSet::new();
            images[kind]=json!(paths.into_iter().filter(|p|valid_image_path(p)&&seen.insert(p.clone())).take(12).map(|p|json!({"path":p,"url":self.image_url(&p,if kind=="logo"{"original"}else{"w500"})})).collect::<Vec<_>>());
        }
        Ok(
            json!({"title":display,"metadata":metadata,"images":images,"warnings":warnings,"failed_fields":failed}),
        )
    }
}
pub(super) fn valid_image_path(path: &str) -> bool {
    path.len() > 1
        && path.starts_with('/')
        && path.matches('/').count() == 1
        && !path.contains("..")
        && !path.contains(['?', '#', '\\'])
}
fn title(w: &Value) -> &str {
    if text(w, "title").is_empty() {
        text(w, "name")
    } else {
        text(w, "title")
    }
}
fn date(w: &Value) -> &str {
    if text(w, "release_date").is_empty() {
        text(w, "first_air_date")
    } else {
        text(w, "release_date")
    }
}
pub(super) fn seasons(w: &Value) -> Vec<Value> {
    array(&w["seasons"]).iter().map(|s|json!({"season_number":number(s,"season_number"),"number":number(s,"season_number"),"name":text(s,"name"),"overview":text(s,"overview"),"air_date":text(s,"air_date"),"episode_count":number(s,"episode_count")})).collect()
}
fn people(list: &Value, role: &str) -> Vec<Value> {
    array(list).iter().map(|p|json!({"id":number(p,"id"),"name":text(p,"name"),"role":if role=="creator"{"创作者"}else{text(p,role)},"photo":text(p,"profile_path"),"department":text(p,"department")})).collect()
}
fn episodes(w: &Value) -> Vec<Value> {
    array(&w["episodes"]).iter().map(|e|json!({"id":number(e,"id"),"number":number(e,"episode_number"),"season_number":number(e,"season_number"),"name":text(e,"name"),"overview":text(e,"overview"),"air_date":text(e,"air_date"),"runtime":number(e,"runtime"),"still":text(e,"still_path"),"vote_average":e["vote_average"].as_f64().unwrap_or(0.0),"vote_count":number(e,"vote_count"),"production_code":text(e,"production_code"),"guest_stars":people(&e["guest_stars"],"character"),"crew":people(&e["crew"],"job")})).collect()
}
fn videos(v: &Value) -> Vec<Value> {
    array(&v["results"]).iter().map(|v|json!({"name":text(v,"name"),"site":text(v,"site"),"key":text(v,"key"),"type":text(v,"type"),"language":text(v,"iso_639_1"),"official":v["official"].as_bool().unwrap_or(false)})).collect()
}
