import type { Anime, AnimeInput } from '../types';
import { httpData } from './http';
import { tauriData, initializeTauriData } from './tauri';
import { isTauri } from '@tauri-apps/api/core';

export interface AnimeData {
  list(category?: string): Promise<Anime[]>;
  create(input: AnimeInput): Promise<Anime>;
  update(id: number, input: Partial<AnimeInput>): Promise<Anime>;
  remove(id: number): Promise<void>;
  reorder(scope: string, items: { id: number; position: number }[]): Promise<void>;
  uploadPoster(file: File): Promise<string>;
  posterUrl(filename: string): string;
}

export const data: AnimeData = isTauri() ? tauriData : httpData;
export const initializeData = async (): Promise<void> => {
  if (isTauri()) await initializeTauriData();
};
export const posterUrl = (filename: string): string => data.posterUrl(filename);
