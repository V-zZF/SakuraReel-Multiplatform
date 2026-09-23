import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Anime } from '../types';
import { posterUrl } from '../data';
import { getRatingColor } from './RatingCircle';

interface AnimeCardProps {
  anime: Anime;
  onClick: (anime: Anime) => void;
  /** 由 SortableCard 置入，拖拽中时隐藏交互 */
  isDragging?: boolean;
}

export default function AnimeCard({ anime, onClick, isDragging }: AnimeCardProps) {
  const [showNote, setShowNote] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭短评气泡
  useEffect(() => {
    if (!showNote) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (noteRef.current && !noteRef.current.contains(e.target as Node)) {
        setShowNote(false);
      }
    };
    // 延迟绑定避免立即触发
    const timer = setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showNote]);

  return (
    <div
      className="bg-white rounded-card overflow-hidden shadow-card hover:shadow-card-hover
                 transition-[box-shadow] duration-300 ease-out
                 cursor-pointer group"
      onClick={(e) => {
        // 拖拽中不触发点击
        if (isDragging) {
          e.stopPropagation();
          return;
        }
        onClick(anime);
      }}
    >
      {/* 海报区 */}
      <div className="aspect-[2/3] bg-primary-100 relative overflow-hidden">
        {anime.poster ? (
          <img
            src={posterUrl(anime.poster)}
            alt={anime.title}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.025]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl md:text-7xl opacity-25">🌸</span>
          </div>
        )}
        {/* 渐变遮罩 */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />

      </div>

      {/* 信息区 */}
      <div className="p-4 md:p-6">
        <h3 className="font-semibold text-[13px] md:text-[15px] text-gray-900 line-clamp-2 leading-snug mb-1
                       min-h-[2.25rem] md:min-h-[2.75rem]">
          {anime.title}
        </h3>
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            {/* 评分 — 点击弹出短评气泡 */}
            <div className="relative inline-block" ref={noteRef}>
              <span
                onClick={(e) => {
                  if (!isDragging && anime.note) {
                    e.stopPropagation();
                    setShowNote(!showNote);
                  }
                }}
                className={`text-lg md:text-2xl font-bold tabular-nums ${anime.note ? 'cursor-pointer hover:opacity-80' : ''}`}
                style={{ color: anime.rating > 0 ? getRatingColor(anime.rating) : '#C7C7CC' }}
                title={anime.note ? '点击查看短评' : undefined}
              >
                {anime.rating > 0 ? <>{anime.rating}<span className="text-xs md:text-sm font-medium ml-0.5">分</span></> : '--'}
              </span>

              {/* 短评气泡 */}
              <AnimatePresence>
                {showNote && anime.note && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 z-20
                               bg-white rounded-xl shadow-modal
                               px-3 py-2.5 min-w-[160px] max-w-[260px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs md:text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                      {anime.note}
                    </p>
                    {/* 小三角 */}
                    <div className="absolute top-full left-4 -mt-0.5
                                    w-2.5 h-2.5 bg-white rotate-45
                                    shadow-[2px_2px_3px_rgba(0,0,0,0.04)]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {anime.watch_date && (
              <div className="mt-1.5 text-[11px] md:text-[13px] text-[#C7C7CC]">
                📅 {anime.watch_date}
              </div>
            )}
          </div>

          {/* 播放按钮 — 底部与日期下端对齐 */}
          {anime.play_link && (
            <a
              href={anime.play_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-full
                         bg-primary-600 hover:bg-primary-700
                         shadow-lg hover:shadow-xl
                         flex items-center justify-center
                         transition-all duration-200 hover:scale-110"
              title="播放"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" className="md:w-[18px] md:h-[18px]">
                <path d="M8 5v14l11-7z" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
