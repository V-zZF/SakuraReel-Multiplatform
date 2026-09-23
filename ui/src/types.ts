// 番剧数据类型
export interface Anime {
  id: number;
  title: string;
  category: 'watched' | 'watching' | 'wantwatch';
  rating: number;   // 0-10, 0 = 未评分
  note: string;
  poster: string;   // 海报文件名，空字符串 = 无海报
  watch_date: string; // 观看年月 YYYY-MM，空字符串 = 未设置
  play_link: string; // 播放链接，空字符串 = 未设置
  position: number;
  leaderboard_position: number;
  created_at: string;
}

// 分类定义（弹窗中仍使用）
export const CATEGORIES = [
  { key: 'watched', label: '看过' },
  { key: 'watching', label: '在看' },
  { key: 'wantwatch', label: '想看' },
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
