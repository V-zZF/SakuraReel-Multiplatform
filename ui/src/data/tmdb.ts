import type { Anime, WorkMetadata } from "../types";
export interface TMDbOptions {
  credential_mode?: "personal" | "server";
  key: string;
  api_base: string;
  image_base: string;
  language: string;
}
export interface SearchHit {
  id: number;
  title: string;
  date: string;
  overview: string;
  poster: string;
  media_type: "movie" | "tv";
}
export interface SearchPage {
  page: number;
  total_pages: number;
  results: SearchHit[];
  filtered: boolean;
}
export interface ImageChoice {
  path: string;
  url: string;
}
export interface Preview {
  token: string;
  candidate: {
    title: string;
    metadata: WorkMetadata;
    images: Record<string, ImageChoice[]>;
    warnings: string[];
    failed_fields?: string[];
  };
  existing: Anime | null;
  duplicate: Anime | null;
  possible_duplicates: Anime[];
}
export class WebAPIError extends Error {
  existing_id?: number;
  image_errors?: Record<string, string>;
  constructor(
    message: string,
    details: { existing_id?: number; image_errors?: Record<string, string> },
  ) {
    super(message);
    this.existing_id = details.existing_id;
    this.image_errors = details.image_errors;
  }
}
let owner = "";
function previewOwner() {
  if (!owner) owner = crypto.randomUUID();
  return owner;
}
export async function webRequest<T>(
  path: string,
  body?: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Preview-Owner": previewOwner(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("服务返回格式错误，请检查 Web 服务是否可用");
  }
  if (!res.ok || !json.ok)
    throw new WebAPIError(json.error || "请求失败", json);
  return json.data as T;
}
export function loadOptions(): TMDbOptions {
  try {
    return {
      key: sessionStorage.getItem("tmdb-key") || "",
      api_base: "",
      image_base: "",
      language: "zh-CN",
      ...JSON.parse(localStorage.getItem("tmdb-options") || "{}"),
    };
  } catch {
    return { key: "", api_base: "", image_base: "", language: "zh-CN" };
  }
}
export function saveOptions(options: TMDbOptions) {
  sessionStorage.setItem("tmdb-key", options.key);
  const { key: _key, ...preferences } = options;
  localStorage.setItem("tmdb-options", JSON.stringify(preferences));
}
export const fieldGroups: { name: string; keys: string[] }[] = [
  {
    name: "基本信息",
    keys: [
      "title",
      "original_title",
      "season_name",
      "tagline",
      "overview",
      "release_date",
      "last_air_date",
      "genres",
      "status",
      "original_language",
      "spoken_languages",
      "countries",
      "runtime",
      "episode_count",
      "episode_runtime",
      "season_count",
      "vote_average",
      "vote_count",
      "budget",
      "revenue",
      "collection",
      "homepage",
    ],
  },
  {
    name: "演职员与制作",
    keys: ["companies", "networks", "creators", "cast", "crew"],
  },
  { name: "季度与单集", keys: ["seasons", "episodes"] },
  {
    name: "预告片",
    keys: ["videos"],
  },
];
export const fieldLabels: Record<string, string> = {
  title: "片名",
  original_title: "原名",
  season_name: "季度名",
  tagline: "标语",
  overview: "简介",
  release_date: "上映／首播日期",
  last_air_date: "最后播出日期",
  genres: "类型",
  status: "作品状态（整剧／电影）",
  original_language: "原始语言",
  spoken_languages: "对白语言",
  countries: "国家／地区",
  runtime: "影片时长（分钟）",
  episode_count: "集数",
  episode_runtime: "参考单集时长（分钟）",
  season_count: "整剧季数",
  vote_average: "TMDb 评分",
  vote_count: "TMDb 评分人数",
  budget: "预算（美元）",
  revenue: "票房（美元）",
  collection: "电影系列",
  homepage: "官方网站",
  companies: "制作公司",
  networks: "电视网",
  creators: "创作者",
  cast: "演员",
  crew: "制作人员",
  seasons: "季度摘要",
  episodes: "单集摘要",
  keywords: "关键词",
  aliases: "别名",
  translations: "翻译",
  certifications: "地区分级／发行信息",
  external_ids: "外部 ID",
  videos: "预告片与视频",
};
export const listFields = [
  "genres",
  "spoken_languages",
  "countries",
  "companies",
  "networks",
  "keywords",
  "creators",
  "cast",
  "crew",
  "seasons",
  "episodes",
  "aliases",
  "translations",
  "certifications",
  "external_ids",
  "videos",
];
export const numberFields = [
  "runtime",
  "episode_count",
  "episode_runtime",
  "season_count",
  "vote_average",
  "vote_count",
  "budget",
  "revenue",
];
export function statusLabel(value?: string) {
  return (
    (
      {
        "Returning Series": "连载中",
        Ended: "已完结",
        Canceled: "已取消",
        "In Production": "制作中",
        Planned: "计划中",
        Pilot: "试播",
        Released: "已上映",
        "Post Production": "后期制作",
        Rumored: "未确认",
      } as Record<string, string>
    )[value || ""] ||
    value ||
    "未知"
  );
}
export function videoURL(video: { site: string; key: string }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(video.key)) return "";
  return video.site === "YouTube"
    ? `https://www.youtube.com/watch?v=${video.key}`
    : video.site === "Vimeo" && /^\d+$/.test(video.key)
      ? `https://vimeo.com/${video.key}`
      : "";
}
export function safeURL(value?: string) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function emptyValue(v: unknown) {
  return (
    v === null ||
    v === undefined ||
    v === "" ||
    v === 0 ||
    (Array.isArray(v) && v.length === 0)
  );
}
export function formatValue(v: unknown): string {
  if (emptyValue(v)) return "未提供";
  if (Array.isArray(v))
    return v
      .map((item) =>
        typeof item === "string"
          ? item
          : [
              item.name,
              item.region,
              item.role,
              item.type,
              item.value,
              item.air_date,
              item.overview,
            ]
              .filter(Boolean)
              .join(" · "),
      )
      .join("\n");
  return String(v);
}
