import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, CollisionDetection } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useAnime } from './hooks/useAnime';
import type { Anime, AnimeInput } from './types';
import NavBar from './components/NavBar';
import SortableCard from './components/SortableCard';
import Spinner from './components/Spinner';
import AnimeModal from './components/AnimeModal';
import LeaderBoard from './components/LeaderBoard';
import Toast, { type ToastMessage } from './components/Toast';
import AnimeCard from './components/AnimeCard';
import useDragSensor from './hooks/useDragSensor';

// 页面过渡动画
const pageTransition = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
  transition: { type: 'spring' as const, stiffness: 250, damping: 24 },
};

const pageTransitionBack = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 30 },
  transition: { type: 'spring' as const, stiffness: 250, damping: 24 },
};

export default function App() {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnime, setEditingAnime] = useState<Anime | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('watched');
  const [activeDragId, setActiveDragId] = useState<number | null>(null);
  const toastIdRef = useRef(0);

  const {
    animeList, setAnimeList, loading, error, fetchList,
    create, update, remove, reorder, uploadPoster,
  } = useAnime();

  const sensors = useDragSensor();

  // 切换视图时退出编辑模式
  const handleToggleLeaderboard = useCallback(() => {
    setShowLeaderboard((v) => !v);
    setIsEditing(false);
  }, []);

  // 切换编辑模式
  const handleToggleEditing = useCallback(() => {
    setIsEditing((v) => !v);
  }, []);

  // 获取番剧列表（按分类筛选）
  useEffect(() => {
    fetchList(activeCategory);
  }, [fetchList, activeCategory]);

  // 按 watch_date DESC → position ASC 排序（无日期放最后）
  const sortedList = useMemo(() => {
    return [...animeList].sort((a, b) => {
      // 无日期的排到最后
      if (a.watch_date !== b.watch_date) {
        if (a.watch_date === '') return 1;
        if (b.watch_date === '') return -1;
        return b.watch_date.localeCompare(a.watch_date); // 晚→早
      }
      // 同月内按 position 升序
      return a.position - b.position;
    });
  }, [animeList]);

  // 自定义碰撞检测：只允许同月内拖拽
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeItem = sortedList.find((a) => a.id === args.active.id);
    if (!activeItem) return [];

    const sameMonthContainers = args.droppableContainers.filter((container) => {
      const item = sortedList.find((a) => a.id === container.id);
      return item && item.watch_date === activeItem.watch_date;
    });

    return closestCenter({
      ...args,
      droppableContainers: sameMonthContainers,
    });
  }, [sortedList]);

  // 拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as number);
  }, []);

  // Toast
  const showToast = useCallback((text: string, type: 'success' | 'error') => {
    toastIdRef.current += 1;
    const id = String(toastIdRef.current);
    setToasts((prev) => [...prev, { id, text, type }]);
  }, []);

  // 拖拽排序结束
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      if (!over) showToast('同月份的番剧才能排序', 'error');
      return;
    }

    // 跨月拖拽 → 弹回
    const activeItem = sortedList.find((a) => a.id === active.id);
    const overItem = sortedList.find((a) => a.id === over.id);
    if (!activeItem || !overItem) return;
    if (activeItem.watch_date !== overItem.watch_date) {
      showToast('同月份的番剧才能排序', 'error');
      return;
    }

    setAnimeList((prev) => {
      const oldIdx = prev.findIndex((a) => a.id === active.id);
      const newIdx = prev.findIndex((a) => a.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const newList = arrayMove(prev, oldIdx, newIdx);
      const updated = newList.map((a, i) => ({ ...a, position: i }));
      reorder('home', updated.map((a, i) => ({ id: a.id, position: i })));
      return updated;
    });
  }, [reorder, sortedList, showToast]);

  // 拖拽取消
  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 打开添加弹窗
  const openAdd = useCallback(() => {
    setEditingAnime(null);
    setModalOpen(true);
  }, []);

  // 打开编辑弹窗（编辑模式下不触发）
  const openEdit = useCallback((anime: Anime) => {
    if (isEditing) return;
    setEditingAnime(anime);
    setModalOpen(true);
  }, [isEditing]);

  // 关闭弹窗
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingAnime(null);
  }, []);

  // 保存（创建或更新）
  const handleSave = useCallback(async (input: AnimeInput) => {
    try {
      if (editingAnime) {
        await update(editingAnime.id, input);
        showToast('番剧已更新', 'success');
      } else {
        await create(input);
        showToast('番剧已添加', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '操作失败', 'error');
      throw e;
    }
  }, [editingAnime, create, update, showToast]);

  // 删除
  const handleDelete = useCallback(async (id: number) => {
    try {
      await remove(id);
      showToast('番剧已删除', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除失败', 'error');
      throw e;
    }
  }, [remove, showToast]);

  // 上传海报
  const handleUpload = useCallback(async (file: File): Promise<string> => {
    try {
      return await uploadPoster(file);
    } catch (e) {
      showToast(e instanceof Error ? e.message : '上传失败', 'error');
      throw e;
    }
  }, [uploadPoster, showToast]);

  // 找到拖拽中的番剧（用于 DragOverlay）
  const draggingAnime = activeDragId
    ? sortedList.find((a) => a.id === activeDragId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Toast 通知 */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* 导航栏 */}
      <NavBar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        showLeaderboard={showLeaderboard}
        onToggleLeaderboard={handleToggleLeaderboard}
        isEditing={isEditing}
        onToggleEditing={handleToggleEditing}
      />

      {/* 内容区 */}
      <AnimatePresence mode="wait">
        {showLeaderboard ? (
          <motion.div
            key="leaderboard"
            {...pageTransition}
            className="py-6"
          >
            <LeaderBoard onEditAnime={openEdit} isEditing={isEditing} onToast={showToast} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            {...pageTransitionBack}
          >
            <main className="max-w-[1600px] mx-auto px-4 md:px-3 py-6">
              {/* 编辑模式提示条 */}
              <AnimatePresence>
                {isEditing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-3"
                  >
                    <p className="text-center text-sm text-primary-600 bg-primary-50 rounded-full py-1.5">
                      按住 ⠿ 拖动卡片调整顺序，完成后点击「✅ 完成」
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 加载状态 */}
              <AnimatePresence mode="wait">
                {loading && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Spinner />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 错误提示 */}
              {error && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-8"
                >
                  <p className="text-apple-red text-sm">{error}</p>
                  <button
                    onClick={() => fetchList(activeCategory)}
                    className="mt-2 text-primary-600 text-sm underline"
                  >
                    重试
                  </button>
                </motion.div>
              )}

              {/* 卡片列表 / 空状态 */}
              {!loading && !error && (
                sortedList.length === 0 ? (
                  <div className="text-center py-16">
                    <span className="text-5xl">📋</span>
                    <p className="mt-3 text-sm text-apple-gray">还没有添加任何番剧</p>
                    <button
                      onClick={openAdd}
                      className="mt-4 px-5 py-2 rounded-full bg-primary-600 text-white text-sm font-medium
                                 hover:bg-primary-700 transition-colors"
                    >
                      添加第一部番剧
                    </button>
                  </div>
                ) : (
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
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))]
                                    md:grid-cols-6
                                    gap-4">
                        {sortedList.map((anime) => (
                          <SortableCard
                            key={anime.id}
                            anime={anime}
                            onClick={openEdit}
                            disabled={!isEditing}
                          />
                        ))}
                      </div>
                    </SortableContext>

                    {/* 拖拽克隆体（iOS 风格） */}
                    <DragOverlay
                      dropAnimation={{
                        duration: 250,
                        easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.2)',
                      }}
                    >
                      {draggingAnime ? (
                        <div className="scale-105 shadow-card-hover rounded-card overflow-hidden">
                          <AnimeCard anime={draggingAnime} onClick={() => {}} />
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )
              )}
            </main>

            {/* 页脚署名 */}
            <footer className="text-center py-6 pb-24">
              <span className="text-xs text-[#C7C7CC]">Made by VzZF · v0.4</span>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB 添加按钮（编辑模式或排行榜模式下隐藏） */}
      {!showLeaderboard && !isEditing && (
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={openAdd}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.3 }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 hover:bg-primary-700
                     text-white rounded-full shadow-lg flex items-center justify-center
                     text-2xl transition-colors duration-200 z-40"
          title="添加番剧"
        >
          +
        </motion.button>
      )}

      {/* 添加/编辑弹窗 */}
      <AnimeModal
        isOpen={modalOpen}
        anime={editingAnime}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
        onUpload={handleUpload}
      />
    </div>
  );
}
