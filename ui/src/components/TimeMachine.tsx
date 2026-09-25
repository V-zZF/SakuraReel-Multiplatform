import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { data, posterUrl } from '../data';
import type { Anime } from '../types';
import { getRatingColor } from './RatingCircle';
import './TimeMachine.css';

type Quarter = { key: string; year: number; season: number; items: Anime[] };
const seasons = [
  { name: '冬', color: '#8dbce6' },
  { name: '春', color: '#e8a6bd' },
  { name: '夏', color: '#8fcca7' },
  { name: '秋', color: '#e7c474' },
];

function rank(items: Anime[]) {
  return [...items].sort((a, b) => b.rating - a.rating || b.leaderboard_position - a.leaderboard_position);
}

function makeQuarters(items: Anime[]): Quarter[] {
  const groups = new Map<string, Quarter>();
  for (const item of items) {
    if (item.category !== 'watched') continue;
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(item.watch_date);
    if (!match) continue;
    const year = Number(match[1]);
    const season = Math.floor((Number(match[2]) - 1) / 3);
    const key = `${year}-${season}`;
    if (!groups.has(key)) groups.set(key, { key, year, season, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()]
    .map((quarter) => ({ ...quarter, items: rank(quarter.items) }))
    .sort((a, b) => b.year - a.year || b.season - a.season);
}

function initialQuarter(quarters: Quarter[]) {
  const now = new Date();
  const target = (now.getFullYear() - 1) * 4 + Math.floor(now.getMonth() / 3);
  const index = quarters.findIndex((q) => q.year * 4 + q.season <= target);
  return index >= 0 ? index : 0;
}

function touchFeedback() {
  if ('vibrate' in navigator) navigator.vibrate(8);
}

type FlowItem = { key: string; anime: Anime; label: string; accent: string; accessible: string };

// 排名在视觉上由中心向两侧递减：…、第 4、2、1、3、5 名、…
function arrangeAroundWinner(items: Anime[]) {
  if (items.length === 0) return { items: [], center: 0 };
  const left = items.filter((_, index) => index % 2 === 1).reverse();
  const right = items.filter((_, index) => index > 0 && index % 2 === 0);
  return { items: [...left, items[0], ...right], center: left.length };
}

function CoverFlow({ items, selected, onSelect, onOpen, flippable, flipped, reduced }: {
  items: FlowItem[];
  selected: number;
  onSelect: (index: number) => void;
  onOpen?: () => void;
  flippable?: boolean;
  flipped?: boolean;
  reduced: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; offset: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cardSize = Math.max(130, Math.min(size.width * (size.width < 600 ? 0.67 : 0.41), size.height * 0.53, 520));
  const stride = cardSize * (size.width < 600 ? 0.58 : 0.63);
  const choose = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(items.length - 1, next));
    if (bounded !== selected) {
      onSelect(bounded);
      touchFeedback();
    }
  }, [items.length, onSelect, selected]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = { x: event.clientX, offset: 0, moved: false };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gesture.current) return;
    const delta = event.clientX - gesture.current.x;
    if (Math.abs(delta) > 5 && !gesture.current.moved) {
      gesture.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    gesture.current.offset = delta;
    setOffset(delta);
  };
  const pointerEnd = () => {
    if (!gesture.current) return;
    const { offset: drag, moved } = gesture.current;
    gesture.current = null;
    setOffset(0);
    if (moved) {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
      choose(selected - Math.round(drag / stride));
    }
  };

  return (
    <div ref={stageRef} className="tm-flow" onPointerDown={pointerDown} onPointerMove={pointerMove}
      onPointerUp={pointerEnd} onPointerCancel={() => { gesture.current = null; setOffset(0); }} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); choose(selected - 1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); choose(selected + 1); }
      }} role="group" aria-label="封面浏览，左右方向键切换">
      {items.map((item, index) => {
        const canFlip = !!flippable && index === selected && !!item.anime.note.trim();
        const distance = index - selected + offset / stride;
        if (Math.abs(distance) > 3.7) return null;
        const side = Math.sign(distance);
        const depth = Math.abs(distance);
        const scale = 1.06 - Math.min(depth, 1) * 0.23 - Math.min(Math.max(depth - 1, 0), 2) * 0.07;
        const rotate = reduced ? 0 : side * -(43 * Math.min(depth, 1) + 5 * Math.min(Math.max(depth - 1, 0), 2));
        return (
          <div key={item.key} className="tm-card-wrap"
            style={{ width: cardSize, left: '50%', top: '42%', zIndex: 100 - Math.round(depth * 10),
              filter: `brightness(${1 - Math.min(depth, 3) * 0.055})`,
              transform: `translate(-50%, -50%) translateX(${distance * stride}px) perspective(1100px) rotateY(${rotate}deg) scale(${scale})`,
              transition: gesture.current || reduced ? 'none' : 'transform 360ms cubic-bezier(.2,.8,.2,1)' }}>
            {item.label && <div className="tm-card-label" style={{ color: item.accent, opacity: Math.abs(distance) < 0.3 ? 0 : 1 }}>{item.label}</div>}
            <button type="button" className={`tm-card${index === selected ? ' tm-card-current' : ''}`} aria-label={item.accessible}
              aria-current={index === selected ? 'true' : undefined}
              aria-pressed={canFlip ? !!flipped : undefined}
              onClick={() => {
                if (suppressClick.current) return;
                if (index === selected) onOpen?.();
                else choose(index);
              }}>
              <span aria-hidden="true" className={`tm-card-inner${flipped && canFlip ? ' tm-flipped' : ''}${reduced ? ' tm-reduced' : ''}`}>
                <span className="tm-card-front">
                  {item.anime.poster ? <img src={posterUrl(item.anime.poster)} alt="" draggable={false} />
                    : <span className="tm-placeholder" aria-hidden="true">🌸</span>}
                </span>
                {canFlip && <span className="tm-card-back"><span className="tm-note-heading">短评</span><span className="tm-note-text">{item.anime.note.trim()}</span></span>}
              </span>
            </button>
            <div className="tm-reflection" aria-hidden="true">
              {flipped && canFlip
                ? <div className="tm-reflection-note">短评</div>
                : item.anime.poster ? <img src={posterUrl(item.anime.poster)} alt="" draggable={false} />
                  : <span className="tm-placeholder">🌸</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TimeMachine({ onClose }: { onClose: () => void }) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [records, setRecords] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quarterIndex, setQuarterIndex] = useState<number | null>(null);
  const [workIndex, setWorkIndex] = useState(0);
  const [workFlipped, setWorkFlipped] = useState(false);
  const [showWorks, setShowWorks] = useState(false);
  const reduced = !!useReducedMotion();
  const quarters = useMemo(() => makeQuarters(records), [records]);
  const currentIndex = quarterIndex ?? initialQuarter(quarters);
  const quarter = quarters[currentIndex];
  const workArrangement = useMemo(() => arrangeAroundWinner(quarter?.items ?? []), [quarter]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    backButtonRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    let active = true;
    data.list('watched').then((items) => { if (active) setRecords(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const closeOrBack = () => { if (showWorks) setShowWorks(false); else onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') closeOrBack(); };
    const androidWindow = window as Window & { __sakurareelAndroidBack?: () => boolean };
    const previous = androidWindow.__sakurareelAndroidBack;
    androidWindow.__sakurareelAndroidBack = () => { closeOrBack(); return true; };
    window.addEventListener('keydown', key);
    return () => { androidWindow.__sakurareelAndroidBack = previous; window.removeEventListener('keydown', key); };
  }, [showWorks, onClose]);

  const quarterItems: FlowItem[] = quarters.map((q) => ({
    key: q.key, anime: q.items[0], label: `${q.year} 年 ${seasons[q.season].name}`,
    accent: seasons[q.season].color, accessible: `${q.year} 年${seasons[q.season].name}，${q.items.length} 部作品`,
  }));
  const workItems: FlowItem[] = workArrangement.items.map((anime) => ({
    key: String(anime.id), anime, label: '', accent: '#eee',
    accessible: `${anime.title}，${anime.watch_date}，${anime.rating ? `${anime.rating} 分` : '未评分'}${anime.note.trim() ? workFlipped && anime === workArrangement.items[workIndex] ? `，短评：${anime.note.trim()}` : '，点击翻面查看短评' : ''}`,
  }));
  const activeWork = workArrangement.items[workIndex];

  return (
    <motion.div className="tm-screen" role="dialog" aria-modal="true" aria-label="时光机"
      initial={reduced ? { opacity: 0 } : { y: '-100%' }}
      animate={reduced ? { opacity: 1, transition: { duration: 0.12 } } : { y: 0, transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] } }}
      exit={reduced ? { opacity: 0, transition: { duration: 0.1 } } : { y: '-100%', transition: { duration: 0.38, ease: [0.64, 0, 0.78, 0] } }}>
      <div className="tm-content">
      <header className="tm-header">
        <button ref={backButtonRef} type="button" className="tm-back" onClick={() => showWorks ? setShowWorks(false) : onClose()}>
          ← {showWorks ? '返回季度' : '返回首页'}
        </button>
        <span className="tm-heading">时光机</span>
      </header>
      {loading ? <div className="tm-message">正在翻阅回忆…</div> : error ? (
        <div className="tm-message">{error}<button onClick={onClose}>返回首页</button></div>
      ) : !quarter ? (
        <div className="tm-message">还没有可按季度浏览的观看记录<button onClick={onClose}>返回首页</button></div>
      ) : (
        <>
          <div className="tm-title" aria-live="polite">
            {showWorks ? <><span>{quarter.year} 年</span> <span style={{ color: seasons[quarter.season].color }}>{seasons[quarter.season].name}</span><small> · 本季作品</small></>
              : <><span>{quarter.year} 年</span> <span style={{ color: seasons[quarter.season].color }}>{seasons[quarter.season].name}</span></>}
          </div>
          <CoverFlow key={showWorks ? `works-${quarter.key}` : 'quarters'}
            items={showWorks ? workItems : quarterItems} selected={showWorks ? workIndex : currentIndex}
            onSelect={showWorks ? (index) => { setWorkIndex(index); setWorkFlipped(false); } : setQuarterIndex}
            onOpen={showWorks ? () => { if (activeWork?.note.trim()) setWorkFlipped((value) => !value); } : () => { setWorkIndex(workArrangement.center); setWorkFlipped(false); setShowWorks(true); }}
            flippable={showWorks} flipped={showWorks && workFlipped} reduced={reduced} />
          <div className="tm-detail" aria-live="polite">
            {showWorks && activeWork ? <>
              <h2>{activeWork.title}</h2><p>{activeWork.watch_date.replace('-', ' 年 ')} 月</p>
              <strong style={{ color: getRatingColor(activeWork.rating) }}>{activeWork.rating ? `${activeWork.rating} 分` : '未评分'}</strong>
            </> : <><p>{quarter.season * 3 + 1}–{quarter.season * 3 + 3} 月</p><strong>{quarter.items.length} 部作品</strong></>}
          </div>
          <div className="tm-controls" aria-label="切换封面">
            <button type="button" disabled={(showWorks ? workIndex : currentIndex) === 0} onClick={() => {
              if (showWorks) { setWorkIndex(Math.max(0, workIndex - 1)); setWorkFlipped(false); } else setQuarterIndex(Math.max(0, currentIndex - 1)); touchFeedback();
            }} aria-label="上一张">‹</button>
            <button type="button" disabled={(showWorks ? workIndex : currentIndex) >= (showWorks ? workItems : quarterItems).length - 1} onClick={() => {
              if (showWorks) { setWorkIndex(Math.min(workItems.length - 1, workIndex + 1)); setWorkFlipped(false); } else setQuarterIndex(Math.min(quarterItems.length - 1, currentIndex + 1)); touchFeedback();
            }} aria-label="下一张">›</button>
          </div>
        </>
      )}
      </div>
    </motion.div>
  );
}
