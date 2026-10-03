// 番剧数据类型
export interface Anime {
  metadata?: WorkMetadata;
  server_rev?: number;
  id: number;
  title: string;
  category: "watched" | "watching" | "wantwatch";
  rating: number; // 0-10, 0 = 未评分
  note: string;
  poster: string; // 海报文件名，空字符串 = 无海报
  watch_date: string; // 观看年月 YYYY-MM，空字符串 = 未设置
  play_link: string; // 播放链接，空字符串 = 未设置
  position: number;
  leaderboard_position: number;
  created_at: string;
}

// 分类定义（弹窗中仍使用）
export const CATEGORIES = [
  { key: "watched", label: "看过" },
  { key: "watching", label: "在看" },
  { key: "wantwatch", label: "想看" },
] as const;

// 创建/更新番剧的输入
export interface AnimeInput {
  title: string;
  category: string;
  rating: number;
  note: string;
  poster: string;
  watch_date: string;
  play_link: string;
  position?: number;
}

// API 响应格式
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface Person {
  id: number;
  name: string;
  role: string;
  photo?: string;
  department?: string;
}
export interface ArchiveItem {
  name: string;
  region?: string;
  value: string;
}
export interface Video {
  name: string;
  site: string;
  key: string;
  type: string;
  language?: string;
  official?: boolean;
}
export interface Season {
  number: number;
  name: string;
  overview: string;
  air_date: string;
  episode_count: number;
}
export interface Episode {
  id?: number;
  still?: string;
  vote_average?: number;
  vote_count?: number;
  production_code?: string;
  guest_stars?: Person[];
  crew?: Person[];
  season_number: number;
  number: number;
  name: string;
  overview: string;
  air_date: string;
  runtime: number;
}
export interface WorkMetadata {
  season_name?: string;
  genres?: string[];
  status?: string;
  tagline?: string;
  original_language?: string;
  countries?: string[];
  spoken_languages?: string[];
  last_air_date?: string;
  season_count?: number;
  vote_average?: number;
  vote_count?: number;
  budget?: number;
  revenue?: number;
  collection?: string;
  networks?: string[];
  creators?: Person[];
  homepage?: string;
  keywords?: string[];
  aliases?: ArchiveItem[];
  translations?: ArchiveItem[];
  certifications?: ArchiveItem[];
  external_ids?: ArchiveItem[];
  videos?: Video[];

  tmdb_id: number;
  media_type: "" | "movie" | "tv";
  season_number: number | null;
  language: string;
  overview: string;
  release_date: string;
  original_title: string;
  companies: string[] | null;
  cast: Person[] | null;
  crew: Person[] | null;
  seasons: Season[] | null;
  episodes: Episode[] | null;
  runtime: number;
  episode_count: number;
  episode_runtime: number;
  backdrop: string;
  logo: string;
}
