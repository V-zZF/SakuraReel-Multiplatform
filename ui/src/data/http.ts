import type { Anime, ApiResponse } from '../types';
import type { AnimeData } from './index';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.ok) {
    throw new Error(json.error || '请求失败');
  }
  return json.data as T;
}

export const httpData: AnimeData = {
  list(category) {
    const url = category
      ? `${API_BASE}/anime?category=${category}`
      : `${API_BASE}/anime`;
    return request<Anime[]>(url);
  },
  create(input) {
    return request<Anime>(`${API_BASE}/anime`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update(id, input) {
    return request<Anime>(`${API_BASE}/anime/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  async remove(id) {
    await request<null>(`${API_BASE}/anime/${id}`, { method: 'DELETE' });
  },
  async reorder(scope, items) {
    await request<null>(`${API_BASE}/anime/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ scope, items }),
    });
  },
  async uploadPoster(file) {
    const formData = new FormData();
    formData.append('poster', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    const json: ApiResponse<{ filename: string }> = await res.json();
    if (!json.ok) {
      throw new Error(json.error || '上传失败');
    }
    return json.data!.filename;
  },
  posterUrl(filename) {
    if (!filename) return '';
    return `${API_BASE}/posters/${filename}`;
  },
};
