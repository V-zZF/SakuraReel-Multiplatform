import { motion } from 'framer-motion';

const CATEGORY_TABS = [
  { key: 'watched', label: '看过' },
  { key: 'watching', label: '在看' },
  { key: 'wantwatch', label: '想看' },
] as const;

interface NavBarProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  showLeaderboard: boolean;
  onToggleLeaderboard: () => void;
  isEditing: boolean;
  onToggleEditing: () => void;
}

export default function NavBar({
  activeCategory, onCategoryChange,
  showLeaderboard, onToggleLeaderboard,
  isEditing, onToggleEditing,
}: NavBarProps) {
  return (
    <motion.nav
      initial={{ y: -48, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 22, delay: 0.05 }}
      className="glass sticky top-0 z-50 border-b border-[#E5E5EA]/50 pt-[var(--safe-top)]"
    >
      <div className="max-w-[1600px] mx-auto px-4 py-4 relative">
        {/* 排行榜模式 */}
        {showLeaderboard ? (
          <div className="flex items-center justify-between">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleLeaderboard}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium
                         text-primary-600 hover:bg-primary-50 rounded-full transition-colors"
            >
              <span>←</span>
              <span>返回</span>
            </motion.button>
            <h1 className="text-lg font-bold text-primary-600 select-none">
              🏆 评分排行榜
            </h1>
            {/* 排序编辑按钮（排行榜模式） */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleEditing}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                isEditing
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-100/50 text-primary-600 hover:bg-primary-100'
              }`}
            >
              {isEditing ? <><span>✅</span><span>完成</span></> : <><span>✏️</span><span>排序</span></>}
            </motion.button>
          </div>
        ) : (
          <>
            {/* 排序编辑按钮（左上角） */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleEditing}
              className={`absolute left-4 top-4 flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-full transition-colors z-10 ${
                isEditing
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-100/50 text-primary-600 hover:bg-primary-100'
              }`}
            >
              {isEditing ? <><span>✅</span><span>完成</span></> : <><span>✏️</span><span>排序</span></>}
            </motion.button>

            {/* 右上角排行榜入口（编辑模式下隐藏） */}
            {!isEditing && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleLeaderboard}
                className="absolute right-4 top-4 flex items-center gap-1.5 px-3 py-1.5
                           rounded-full bg-primary-100/50 text-primary-600 text-sm font-medium
                           hover:bg-primary-100 transition-colors"
                title="评分排行榜"
              >
                <span>🏆</span>
                <span>排行</span>
              </motion.button>
            )}

            <h1 className="text-xl font-bold text-primary-600 text-center select-none">
              🌸 我的番剧收藏
            </h1>

            {/* 分类标签（编辑模式下隐藏） */}
            {!isEditing && (
              <div className="flex justify-center mt-3 gap-1">
                {CATEGORY_TABS.map((tab) => (
                  <motion.button
                    key={tab.key}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onCategoryChange(tab.key)}
                    className={`relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                      activeCategory === tab.key
                        ? 'text-primary-600'
                        : 'text-[#8E8E93] hover:text-primary-500'
                    }`}
                  >
                    {tab.label}
                    {activeCategory === tab.key && (
                      <motion.div
                        layoutId="category-underline"
                        className="absolute bottom-0 inset-x-0 mx-auto h-[2px] bg-primary-500 rounded-full"
                        style={{ width: '60%' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.nav>
  );
}
