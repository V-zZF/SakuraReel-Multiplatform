import type { WorkMetadata } from '../types';
export function totalRuntime(m?: WorkMetadata) {
  if (!m) return { text: '未知', basis: '' };
  if (m.media_type === 'movie' || (!m.media_type && m.runtime > 0)) return { text: m.runtime > 0 ? `${m.runtime} 分钟` : '未知', basis: '' };
  const episodes = m.episodes || [];
  // Whole-series totals exclude season 0, matching TMDb's regular episode count.
  const scoped = m.season_number === null ? episodes.filter(e => e.season_number > 0) : episodes;
  const known = scoped.filter(e => e.runtime > 0);
  const average = m.episode_runtime > 0 ? m.episode_runtime : known.length ? Math.round(known.reduce((n, e) => n + e.runtime, 0) / known.length) : 0;
  const count = m.episode_count > 0 ? m.episode_count : scoped.length;
  if (!average || !count) return { text: '未知', basis: '缺少集数或单集时长' };
  const minutes = count * average;
  return { text: `约 ${minutes} 分钟`, basis: `${count} 集 × ${average} 分钟／集${m.season_number === null ? '（不含特别篇）' : ''}` };
}
