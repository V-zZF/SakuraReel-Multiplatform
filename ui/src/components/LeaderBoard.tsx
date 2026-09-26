import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Anime } from '../types';
import { data, posterUrl } from '../data';
import useDragSensor from '../hooks/useDragSensor';
import { getRatingColor } from './RatingCircle';
import Spinner from './Spinner';
import useCardTilt from '../hooks/useCardTilt';

// ── SortableLeaderItem（内部组件，每个排行榜条目） ──

interface SortableLeaderItemProps {
  anime: Anime;
  index: number;
  onEdit: (anime: Anime) => void;
  disabled: boolean;
}

function SortableLeaderItem({ anime, index, onEdit, disabled }: SortableLeaderItemProps) {
  const tilt = useCardTilt(disabled, 1.35);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: anime.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0 : 1,
  };

  // 排名颜色（前三名特殊）
  function rankBadge(idx: number, rating: number) {
    if (rating === 0) return null;
    const colors: Record<number, string> = {
      0: 'text-[#FFD700]',
      1: 'text-[#C0C0C0]',
      2: 'text-[#CD7F32]',
    };
    return (
      <span className={`text-xs font-bold ${colors[idx] || 'text-[#C7C7CC]'}`}>
        #{idx + 1}
      </span>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <motion.div
        variants={listItem}
        initial="hidden"
        animate="visible"
        whileTap={disabled && !tilt.reduced ? { scale: 0.99 } : undefined}
        style={tilt.style}
        onPointerMove={tilt.onPointerMove}
        onPointerLeave={tilt.onPointerLeave}
        transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.75 }}
        onClick={() => {
          if (disabled) onEdit(anime);
        }}
        className={`bg-white rounded-card overflow-hidden shadow-leaderboard ${tilt.hovered ? 'shadow-[0_12px_30px_rgba(248,165,182,0.22)]' : ''}
                   flex items-stretch transition-[box-shadow] duration-300 ease-out relative
                   ${disabled ? 'cursor-pointer' : ''}`}
      >
      {/* 拖拽手柄（编辑模式下显示，仅此处可拖拽） */}
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center
                        w-5 h-5 rounded-full bg-white/80 backdrop-blur-sm
                        text-[#C7C7CC] text-[10px] leading-none select-none
                        cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
        >
          ⠿
        </div>
      )}

      {/* 海报缩略图 — 无边距 Bleed：左侧和上下紧贴卡片边缘 */}
      <div className="flex-shrink-0 w-[100px] rounded-l-[18px] overflow-hidden bg-primary-100">
        {anime.poster ? (
          <img
            src={posterUrl(anime.poster)}
            alt={anime.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">
            🌸
          </div>
        )}
      </div>

      {/* 信息区 + 评分区：垂直居中，海报右侧宽裕留白 */}
      <div className="flex-1 flex items-center min-w-0 pl-6 pr-5 py-5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {rankBadge(index, anime.rating)}
            <h3 className="font-medium text-[17px] md:text-[19px] text-gray-800 truncate">
              {anime.title}
            </h3>
          </div>
          {anime.watch_date && (
            <p className="mt-0.5 text-[11px] text-[#C7C7CC]">
              📅 {anime.watch_date}
            </p>
          )}
        </div>

        {/* 评分区 */}
        <div className="flex-shrink-0 flex items-center justify-center w-14 ml-4">
          {anime.rating > 0 ? (
            <span
              className="text-2xl font-bold tabular-nums"
              style={{ color: getRatingColor(anime.rating) }}
            >
              {anime.rating}<span className="text-sm font-medium ml-0.5">分</span>
            </span>
          ) : (
            <span className="text-xs text-[#C7C7CC]">未评分</span>
          )}
        </div>
      </div>
      </motion.div>
    </div>
  );
}

// ── 列表入场变体 ──

const listContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const listItem = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
};

// ── LeaderBoard 主组件 ──

interface LeaderBoardProps {
  onEditAnime: (anime: Anime) => void;
  isEditing: boolean;
  onToast?: (text: string, type: 'success' | 'error') => void;
}

