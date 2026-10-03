import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Anime, Person } from "../../types";
import { posterUrl } from "../../data";
import {
  emptyValue,
  fieldLabels,
  formatValue,
  safeURL,
  statusLabel,
  videoURL,
  webRequest,
} from "../../data/tmdb";
import Surface from "./Surface";
import { captureSurfaceOrigin } from "./surfaceOrigin";
import Icon from "./Icon";
import { totalRuntime } from "../../data/runtime";
import MetadataEditor from "./MetadataEditor";
import TMDbSearch from "./TMDbSearch";
function People({ people }: { people: Person[] }) {
  return (
    <div className="tmdb-people">
      {people.map((p, i) => (
        <div key={`${p.id}-${i}`} className="tmdb-person">
          {p.photo ? (
            <img src={posterUrl(p.photo)} alt={p.name} loading="lazy" />
          ) : (
            <div className="tmdb-person-placeholder">
              <Icon name="person" />
            </div>
          )}
          <div>
            <strong>{p.name}</strong>
            <small>{p.role}</small>
            {p.department && <small>{p.department}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}
export default function WorkDetail({
  anime,
  onClose,
  onPersonalEdit,
  onChanged,
  onOpen,
}: {
  anime: Anime;
  onClose: () => void;
  onPersonalEdit: (a: Anime, field?: string) => void;
  onChanged: (a: Anime) => void;
  onOpen: (a: Anime) => void;
}) {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(anime);
  const [mode, setMode] = useState<"view" | "edit" | "tmdb">("view");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const click = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", click);
    return () => document.removeEventListener("pointerdown", click);
  }, [menu]);
  useEffect(() => {
    setCurrent(anime);
  }, [anime]);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    webRequest<Anime>(`/anime/${anime.id}`, undefined, "GET", c.signal)
      .then((a) => {
        if (!c.signal.aborted) setCurrent(a);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "读取详情失败");
      });
    return () => c.abort();
  }, [anime.id, retry]);
  const m = current.metadata;
  const runtime = totalRuntime(m);
  const source = m?.tmdb_id
    ? `https://www.themoviedb.org/${m.media_type}/${m.tmdb_id}${m.season_number !== null ? `/season/${m.season_number}` : ""}`
    : "";
  const scope =
    m?.media_type === "tv" && m.season_number !== null
      ? m.season_name ||
        (m.season_number === 0 ? "特别篇" : `第 ${m.season_number} 季`)
      : "";
  function saved(a: Anime) {
    captureSurfaceOrigin(
      document.querySelector<HTMLElement>(
        ".tmdb-footer .tmdb-primary,.tmdb-footer .tmdb-primary",
      ),
    );
    setCurrent(a);
    onChanged(a);
    setMode("view");
  }
  function edit(next: "edit" | "tmdb") {
    captureSurfaceOrigin();
    setMenu(false);
    setMode(next);
  }
  async function share() {
    const content = {
      title: current.title,
      text: current.title,
      ...(source ? { url: source } : {}),
    };
    try {
      if (navigator.share) {
        await navigator.share(content);
      } else {
        await navigator.clipboard.writeText(
          [current.title, source].filter(Boolean).join("\n"),
        );
        setNotice("作品信息已复制");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setNotice("分享失败，请稍后重试");
    }
  }
  const editor = (
    <MetadataEditor
      key="metadata-editor"
      anime={current}
      onClose={() => {
        captureSurfaceOrigin();
        setMode("view");
      }}
      onSaved={saved}
    />
  );
  const search = (
    <TMDbSearch
      key="linked-search"
      existing={current}
      onClose={() => {
        captureSurfaceOrigin();
        setMode("view");
      }}
      onManual={() => setMode("edit")}
      onSaved={saved}
      onOpen={(a) => {
        setMode("view");
        onOpen(a);
      }}
    />
  );
  const infoKeys = [
    "original_title",
    "season_name",
    "release_date",
    "last_air_date",
    "status",
    "genres",
    "original_language",
    "spoken_languages",
    "countries",
    "episode_count",
    "episode_runtime",
    "season_count",
    "runtime",
    "vote_average",
    "vote_count",
    "companies",
    "networks",
    "collection",
    "budget",
    "revenue",
    "homepage",
  ];
  return (
    <motion.div
      className="tmdb-work-stack"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
    >
      <AnimatePresence mode="wait">
        {mode === "edit" ? (
          editor
        ) : mode === "tmdb" ? (
          search
        ) : (
          <Surface
            key="detail"
            title="作品详情"
            onClose={onClose}
            pageKey="detail"
            bare
          >
            <div
              className={`tmdb-detail-hero ${m?.backdrop ? "tmdb-has-backdrop" : ""}`}
            >
              {m?.backdrop && (
                <img
                  className="tmdb-detail-backdrop"
                  src={posterUrl(m.backdrop)}
                  alt="作品背景"
                />
              )}
              <div className="tmdb-detail-heading">
                {!m?.backdrop && current.poster && (
                  <img
                    className="tmdb-detail-poster"
                    src={posterUrl(current.poster)}
                    alt={`${current.title}海报`}
                  />
                )}
                {m?.logo ? (
                  <>
                    <img
                      className="tmdb-detail-logo"
                      src={posterUrl(m.logo)}
                      alt={current.title}
                    />
                    <h1 className="tmdb-visually-hidden">{current.title}</h1>
                  </>
                ) : (
                  <h1>{current.title}</h1>
                )}
                {scope && <span className="tmdb-detail-scope">{scope}</span>}
                <p>
                  {[
                    m?.release_date,
                    m?.media_type === "movie"
                      ? m.runtime
                        ? `${m.runtime} 分钟`
                        : ""
                      : m?.episode_count
                        ? `${m.episode_count} 集`
                        : "",
                    m?.status
                      ? `${scope ? "整剧：" : ""}${statusLabel(m.status)}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "本地作品资料"}
                </p>
                {!!m?.genres?.length && (
                  <p className="tmdb-detail-genres">{m.genres.join("，")}</p>
                )}
              </div>
              <div className="tmdb-detail-actions">
                <button
                  className="tmdb-round"
                  aria-label="官网"
                  title="官网"
                  disabled={!safeURL(m?.homepage) && !source}
                  onClick={() =>
                    window.open(
                      safeURL(m?.homepage) || source,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <Icon name="compass" />
                </button>
                <button
                  className="tmdb-round"
                  aria-label="分享作品"
                  title="分享"
                  onClick={() => void share()}
                >
                  <Icon name="share" />
                </button>
                <button
                  className="tmdb-round"
                  aria-label="播放"
                  title="播放"
                  disabled={!safeURL(current.play_link)}
                  onClick={() =>
                    window.open(
                      safeURL(current.play_link),
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <Icon name="film" />
                </button>
                <div
                  className="tmdb-menu-anchor"
                  ref={menuRef}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setMenu(false);
                    }
                  }}
                >
                  <button
                    className="tmdb-round"
                    aria-label="更多操作"
                    title="更多"
                    aria-expanded={menu}
                    onClick={() => setMenu((v) => !v)}
                  >
                    <Icon name="more" />
                  </button>
                  {menu && (
                    <motion.div
                      className="tmdb-menu"
                      initial={
                        reduced ? false : { opacity: 0, scale: 0.94, y: -6 }
                      }
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.16 }}
                      style={{ transformOrigin: "top right" }}
                    >
                      <button
                        onClick={() => {
                          setMenu(false);
                          onPersonalEdit(current);
                        }}
                      >
                        <Icon name="person" />
                        编辑个人记录
                      </button>
                      <button onClick={() => edit("edit")}>
                        <Icon name="edit" />
                        编辑作品资料
                      </button>
                      <button onClick={() => edit("tmdb")}>
                        <Icon name="retry" />
                        {m?.tmdb_id ? "从 TMDb 更新" : "搜索并关联 TMDb"}
                      </button>
                      {safeURL(current.play_link) ? (
                        <a
                          href={safeURL(current.play_link)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="link" />
                          打开播放链接 ↗
                        </a>
                      ) : (
                        <button
                          onClick={() => {
                            setMenu(false);
                            onPersonalEdit(current);
                          }}
                        >
                          <Icon name="plus" />
                          添加播放链接
                        </button>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
            <div className="tmdb-body tmdb-detail-body">
              {notice && (
                <p role="status" className="tmdb-info">
                  {notice}
                </p>
              )}
              {error && (
                <div className="tmdb-error">
                  {error}
                  <button onClick={() => setRetry((v) => v + 1)}>重试</button>
                </div>
              )}
              <dl className="tmdb-stats">
                {[
                  [
                    "star",
                    current.rating ? String(current.rating) : "未评分",
                    "我的评分",
                  ],
                  [
                    "calendar",
                    current.watch_date
                      ? current.watch_date.replace(
                          /^(\d{4})-(\d{2})$/,
                          (_, y, month) => `${y}年 ${Number(month)}月`,
                        )
                      : "未设置",
                    "观看年月",
                  ],
                  ["clock", runtime.text, "总时长"],
                ].map(([icon, value, label]) => (
                  <div
                    key={label}
                    role={label === "总时长" ? undefined : "button"}
                    tabIndex={label === "总时长" ? undefined : 0}
                    aria-label={label === "总时长" ? undefined : `编辑${label}`}
                    onClick={
                      label === "总时长"
                        ? undefined
                        : () => onPersonalEdit(current, label)
                    }
                    onKeyDown={
                      label === "总时长"
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onPersonalEdit(current, label);
                            }
                          }
                    }
                  >
                    <Icon name={icon} />
                    <dd>
                      {label === "观看年月" && value.includes(" ") ? (
                        <>
                          {value.split(" ")[0]}{" "}
                          <span className="tmdb-nowrap">
                            {value.split(" ")[1]}
                          </span>
                        </>
                      ) : (
                        value
                      )}
                    </dd>
                    <dt>{label}</dt>
                  </div>
                ))}
              </dl>
              <section
                className="tmdb-section tmdb-card tmdb-note-edit"
                role="button"
                tabIndex={0}
                aria-label="编辑短评"
                onClick={() => onPersonalEdit(current, "短评")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onPersonalEdit(current, "短评");
                  }
                }}
              >
                <h3>
                  <Icon name="note" />
                  短评
                </h3>
                <p>{current.note || "还没有写短评"}</p>
              </section>
              <section className="tmdb-section tmdb-card">
                <h3>
                  <Icon name="text" />
                  作品简介
                </h3>
                {m?.tagline && <p className="tmdb-tagline">{m.tagline}</p>}
                <p>{m?.overview || "暂无简介，可手动编辑或从 TMDb 获取"}</p>
              </section>
              <section className="tmdb-section tmdb-card">
                <h3>
                  <Icon name="text" />
                  作品资料
                </h3>
                <dl className="tmdb-info-grid">
                  {infoKeys.map((key) => {
                    const value = m?.[key as keyof typeof m];
                    if (emptyValue(value)) return null;
                    return (
                      <div key={key}>
                        <dt>{fieldLabels[key]}</dt>
                        <dd>
                          {key === "homepage" && safeURL(String(value)) ? (
                            <a
                              href={safeURL(String(value))}
                              target="_blank"
                              rel="noreferrer"
                            >
                              访问官方网站 ↗
                            </a>
                          ) : key === "status" ? (
                            statusLabel(String(value))
                          ) : (
                            formatValue(value)
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {runtime.basis && (
                  <p className="tmdb-muted">时长估算：{runtime.basis}</p>
                )}
                {!m && <p className="tmdb-muted">尚未添加作品资料。</p>}
              </section>
              {(
                [
                  ["creators", "创作者"],
                  ["cast", "演员"],
                  ["crew", "制作人员"],
                ] as const
              ).map(([key, label]) =>
                m?.[key]?.length ? (
                  <section className="tmdb-section tmdb-card" key={key}>
                    <h3>
                      <Icon name="person" />
                      {label}
                    </h3>
                    <People people={m[key].slice(0, 6)} />
                    {m[key].length > 6 && (
                      <details className="tmdb-expand">
                        <summary>查看全部 {m[key].length} 人</summary>
                        <People people={m[key].slice(6)} />
                      </details>
                    )}
                  </section>
                ) : null,
              )}
              {!!m?.seasons?.length && (
                <section className="tmdb-section tmdb-card">
                  <h3>
                    <Icon name="calendar" />
                    季度与单集
                  </h3>
                  {m.seasons.map((s) => (
                    <details className="tmdb-episode" key={s.number}>
                      <summary>
                        {s.number === 0
                          ? "特别篇"
                          : s.name || `第 ${s.number} 季`}{" "}
                        · {s.episode_count} 集 · {s.air_date || "日期未知"}
                      </summary>
                      <p>{s.overview || "暂无季度摘要"}</p>
                      {m.episodes
                        ?.filter((e) => e.season_number === s.number)
                        .map((e) => (
                          <details className="tmdb-episode" key={e.number}>
                            <summary>
                              第 {e.number} 集 · {e.name} ·{" "}
                              {e.air_date || "日期未知"}
                              {e.runtime ? ` · ${e.runtime} 分钟` : ""}
                            </summary>
                            <p>{e.overview || "暂无单集摘要"}</p>
                            {e.still && (
                              <img
                                className="tmdb-episode-still"
                                src={posterUrl(e.still)}
                                alt={e.name}
                                loading="lazy"
                              />
                            )}
                            {!!e.vote_average && (
                              <p className="tmdb-muted">
                                TMDb 评分 {e.vote_average} · {e.vote_count || 0}{" "}
                                人评分
                              </p>
                            )}
                            {e.production_code && (
                              <p className="tmdb-muted">
                                制作编号：{e.production_code}
                              </p>
                            )}
                            {!!e.guest_stars?.length && (
                              <>
                                <h4>客串演员</h4>
                                <People people={e.guest_stars} />
                              </>
                            )}
                            {!!e.crew?.length && (
                              <>
                                <h4>本集制作人员</h4>
                                <People people={e.crew} />
                              </>
                            )}
                          </details>
                        ))}
                    </details>
                  ))}
                </section>
              )}
              {scope && (
                <p className="tmdb-muted tmdb-caption">
                  类型、作品状态、电视网、评分来自整剧；季度日期、简介、集数与单集资料对应当前季度。
                </p>
              )}
              {!!m?.videos?.length && (
                <section className="tmdb-section tmdb-card">
                  <h3>
                    <Icon name="image" />
                    预告片与视频
                  </h3>
                  {m.videos.map((v, i) => (
                    <div className="tmdb-archive-row" key={`${v.key}-${i}`}>
                      <strong>{v.name}</strong>
                      <p className="tmdb-muted">
                        {[v.type, v.site, v.language, v.official ? "官方" : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {videoURL(v) ? (
                        <a href={videoURL(v)} target="_blank" rel="noreferrer">
                          观看视频 ↗
                        </a>
                      ) : (
                        <p className="tmdb-muted">
                          {v.site} · {v.key}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <p className="tmdb-attribution">
                已保存的本地资料
                {source ? (
                  <>
                    {" "}
                    ·{" "}
                    <a href={source} target="_blank" rel="noreferrer">
                      TMDb 来源 ↗
                    </a>
                  </>
                ) : (
                  " · 尚未关联 TMDb"
                )}
                <br />
                本产品使用 TMDb API，但未经 TMDb 认可或认证。
              </p>
            </div>
          </Surface>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
