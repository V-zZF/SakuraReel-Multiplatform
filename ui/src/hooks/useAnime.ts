import { useState, useCallback, useRef } from 'react';
import type { Anime, AnimeInput } from '../types';
import { data } from '../data';

// 自定义 Hook：管理番剧列表
export function useAnime() {
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedCategory, setLoadedCategory] = useState<string | null>(null);
  const requestId = useRef(0);

  // 获取番剧列表（不传 category 则获取全部）
  const fetchList = useCallback(async (category?: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await data.list(category);
      if (id !== requestId.current) return;
      setAnimeList(list);
      setLoadedCategory(category ?? null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : '获取列表失败');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // 创建番剧
  const create = useCallback(async (input: AnimeInput): Promise<Anime> => {
    const created = await data.create(input);
    // 后端返回完整对象（含计算好的 positions），加入本地 state
    setAnimeList(prev => [...prev, created]);
    return created;
  }, []);

  // 更新番剧
  const update = useCallback(async (id: number, input: Partial<AnimeInput>): Promise<Anime> => {
    const updated = await data.update(id, input);
    setAnimeList(prev => prev.map(a => a.id === id ? updated : a));
    return updated;
  }, []);

  // 删除番剧
  const remove = useCallback(async (id: number): Promise<void> => {
    await data.remove(id);
    setAnimeList(prev => prev.filter(a => a.id !== id));
  }, []);

  // 批量更新排序
  const reorder = useCallback(async (scope: string, items: { id: number; position: number }[]) => {
    await data.reorder(scope, items);
  }, []);

  // 上传海报
  const uploadPoster = useCallback(async (file: File): Promise<string> => {
    return data.uploadPoster(file);
  }, []);

  return {
    animeList, setAnimeList, loading, error, loadedCategory,
    fetchList, create, update, remove, reorder, uploadPoster,
  };
}