export default function LeaderBoard({ onEditAnime, isEditing, onToast }: LeaderBoardProps) {
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // 拖拽传感器
  const sensors = useDragSensor();

  // 加载全部影视剧（独立 fetch）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    data.list()
      .then((data) => {
        if (!cancelled) setAnimeList(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 按评分降序（高→低），同分按 leaderboard_position 降序
  const sortedList = useMemo(() => {
    return [...animeList].sort((a, b) => b.rating - a.rating || b.leaderboard_position - a.leaderboard_position);
  }, [animeList]);

  // 用 ref 避免 handleDragEnd 依赖 sortedList
  const sortedListRef = useRef(sortedList);
  sortedListRef.current = sortedList;

  // 自定义碰撞检测：只允许同评分组内拖拽
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeItem = sortedListRef.current.find((a) => a.id === args.active.id);
    if (!activeItem) return [];

    const sameRatingContainers = args.droppableContainers.filter((container) => {
      const item = sortedListRef.current.find((a) => a.id === container.id);
      return item && item.rating === activeItem.rating;
    });

    return closestCenter({
      ...args,
      droppableContainers: sameRatingContainers,
    });
  }, []);

  // 拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
  }, []);

  // 拖拽结束：同分可排序
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      if (!over && active.id) onToast?.('同分数的影视剧才能排序', 'error');
      return;
    }

    const list = sortedListRef.current;
    const oldIdx = list.findIndex((a) => a.id === active.id);
    const newIdx = list.findIndex((a) => a.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    // 验证同评分
    const activeItem = list[oldIdx];
    const overItem = list[newIdx];
    if (activeItem.rating !== overItem.rating) {
      onToast?.('同分数的影视剧才能排序', 'error');
      return;
    }

    const newList = arrayMove([...list], oldIdx, newIdx);

    // 为所有项重新分配 leaderboard_position（越大越靠前）
    const maxPos = newList.length - 1;
    const items = newList.map((a, i) => ({ id: a.id, position: maxPos - i }));

    setAnimeList((prev) => {
      const posMap = new Map(items.map((item) => [item.id, item.position]));
      return prev.map((a) => {
        if (posMap.has(a.id)) {
          return { ...a, leaderboard_position: posMap.get(a.id)! };
        }
        return a;
      });
    });

    // 持久化
    void data.reorder('leaderboard', items).catch(() => {
      onToast?.('排序保存失败，请重试', 'error');
      void data.list().then(setAnimeList).catch(() => {});
    });
  }, [onToast]);

  // 拖拽取消
  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  // 拖拽中的影视剧（用于 DragOverlay）
  const draggingAnime = activeDragId
    ? sortedList.find((a) => a.id === activeDragId) ?? null
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-apple-gray">
            共 {animeList.length} 部
          </p>
          {isEditing && (
            <span className="text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
              按住 ⠿ 拖动调整顺序
            </span>
          )}
        </div>
      </div>

      {/* 加载 */}
      {loading && <Spinner />}

      {/* 错误 */}
      {error && !loading && (
        <div className="text-center py-12">
          <p className="text-apple-red text-sm">{error}</p>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && animeList.length === 0 && (
        <div className="text-center py-16">
          <span className="text-5xl">📋</span>
          <p className="mt-3 text-sm text-apple-gray">还没有添加任何影视剧</p>
        </div>
      )}

      {/* 列表 */}
      {!loading && !error && animeList.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={sortedList.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
            disabled={!isEditing}
          >
            <motion.div
              variants={listContainer}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {sortedList.map((anime, index) => (
                <SortableLeaderItem
                  key={anime.id}
                  anime={anime}
                  index={index}
                  onEdit={onEditAnime}
                  disabled={!isEditing}
                />
              ))}
            </motion.div>
          </SortableContext>

          {/* 拖拽克隆体 */}
          <DragOverlay
            dropAnimation={{
              duration: 250,
              easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.2)',
            }}
          >
            {draggingAnime ? (
              <div className="bg-white rounded-card overflow-hidden shadow-leaderboard-hover flex items-stretch scale-105">
                {/* 海报缩略图 — Bleed */}
                <div className="flex-shrink-0 w-[100px] rounded-l-[18px] overflow-hidden bg-primary-100">
                  {draggingAnime.poster ? (
                    <img
                      src={posterUrl(draggingAnime.poster)}
                      alt={draggingAnime.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl opacity-30">
                      🌸
                    </div>
                  )}
                </div>

                {/* 信息区 + 评分区 */}
                <div className="flex-1 flex items-center min-w-0 pl-6 pr-5 py-5">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[17px] md:text-[19px] text-gray-800 truncate">
                      {draggingAnime.title}
                    </h3>
                    {draggingAnime.watch_date && (
                      <p className="mt-0.5 text-[11px] text-[#C7C7CC]">
                        📅 {draggingAnime.watch_date}
                      </p>
                    )}
                  </div>

                  {/* 评分区 */}
                  <div className="flex-shrink-0 flex items-center justify-center w-14 ml-4">
                    {draggingAnime.rating > 0 ? (
                      <span
                        className="text-2xl font-bold tabular-nums"
                        style={{ color: getRatingColor(draggingAnime.rating) }}
                      >
                        {draggingAnime.rating}<span className="text-sm font-medium ml-0.5">分</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#C7C7CC]">未评分</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
