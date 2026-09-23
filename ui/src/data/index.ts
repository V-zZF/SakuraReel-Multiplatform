import type { Anime, AnimeInput } from '../types';
import { httpData } from './http';

export interface AnimeData {
  list(category?: string): Promise<Anime[]>;
  create(input: AnimeInput): Promise<Anime>;
  update(id: number, input: Partial<AnimeInput>): Promise<Anime>;
  remove(id: number): Promise<void>;
  reorder(scope: string, items: { id: number; position: number }[]): Promise<void>;
  uploadPoster(file: File): Promise<string>;
  posterUrl(filename: string): string;
}

// D 阶段只接浏览器 HTTP；E 阶段在这里按运行环境选择 Tauri 实现。
export const data: AnimeData = httpData;
export const posterUrl = (filename: string): string => data.posterUrl(filename);
