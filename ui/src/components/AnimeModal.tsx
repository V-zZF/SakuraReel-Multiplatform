import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Anime, AnimeInput } from '../types';
import { CATEGORIES } from '../types';
import { posterUrl } from '../data';
import { getRatingColor } from './RatingCircle';
import FieldIcon from './FieldIcon';

interface AnimeModalProps {
  isOpen: boolean;
  anime: Anime | null;        // null = 添加模式
  onClose: () => void;
  onSave: (input: AnimeInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onUpload: (file: File) => Promise<string>;
}

// 动画变体（桌面端）
const desktopOverlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
const desktopModal = {
  initial: { opacity: 0, scale: 0.92, y: 20 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
};

// 动画变体（移动端 Bottom Sheet）
const mobileModal = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
};

export default function AnimeModal({
  isOpen,
  anime,
  onClose,
  onSave,
  onDelete,
  onUpload,
}: AnimeModalProps) {
  const isEdit = anime !== null;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('wantwatch');
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [playLink, setPlayLink] = useState('');
  const [poster, setPoster] = useState('');
  const [watchDate, setWatchDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检测移动端
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 打开弹窗时填充数据
  useEffect(() => {
    if (isOpen) {
      if (anime) {
        setTitle(anime.title);
        setCategory(anime.category);
        setRating(anime.rating);
        setNote(anime.note);
        setPlayLink(anime.play_link || '');
        setPoster(anime.poster);
        setWatchDate(anime.watch_date || '');
      } else {
        // 添加模式：重置表单
        setTitle('');
        setCategory('wantwatch');
        setRating(0);
        setNote('');
        setPlayLink('');
        setPoster('');
        setWatchDate('');
      }
    }
  }, [isOpen, anime]);

  // 处理海报上传
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const filename = await onUpload(file);
      setPoster(filename);
    } catch {
      // 上传失败由上层处理
    } finally {
      setUploading(false);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        category,
        rating,
        note: note.trim(),
        poster,
        watch_date: watchDate,
        play_link: playLink.trim(),
      });
      onClose();
    } catch {
      // 错误由上层处理
    } finally {
      setSaving(false);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!anime) return;
    setSaving(true);
    try {
      await onDelete(anime.id);
      onClose();
    } catch {
      // 错误由上层处理
    } finally {
      setSaving(false);
    }
  };

  const modalAnim = isMobile ? mobileModal : desktopModal;
  const canSave = title.trim().length > 0 && !saving;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
          {/* 遮罩层 */}
          <motion.div
            {...desktopOverlay}
            className="absolute inset-0 glass-overlay"
            onClick={onClose}
          />

          {/* 弹窗 / Bottom Sheet */}
          <motion.div
            {...modalAnim}
            className={`
              relative bg-white shadow-modal z-10 flex flex-col
              sm:rounded-modal sm:max-w-lg sm:w-[calc(100%-32px)] sm:max-h-[90vh] sm:m-4
              max-sm:rounded-t-modal max-sm:w-full max-sm:max-h-[85vh] max-sm:pb-[var(--safe-bottom)]
            `}
          >
            {/* 移动端拖拽指示条 */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-[#E5E5EA]" />
              </div>
            )}

            {/* 标题栏 */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-semibold text-gray-800">
                {isEdit ? '编辑影视剧' : '添加影视剧'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           text-apple-gray hover:bg-gray-100 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* 表单内容（可滚动） */}
            <div className="px-6 pb-6 overflow-y-auto flex-1 space-y-5">
              {/* 海报上传区 */}
              <div className="flex justify-center">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative cursor-pointer border-2 border-dashed rounded-xl
                    flex flex-col items-center justify-center
                    transition-colors overflow-hidden
                    w-[180px] h-[260px]
                    ${poster
                      ? 'border-transparent'
                      : 'border-[#E5E5EA] hover:border-primary-300 bg-primary-50/30'
                    }
                  `}
                >
                  {poster ? (
                    <img
                      src={posterUrl(poster)}
                      alt="海报预览"
                      className="w-full h-full object-cover"
                    />
                  ) : uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary rounded-full animate-spin" />
                      <span className="text-xs text-apple-gray">上传中...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-apple-gray">
                      <FieldIcon name="poster" className="w-9 h-9" />
                      <span className="text-sm">点击上传海报</span>
                      <span className="text-xs">jpg / png / webp</span>
                    </div>
                  )}
                  {/* 已有海报时，悬停显示更换提示 */}
                  {poster && !uploading && (
                    <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100
                                    transition-opacity flex items-center justify-center">
                      <span className="text-white text-sm font-medium">更换海报</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* 片名 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="title" />片名
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入影视剧名称"
                  maxLength={200}
                  className="w-full px-4 py-2.5 rounded-input bg-primary-50/50
                             text-sm text-gray-800 placeholder:text-[#C7C7CC]
                             focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30
                             transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
              </div>

              {/* 分类选择 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="category" />分类
                </label>
                <div className="flex bg-gray-100 rounded-input p-0.5">
                  {CATEGORIES.map((cat) => (
                    <motion.button
                      key={cat.key}
                      onClick={() => setCategory(cat.key)}
                      whileTap={{ scale: 0.96 }}
                      className={`flex-1 py-2.5 rounded-[10px] text-sm font-medium transition-colors ${
                        category === cat.key
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-apple-gray'
                      }`}
                    >
                      {cat.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 观看年月 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="date" />观看年月
                </label>
                <input
                  type="month"
                  value={watchDate}
                  onChange={(e) => setWatchDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-input bg-primary-50/50
                             text-sm text-gray-800
                             focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30
                             transition-colors"
                />
              </div>

              {/* 评分 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="rating" />评分
                </label>
                <div className="flex rounded-input overflow-hidden bg-gray-100">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <motion.button
                      key={n}
                      onClick={() => setRating(n)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${
                        rating === n
                          ? 'text-white'
                          : 'text-apple-gray hover:bg-gray-200/50'
                      }`}
                      style={
                        rating === n && n > 0
                          ? { backgroundColor: getRatingColor(n) }
                          : rating === n && n === 0
                            ? { backgroundColor: '#C7C7CC' }
                            : undefined
                      }
                      title={n === 0 ? '未评分' : `${n} 分`}
                    >
                      {n}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 短评 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="note" />短评
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="写点感想..."
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-input bg-primary-50/50
                             text-sm text-gray-800 placeholder:text-[#C7C7CC] resize-none
                             focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30
                             transition-colors"
                />
                <div className="text-right text-xs text-apple-gray mt-1">
                  {note.length}/500
                </div>
              </div>

              {/* 播放链接 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                  <FieldIcon name="link" />播放链接
                </label>
                <input
                  type="url"
                  value={playLink}
                  onChange={(e) => setPlayLink(e.target.value)}
                  placeholder="输入播放链接（如 https://...）"
                  maxLength={2000}
                  className="w-full px-4 py-2.5 rounded-input bg-primary-50/50
                             text-sm text-gray-800 placeholder:text-[#C7C7CC]
                             focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30
                             transition-colors"
                />
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 pb-6 pt-1 flex gap-3 sm:flex-row max-sm:flex-col">
              {isEdit && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-input text-sm font-medium
                             bg-apple-red/10 text-apple-red hover:bg-apple-red/20
                             transition-colors disabled:opacity-50 max-sm:order-3"
                >
                  删除
                </button>
              )}
              <div className="flex gap-3 flex-1 sm:justify-end">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-input text-sm font-medium
                             bg-gray-100 text-gray-600 hover:bg-gray-200
                             transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className="px-6 py-2.5 rounded-input text-sm font-medium
                             bg-primary-600 text-white hover:bg-primary-700
                             transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                             flex items-center gap-2"
                >
                  {saving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
