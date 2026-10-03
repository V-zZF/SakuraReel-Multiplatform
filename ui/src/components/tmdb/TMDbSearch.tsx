import AnimeModal from "../AnimeModal";
import { useEffect, useRef, useState } from "react";
import type { Anime, AnimeInput, WorkMetadata } from "../../types";
import {
  emptyValue,
  fieldGroups,
  fieldLabels,
  formatValue,
  loadOptions,
  saveOptions,
  statusLabel,
  webRequest,
  WebAPIError,
} from "../../data/tmdb";
import type {
  Preview,
  SearchHit,
  SearchPage,
  TMDbOptions,
} from "../../data/tmdb";
import Segmented from "./Segmented";
import Surface, { UnsavedDialog } from "./Surface";
import { captureSurfaceOrigin } from "./surfaceOrigin";
import Icon from "./Icon";
import { fieldIcon } from "./fieldIcons";
import { useUnsaved } from "./useUnsaved";
interface Props {
  existing?: Anime;
  onClose: () => void;
  onManual: () => void;
  onSaved: (a: Anime) => void;
  onOpen: (a: Anime) => void;
}
type Stage =
  | "guide"
  | "settings"
  | "language"
  | "search"
  | "seasons"
  | "preview";
type SeasonHit = {
  season_number: number;
  name: string;
  air_date: string;
  episode_count: number;
};
const languages = [
  ["zh-CN", "简体中文"],
  ["zh-TW", "繁體中文"],
  ["ja-JP", "日本語"],
  ["en-US", "English"],
];
function selectionSnapshot(
  selected: string[],
  images: Record<string, string>,
  watchState: string,
) {
  return JSON.stringify({
    selected: [...selected].sort(),
    images: Object.fromEntries(
      Object.entries(images).sort(([a], [b]) => a.localeCompare(b)),
    ),
    watchState,
  });
}
export default function TMDbSearch({
  existing,
  onClose,
  onManual,
  onSaved,
  onOpen,
}: Props) {
  const [options, setOptions] = useState<TMDbOptions>(loadOptions);
  const [savedOptions, setSavedOptions] = useState(options);
  const usable = (o: TMDbOptions) =>
    o.credential_mode === "server" || !!o.key.trim();
  const [stage, setStage] = useState<Stage>(
    usable(options) ? "search" : "guide",
  );
  const [direction, setDirection] = useState(1);
  const [returnStage, setReturnStage] = useState<Stage>("search");
  const [available, setAvailable] = useState(false);
  const [category, setCategory] = useState("anime");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [results, setResults] = useState<SearchPage | null>(null);
  const [hit, setHit] = useState<SearchHit | null>(null);
  const [seasons, setSeasons] = useState<SeasonHit[] | null>(null);
  const [scope, setScope] = useState("season");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [watchState, setWatchState] = useState("wantwatch");
  const [preparing, setPreparing] = useState(false);
  const prepareRequest = useRef<AbortController | null>(null);
  const preparation = useRef<Promise<unknown>>(Promise.resolve());
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordInitial, setRecordInitial] = useState<AnimeInput>();
  const [draft, setDraft] = useState<AnimeInput>();
  const [dirtyDraft, setDirtyDraft] = useState(false);
  const drafts = useRef(new Map<string, AnimeInput>());
  const draftBaselines = useRef(new Map<string, string>());
  const draftKey = useRef("");
  const chosenSeason = useRef<number | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({});
  const [conflictID, setConflictID] = useState<number>();
  const request = useRef<AbortController | null>(null);
  const initialized = useRef(false);
  const searchScroll = useRef(0);
  const searchCache = useRef<{ key: string; data: SearchPage } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cache = useRef(
    new Map<
      string,
      {
        preview: Preview;
        selected: string[];
        images: Record<string, string>;
        baseline: string;
        watchState: string;
      }
    >(),
  );
  const pending = useRef<() => void>(onClose);
  const optionsOnly = useRef(false);
  const snapshot = selectionSnapshot(selected, images, watchState);
  const dirtyOptions = JSON.stringify(options) !== JSON.stringify(savedOptions);
  const dirtyPreview =
    !!preview && !!baseline && (snapshot !== baseline || dirtyDraft);
  const { confirm, setConfirm } = useUnsaved(
    dirtyOptions || dirtyPreview,
    busy,
    onClose,
  );
  function leave(action: () => void, onlyOptions = false) {
    if (busy) return;
    pending.current = action;
    optionsOnly.current = onlyOptions;
    if (dirtyOptions || (!onlyOptions && dirtyPreview)) setConfirm(true);
    else action();
  }
  function move(next: Stage, backwards = false) {
    setDirection(backwards ? -1 : 1);
    if (stage === "search")
      searchScroll.current = scrollRef.current?.scrollTop || 0;
    setStage(next);
    setError("");
    setLoading(false);
    request.current?.abort();
  }
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop =
        stage === "search" ? searchScroll.current : 0;
  }, [stage]);
  useEffect(() => {
    const controller = new AbortController();
    webRequest<{ default_available: boolean }>(
      "/tmdb/config",
      undefined,
      "GET",
      controller.signal,
    )
      .then((c) => setAvailable(c.default_available))
      .catch(() => {});
    return () => {
      controller.abort();
      request.current?.abort();
      prepareRequest.current?.abort();
    };
  }, []);
  function start() {
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    setLoading(true);
    setError("");
    setConflictID(undefined);
    return c;
  }
  function showError(e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    setError(e instanceof Error ? e.message : "网络请求失败，请重试");
    if (e instanceof WebAPIError) {
      setImageErrors(e.image_errors || {});
      setConflictID(e.existing_id);
    }
  }
  function persist(o: TMDbOptions) {
    saveOptions(o);
    setOptions(o);
    setSavedOptions(o);
  }
  async function validate(o = options, after?: () => void) {
    setBusy(true);
    setError("");
    let success = false;
    try {
      await webRequest("/tmdb/validate", { options: o });
      persist(o);
      success = true;
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
    if (success) {
      if (after) after();
      else move(returnStage === "guide" ? "search" : returnStage);
    }
  }
  const cacheKey = (item: SearchHit, season: number | null) =>
    JSON.stringify([savedOptions, item.media_type, item.id, season]);
  function remember() {
    if (preview && hit)
      cache.current.set(
        cacheKey(hit, preview.candidate.metadata.season_number),
        { preview, selected, images, baseline, watchState },
      );
  }
  async function getPreview(
    item: SearchHit,
    season: number | null,
    refresh = false,
    retryFields?: string[],
    refreshImages?: string,
  ) {
    remember();
    chosenSeason.current = season;
    move("preview");
    setHit(item);
    if (!existing && !refresh) {
      draftKey.current = cacheKey(item, season);
      const prior = drafts.current.get(draftKey.current);
      const initial: AnimeInput = prior || {
        title:
          item.title +
          (season === null
            ? ""
            : ` · ${season === 0 ? "特别篇" : `第 ${season} 季`}`),
        category: "wantwatch",
        rating: 0,
        note: "",
        poster: "",
        watch_date: "",
        play_link: "",
      };
      setRecordInitial(initial);
      setDraft(prior);
      if (!draftBaselines.current.has(draftKey.current))
        draftBaselines.current.set(draftKey.current, JSON.stringify(initial));
      setDirtyDraft(
        !!prior &&
          JSON.stringify(prior) !==
            draftBaselines.current.get(draftKey.current),
      );
    }
    const remembered = cache.current.get(cacheKey(item, season));
    if (remembered && !refresh) {
      setPreview(remembered.preview);
      setSelected(remembered.selected);
      setImages(remembered.images);
      setBaseline(remembered.baseline);
      setWatchState(remembered.watchState);
      return;
    }
    const c = start();
    if (!refresh) setPreview(null);
    try {
      const out = await webRequest<Preview>(
        "/tmdb/preview",
        {
          options: savedOptions,
          media_type: item.media_type,
          tmdb_id: item.id,
          season_number: season,
          existing_id: existing?.id || 0,
          ...(refresh && remembered && (retryFields?.length || refreshImages)
            ? {
                previous_token: remembered.preview.token,
                retry_fields: retryFields,
                refresh_images: refreshImages,
              }
            : {}),
        },
        "POST",
        c.signal,
      );
      if (c.signal.aborted) return;
      setPreview(out);
      setImageErrors({});
      const current = out.existing;
      const keys =
        refresh && remembered
          ? remembered.selected
          : Object.keys(fieldLabels).filter((key) => {
              const value =
                key === "title"
                  ? out.candidate.title
                  : out.candidate.metadata[key as keyof WorkMetadata];
              const old =
                key === "title"
                  ? current?.title
                  : current?.metadata?.[key as keyof WorkMetadata];
              return (
                !emptyValue(value) &&
                (!current || emptyValue(old)) &&
                !out.candidate.failed_fields?.includes(key) &&
                !(
                  key === "episodes" &&
                  out.candidate.warnings.some((w) => w.includes("单集"))
                )
              );
            });
      const choices: Record<string, string> =
        refresh && remembered ? { ...remembered.images } : {};
      for (const kind of ["poster", "backdrop", "logo"]) {
        const old =
          kind === "poster"
            ? current?.poster
            : current?.metadata?.[kind as "backdrop" | "logo"];
        const candidates = out.candidate.images[kind] || [];
        if (refresh) {
          if (
            choices[kind] &&
            !candidates.some((i) => i.path === choices[kind])
          )
            delete choices[kind];
        } else if (emptyValue(old) && candidates.length)
          choices[kind] = candidates[0].path;
      }
      setSelected(
        keys.filter((k) => !out.candidate.failed_fields?.includes(k)),
      );
      setImages(choices);
      if (!refresh && existing) setWatchState("wantwatch");
      setBaseline(
        refresh && remembered
          ? remembered.baseline
          : selectionSnapshot(keys, choices, "wantwatch"),
      );
    } catch (e) {
      if (!c.signal.aborted) showError(e);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    if (
      existing?.metadata?.tmdb_id &&
      usable(savedOptions) &&
      !initialized.current
    ) {
      initialized.current = true;
      void getPreview(
        {
          id: existing.metadata.tmdb_id,
          media_type: existing.metadata.media_type as "tv" | "movie",
          title: existing.title,
          overview: existing.metadata.overview,
          date: existing.metadata.release_date,
          poster: "",
        },
        existing.metadata.season_number,
      );
    }
    // An explicitly linked update starts once, after credentials are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOptions]);
  useEffect(() => {
    if (
      stage !== "search" ||
      !usable(savedOptions) ||
      (existing?.metadata?.tmdb_id && !hit)
    )
      return;
    const key = JSON.stringify([savedOptions, category, query, page, retry]);
    if (searchCache.current?.key === key) {
      setResults(searchCache.current.data);
      setLoading(false);
      return;
    }
    const c = start();
    webRequest<SearchPage>(
      "/tmdb/search",
      { options: savedOptions, category, query, page },
      "POST",
      c.signal,
    )
      .then((out) => {
        if (!c.signal.aborted) {
          searchCache.current = { key, data: out };
          setResults(out);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) showError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, savedOptions, category, query, page, retry]);
  async function choose(item: SearchHit) {
    if (item.media_type === "movie") {
      void getPreview(item, null);
      return;
    }
    remember();
    setHit(item);
    setScope("season");
    move("seasons");
    setSeasons(null);
    const c = start();
    try {
      const list = await webRequest<SeasonHit[]>(
        "/tmdb/seasons",
        { options: savedOptions, tmdb_id: item.id },
        "POST",
        c.signal,
      );
      if (!c.signal.aborted)
        setSeasons(
          (list || []).sort((a, b) => a.season_number - b.season_number),
        );
    } catch (e) {
      if (!c.signal.aborted) showError(e);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  function beginImport() {
    if (!preview || busy || preparing) return;
    if (existing) {
      void importWork();
      return;
    }
    const initial = draft || {
      title: preview.candidate.title,
      category: "wantwatch",
      rating: 0,
      note: "",
      poster: "",
      watch_date: "",
      play_link: "",
    };
    setRecordInitial(initial);
    setRecordOpen(true);
    setError("");
    setPreparing(true);
    const controller = new AbortController();
    prepareRequest.current = controller;
    preparation.current = webRequest(
      "/tmdb/import",
      {
        token: preview.token,
        fields: selected,
        images,
        category: initial.category,
        prepare_only: true,
      },
      "POST",
      controller.signal,
    )
      .catch((e) => {
        if (!controller.signal.aborted) showError(e);
        throw e;
      })
      .finally(() => {
        if (prepareRequest.current === controller) setPreparing(false);
      });
    void preparation.current.catch(() => {});
  }
  async function importWork(input?: AnimeInput) {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    setImageErrors({});
    try {
      if (input) await preparation.current;
      const a = await webRequest<Anime>("/tmdb/import", {
        token: preview.token,
        fields: selected,
        images,
        category: input?.category || draft?.category || watchState,
        personal: existing ? undefined : input || draft,
      });
      captureSurfaceOrigin(
        document.querySelector<HTMLElement>(".tmdb-footer .tmdb-primary"),
      );
      onSaved(a);
    } catch (e) {
      showError(e);
      setRecordOpen(false);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  function back() {
    if (busy) return;
    remember();
    if (stage === "guide") leave(onClose);
    else if (stage === "settings" || stage === "language")
      leave(() => {
        setOptions(savedOptions);
        move(returnStage, true);
      }, true);
    else if (stage === "preview") {
      if (existing?.metadata?.tmdb_id) leave(onClose);
      else move(hit?.media_type === "tv" ? "seasons" : "search", true);
    } else move("search", true);
  }
  function settings(next: Stage) {
    setReturnStage(stage);
    move(next);
  }
  const duplicate =
    preview?.duplicate && preview.duplicate.id !== existing?.id
      ? preview.duplicate
      : null;
  const title = {
    guide: "TMDb 使用指引",
    settings: "API 设置",
    language: "资料语言",
    search: "搜索作品",
    seasons: "按季选择",
    preview: "导入预览",
  }[stage];
  const action =
    stage === "search" ? (
      <button
        className="tmdb-round"
        aria-label="API 设置"
        onClick={() => settings("settings")}
      >
        <Icon name="settings" />
      </button>
    ) : stage === "preview" ? (
      <button
        className="tmdb-primary tmdb-pill"
        disabled={busy || loading || !preview || !!duplicate}
        onClick={beginImport}
      >
        <Icon name={busy ? "retry" : "check"} />
        {busy ? "保存中…" : "应用所选字段"}
      </button>
    ) : null;
  return (
    <>
      {!recordOpen && (
        <Surface
          title={title}
          onClose={() => leave(onClose)}
          onBack={stage === "search" ? undefined : back}
          leftLabel={stage === "search" || stage === "guide" ? "关闭" : "返回"}
          action={action}
          headerAction={stage === "search"}
          stable={stage === "search" || stage === "preview"}
          floatingFooter={stage === "search"}
          pageKey={stage}
          direction={direction}
          scrollRef={scrollRef}
          footer={
            stage === "search" && !existing ? (
              <button
                className="tmdb-soft tmdb-pill"
                onClick={() => leave(onManual)}
              >
                <Icon name="edit" />
                手动添加
              </button>
            ) : undefined
          }
        >
          <fieldset
            disabled={busy || (loading && stage === "preview")}
            className={`tmdb-body tmdb-page-${stage}`}
          >
            {error && (
              <div className="tmdb-error" role="alert">
                {error}
                <div className="tmdb-actions">
                  {conflictID && (
                    <button
                      onClick={() =>
                        void webRequest<Anime>(
                          `/anime/${conflictID}`,
                          undefined,
                          "GET",
                        )
                          .then(onOpen)
                          .catch(showError)
                      }
                    >
                      打开已有收藏
                    </button>
                  )}
                  {stage === "search" && (
                    <button onClick={() => setRetry((v) => v + 1)}>
                      重试搜索
                    </button>
                  )}
                  {stage === "seasons" && hit && (
                    <button onClick={() => void choose(hit)}>重试</button>
                  )}
                  {stage === "preview" && hit && (
                    <button
                      onClick={() =>
                        void getPreview(
                          hit,
                          preview?.candidate.metadata.season_number ??
                            existing?.metadata?.season_number ??
                            chosenSeason.current,
                          true,
                        )
                      }
                    >
                      重新获取资料
                    </button>
                  )}
                </div>
              </div>
            )}
            {(stage === "guide" || stage === "settings") && (
              <>
                {stage === "guide" && (
                  <div className="tmdb-card tmdb-guide-links">
                    {[
                      [
                        "person",
                        "注册 TMDb",
                        "https://www.themoviedb.org/signup",
                      ],
                      [
                        "person",
                        "登录 TMDb",
                        "https://www.themoviedb.org/login",
                      ],
                      [
                        "key",
                        "获取 TMDb API",
                        "https://www.themoviedb.org/settings/api",
                      ],
                    ].map(([icon, label, url]) => (
                      <a
                        key={label}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name={icon} />
                        {label}
                      </a>
                    ))}
                    <p className="tmdb-muted">
                      在 TMDb 网站申请 API
                      Key（v3）或读取访问令牌，然后返回填写。
                    </p>
                  </div>
                )}
                <h3 className="tmdb-section-heading">
                  <Icon name="key" />
                  填写 API Key
                </h3>
                <div className="tmdb-card tmdb-form">
                  <label className="tmdb-visually-hidden" htmlFor="tmdb-key">
                    个人 API Key／读取访问令牌
                  </label>
                  <input
                    id="tmdb-key"
                    className="tmdb-key-input"
                    type="password"
                    autoComplete="off"
                    placeholder="TMDb API Key (v3)／读取令牌"
                    value={options.key}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        key: e.target.value,
                        credential_mode: "personal",
                      })
                    }
                  />
                  <div className="tmdb-actions">
                    <button
                      className="tmdb-primary tmdb-pill"
                      disabled={!options.key.trim() || busy}
                      onClick={() =>
                        void validate({
                          ...options,
                          credential_mode: "personal",
                        })
                      }
                    >
                      {busy ? "验证中…" : "保存并搜索"}
                    </button>
                  </div>
                </div>
                <p className="tmdb-muted tmdb-caption">
                  个人 Key 仅在当前浏览器会话保留，不进入收藏库或导出文件。
                </p>
                {stage === "settings" && (
                  <>
                    <h3 className="tmdb-section-heading">连接设置</h3>
                    <div className="tmdb-card tmdb-form">
                      <label>
                        API 代理基础地址（可选）
                        <input
                          placeholder="https://api.themoviedb.org/3"
                          value={options.api_base}
                          onChange={(e) =>
                            setOptions({
                              ...options,
                              api_base: e.target.value,
                              credential_mode: "personal",
                            })
                          }
                        />
                      </label>
                      <label>
                        图片代理基础地址（可选）
                        <input
                          placeholder="https://image.tmdb.org/t/p"
                          value={options.image_base}
                          onChange={(e) =>
                            setOptions({
                              ...options,
                              image_base: e.target.value,
                              credential_mode: "personal",
                            })
                          }
                        />
                      </label>
                      <p className="tmdb-muted">
                        默认直连。代理地址仅用于个人 Key，请选择信任的服务。
                      </p>
                      <button
                        className="tmdb-text-action"
                        onClick={() => move("guide")}
                      >
                        查看 TMDb 使用指引
                      </button>
                    </div>
                  </>
                )}
                <div className="tmdb-card tmdb-guide-links">
                  {available && (
                    <button
                      onClick={() =>
                        void validate({
                          ...options,
                          key: "",
                          credential_mode: "server",
                          api_base: "",
                          image_base: "",
                        })
                      }
                    >
                      跳过，使用默认 API（不稳定）
                    </button>
                  )}
                  {!existing && (
                    <button onClick={() => leave(onManual)}>
                      <Icon name="edit" />
                      手动添加
                    </button>
                  )}
                </div>
              </>
            )}
            {stage === "language" && (
              <div className="tmdb-card">
                {languages.map(([key, label]) => (
                  <button
                    className="tmdb-language-row"
                    key={key}
                    aria-pressed={options.language === key}
                    onClick={() => {
                      persist({ ...savedOptions, language: key });
                      move(returnStage, true);
                    }}
                  >
                    {label}
                    <span>{options.language === key ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
            )}
            {stage === "search" && (
              <>
                <form
                  className="tmdb-search-box"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setQuery(queryInput.trim());
                    setPage(1);
                    setResults(null);
                    setRetry((v) => v + 1);
                  }}
                >
                  <Icon name="search" />
                  <input
                    aria-label="搜索作品"
                    placeholder="搜索片名"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                  />
                  <button className="tmdb-visually-hidden" type="submit">
                    搜索
                  </button>
                  {queryInput && (
                    <button
                      type="button"
                      aria-label="浏览热门作品"
                      onClick={() => {
                        setQueryInput("");
                        setQuery("");
                        setPage(1);
                        setResults(null);
                        setRetry((v) => v + 1);
                      }}
                    >
                      ×
                    </button>
                  )}
                </form>
                <div className="tmdb-filter-row">
                  <Segmented
                    label="作品分类"
                    value={category}
                    options={[
                      ["anime", "番剧"],
                      ["tv", "节目"],
                      ["movie", "电影"],
                    ]}
                    onChange={(key) => {
                      setCategory(key);
                      setPage(1);
                      setResults(null);
                    }}
                  />
                  <button
                    className="tmdb-round tmdb-language"
                    aria-label="资料语言"
                    title={
                      languages.find((l) => l[0] === savedOptions.language)?.[1]
                    }
                    onClick={() => settings("language")}
                  >
                    <Icon name="globe" />
                  </button>
                </div>
                {!usable(savedOptions) && (
                  <div className="tmdb-card">
                    <p>先选择连接方式，再搜索作品。</p>
                    <button
                      className="tmdb-text-action"
                      onClick={() => move("guide")}
                    >
                      TMDb 使用指引
                    </button>
                  </div>
                )}
                {loading && (
                  <div className="tmdb-loading" role="status">
                    正在搜索作品…
                  </div>
                )}
                {results && (
                  <>
                    <div className="tmdb-results">
                      {results.results.map((item) => (
                        <button
                          className="tmdb-result"
                          aria-label={`选择作品 ${item.title}`}
                          key={item.id}
                          onClick={() => void choose(item)}
                        >
                          {item.poster ? (
                            <img
                              src={item.poster}
                              alt={`${item.title}海报`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="tmdb-poster-placeholder">
                              <Icon name="image" />
                            </div>
                          )}
                          <div>
                            <h3>{item.title}</h3>
                            <span className="tmdb-muted">
                              {item.date || "日期未知"}
                            </span>
                            <p>{item.overview || "暂无简介"}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    {!results.results.length && (
                      <div className="tmdb-empty">
                        本页没有符合分类的作品，可翻页或更换关键词。
                      </div>
                    )}
                    <div className="tmdb-pagination">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((v) => v - 1)}
                      >
                        <Icon name="back" />
                        上一页
                      </button>
                      <span className="tmdb-muted">
                        第 {page} / {Math.max(1, results.total_pages)} 页
                      </span>
                      <button
                        disabled={page >= results.total_pages}
                        onClick={() => setPage((v) => v + 1)}
                      >
                        下一页
                        <Icon name="chevron" />
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {stage === "seasons" && hit && (
              <>
                <div className="tmdb-work-summary">
                  {hit.poster && (
                    <img src={hit.poster} alt={`${hit.title}海报`} />
                  )}
                  <div>
                    <h3>{hit.title}</h3>
                    <p className="tmdb-muted">{hit.date || "日期未知"}</p>
                    <p className="tmdb-clamp">{hit.overview || "暂无简介"}</p>
                  </div>
                </div>
                <Segmented
                  label="收藏范围"
                  value={scope}
                  options={[
                    ["whole", "整部剧集"],
                    ["season", "按季"],
                  ]}
                  onChange={setScope}
                />
                {loading ? (
                  <div className="tmdb-loading" role="status">
                    正在获取季度…
                  </div>
                ) : scope === "whole" ? (
                  <div className="tmdb-card tmdb-whole">
                    <h3>整部剧集</h3>
                    <p className="tmdb-muted">
                      收藏整剧资料；总时长不计特别篇。
                    </p>
                    <button
                      className="tmdb-primary tmdb-pill"
                      onClick={() => void getPreview(hit, null)}
                    >
                      选择整部剧集
                    </button>
                  </div>
                ) : (
                  <div className="tmdb-season-list">
                    {seasons?.map((s) => (
                      <button
                        className="tmdb-season-row"
                        key={s.season_number}
                        aria-label={`选择${s.season_number === 0 ? "特别篇" : `第 ${s.season_number} 季`}`}
                        onClick={() => void getPreview(hit, s.season_number)}
                      >
                        <span>
                          {s.season_number === 0
                            ? "特别篇"
                            : `第 ${s.season_number} 季`}
                          <small>
                            {s.episode_count} 集
                            {s.air_date ? ` · ${s.air_date}` : ""}
                          </small>
                        </span>
                        <strong>选择</strong>
                      </button>
                    ))}
                    {seasons && !seasons.length && (
                      <p className="tmdb-empty">
                        暂无季度资料，可以选择整部剧集。
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
            {stage === "preview" && (
              <>
                {loading && (
                  <div className="tmdb-loading" role="status">
                    正在获取 TMDb 资料…
                  </div>
                )}
                {preview && (
                  <>
                    {duplicate && (
                      <div className="tmdb-info">
                        该作品已收藏。
                        <button
                          onClick={() => {
                            captureSurfaceOrigin();
                            onOpen(duplicate);
                          }}
                        >
                          打开已有收藏
                        </button>
                      </div>
                    )}
                    {preview.possible_duplicates.map((a) => (
                      <div className="tmdb-info" key={a.id}>
                        有同名手动收藏「{a.title}」。
                        <button onClick={() => onOpen(a)}>查看已有收藏</button>
                      </div>
                    ))}
                    {preview.candidate.warnings.length > 0 && (
                      <div className="tmdb-info">
                        {preview.candidate.warnings.map((w) => (
                          <p key={w}>{w}</p>
                        ))}
                        <button
                          className="tmdb-text-action"
                          onClick={() =>
                            hit &&
                            void getPreview(
                              hit,
                              preview.candidate.metadata.season_number,
                              true,
                              preview.candidate.failed_fields?.filter((k) =>
                                [
                                  "aliases",
                                  "translations",
                                  "keywords",
                                  "external_ids",
                                  "videos",
                                  "certifications",
                                ].includes(k),
                              ),
                            )
                          }
                        >
                          重试未获取资料
                        </button>
                      </div>
                    )}
                    {["poster", "backdrop", "logo"].map((kind) => {
                      const label = (
                        {
                          poster: "海报",
                          backdrop: "背景图",
                          logo: "Logo",
                        } as Record<string, string>
                      )[kind];
                      const choices = preview.candidate.images[kind] || [];
                      const Section = kind === "poster" ? "section" : "details";
                      return (
                        <Section className="tmdb-image-section" key={kind}>
                          {kind === "poster" ? (
                            <h3 className="tmdb-section-heading">
                              <Icon name="image" />
                              {label}候选
                            </h3>
                          ) : (
                            <summary className="tmdb-section-heading">
                              <Icon name="image" />
                              {label}候选
                              <span className="tmdb-muted">
                                {images[kind] ? "已选择导入" : "保留本地图片"}
                              </span>
                            </summary>
                          )}
                          <div className="tmdb-card">
                            <div className="tmdb-images">
                              {choices.map((img, i) => (
                                <button
                                  className={`tmdb-image-option tmdb-${kind}`}
                                  key={img.path}
                                  aria-label={`选择${label} ${i + 1}`}
                                  aria-pressed={images[kind] === img.path}
                                  onClick={() =>
                                    setImages((v) => ({
                                      ...v,
                                      [kind]: img.path,
                                    }))
                                  }
                                >
                                  <img
                                    src={img.url}
                                    alt={`${label}候选 ${i + 1}`}
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                              {!choices.length && (
                                <p className="tmdb-muted">TMDb 未提供{label}</p>
                              )}
                            </div>
                            <div className="tmdb-image-controls">
                              <label className="tmdb-toggle-label">
                                导入{label}
                                <input
                                  className="tmdb-switch"
                                  type="checkbox"
                                  role="switch"
                                  aria-label={`导入${label}`}
                                  disabled={!choices.length}
                                  checked={!!images[kind]}
                                  onChange={(e) =>
                                    setImages((v) => {
                                      const n = { ...v };
                                      if (e.target.checked)
                                        n[kind] = choices[0].path;
                                      else delete n[kind];
                                      return n;
                                    })
                                  }
                                />
                              </label>
                              <button
                                className="tmdb-text-action"
                                onClick={() =>
                                  hit &&
                                  void getPreview(
                                    hit,
                                    preview.candidate.metadata.season_number,
                                    true,
                                    undefined,
                                    kind,
                                  )
                                }
                              >
                                <Icon name="retry" />
                                重试{label}
                              </button>
                            </div>
                            {imageErrors[kind] && (
                              <p className="tmdb-error">
                                {imageErrors[kind]}，可取消导入后继续。
                              </p>
                            )}
                          </div>
                        </Section>
                      );
                    })}
                    <p className="tmdb-caption tmdb-muted">
                      选择填入或替换的字段
                    </p>
                    {fieldGroups.map((group) => {
                      const keys = group.keys.filter(
                        (key) =>
                          !emptyValue(
                            key === "title"
                              ? existing
                                ? preview.candidate.title
                                : draft?.title || preview.candidate.title
                              : preview.candidate.metadata[
                                  key as keyof WorkMetadata
                                ],
                          ) ||
                          !emptyValue(
                            key === "title"
                              ? preview.existing?.title
                              : preview.existing?.metadata?.[
                                  key as keyof WorkMetadata
                                ],
                          ),
                      );
                      return keys.length ? (
                        <section key={group.name}>
                          <h3 className="tmdb-section-heading tmdb-heading-neutral">
                            {group.name}
                          </h3>
                          <div className="tmdb-card tmdb-field-list">
                            {keys.map((key) => {
                              const value =
                                key === "title"
                                  ? existing
                                    ? preview.candidate.title
                                    : draft?.title || preview.candidate.title
                                  : preview.candidate.metadata[
                                      key as keyof WorkMetadata
                                    ];
                              const old =
                                key === "title"
                                  ? preview.existing?.title
                                  : preview.existing?.metadata?.[
                                      key as keyof WorkMetadata
                                    ];
                              const text =
                                key === "status"
                                  ? statusLabel(String(value || ""))
                                  : formatValue(value);
                              return (
                                <div className="tmdb-preview-field" key={key}>
                                  <Icon name={fieldIcon(key)} />
                                  <div className="tmdb-field-content">
                                    <label htmlFor={`field-${key}`}>
                                      {fieldLabels[key]}
                                    </label>
                                    {text.length > 150 ||
                                    Array.isArray(value) ? (
                                      <details>
                                        <summary>
                                          导入：
                                          {Array.isArray(value)
                                            ? `${value.length} 项资料`
                                            : `${text.slice(0, 55)}…`}
                                        </summary>
                                        <p>{text}</p>
                                      </details>
                                    ) : (
                                      <p>导入：{text}</p>
                                    )}
                                    {preview.existing && (
                                      <details>
                                        <summary>
                                          当前：{formatValue(old).slice(0, 55)}
                                          {formatValue(old).length > 55
                                            ? "…"
                                            : ""}{" "}
                                          ·{" "}
                                          {JSON.stringify(value) ===
                                          JSON.stringify(old)
                                            ? "相同"
                                            : "有差异"}
                                        </summary>
                                        <p>{formatValue(old)}</p>
                                      </details>
                                    )}
                                    {imageErrors[key] && (
                                      <p className="tmdb-error">
                                        {imageErrors[key]}
                                      </p>
                                    )}
                                    {preview.candidate.failed_fields?.includes(
                                      key,
                                    ) && (
                                      <p className="tmdb-muted">
                                        本组资料获取失败，请先重试。
                                      </p>
                                    )}
                                  </div>
                                  <input
                                    id={`field-${key}`}
                                    className="tmdb-switch"
                                    role="switch"
                                    type="checkbox"
                                    aria-label={`导入${fieldLabels[key]}`}
                                    checked={selected.includes(key)}
                                    disabled={preview.candidate.failed_fields?.includes(
                                      key,
                                    )}
                                    onChange={(e) =>
                                      setSelected((v) =>
                                        e.target.checked
                                          ? [...v, key]
                                          : v.filter((k) => k !== key),
                                      )
                                    }
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ) : null;
                    })}
                    <p className="tmdb-muted tmdb-caption">
                      {existing
                        ? "仅更新选中的作品资料，个人记录保持原值。"
                        : "确认后，所选资料与图片将保存到本地。"}
                    </p>
                  </>
                )}
              </>
            )}
            <p className="tmdb-attribution">
              资料来源：
              <a
                href="https://www.themoviedb.org"
                target="_blank"
                rel="noreferrer"
              >
                TMDb
              </a>
              。本产品使用 TMDb API，但未经 TMDb 认可或认证。
            </p>
          </fieldset>
        </Surface>
      )}
      {(preparing || (busy && recordOpen)) && (
        <div className="tmdb-import-progress" role="status">
          <Icon name="retry" />
          {preparing ? "正在准备导入图片…" : "正在保存收藏…"}
        </div>
      )}
      {recordOpen && recordInitial && (
        <AnimeModal
          isOpen
          anime={null}
          importDraft={recordInitial}
          importLoading={preparing}
          importSaveLabel="保存并收藏"
          importError={error}
          protectChanges
          onClose={() => {
            setRecordOpen(false);
            prepareRequest.current?.abort();
            captureSurfaceOrigin();
          }}
          onDraftSave={async (input) => {
            drafts.current.set(draftKey.current, input);
            setDraft(input);
            setDirtyDraft(
              JSON.stringify(input) !==
                draftBaselines.current.get(draftKey.current),
            );
            setWatchState(input.category);
            captureSurfaceOrigin();
            await importWork(input);
          }}
          onSave={async () => {}}
          onDelete={async () => {}}
          onUpload={async () => ""}
        />
      )}
      {confirm && (
        <UnsavedDialog
          busy={busy}
          onContinue={() => setConfirm(false)}
          onDiscard={() => {
            setConfirm(false);
            setOptions(savedOptions);
            if (!optionsOnly.current) {
              setBaseline(snapshot);
              setDirtyDraft(false);
            }
            pending.current();
          }}
          onSave={() => {
            setConfirm(false);
            if (dirtyOptions)
              void validate(options, () => {
                if (
                  !optionsOnly.current &&
                  dirtyPreview &&
                  preview &&
                  !duplicate
                )
                  beginImport();
                else pending.current();
              });
            else if (
              !optionsOnly.current &&
              dirtyPreview &&
              preview &&
              !duplicate
            )
              beginImport();
            else pending.current();
          }}
        />
      )}
    </>
  );
}
