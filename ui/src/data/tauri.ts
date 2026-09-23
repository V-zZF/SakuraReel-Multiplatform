import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { Anime, AnimeInput } from '../types';
import type { AnimeData } from './index';

let posterDirectory = '';

export async function initializeTauriData(): Promise<void> {
  posterDirectory = await invoke<string>('poster_directory');
}

export const tauriData: AnimeData = {
  list(category) {
    return invoke<Anime[]>('list_anime', { category: category || null });
  },
  create(input: AnimeInput) {
    return invoke<Anime>('create_anime', { input });
  },
  update(id, input) {
    return invoke<Anime>('update_anime', { id, input });
  },
  remove(id) {
    return invoke<void>('delete_anime', { id });
  },
  reorder(scope, items) {
    return invoke<void>('reorder_anime', { scope, items });
  },
  async uploadPoster(file) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return invoke<string>('upload_poster', { filename: file.name, bytes });
  },
  posterUrl(filename) {
    if (!filename || !posterDirectory) return '';
    return convertFileSrc(`${posterDirectory}/${filename}`);
  },
};
