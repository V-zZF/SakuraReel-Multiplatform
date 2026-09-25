import { motion } from 'framer-motion';
import { CATEGORIES } from '../types';

interface EmptyStateProps {
  category: string;
  onAdd: () => void;
}

export default function EmptyState({ category, onAdd }: EmptyStateProps) {
  const cat = CATEGORIES.find((c) => c.key === category);
  const emoji =
    category === 'watched' ? '📺' : category === 'watching' ? '🍿' : '📋';

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
        className="text-6xl mb-4"
      >
        {emoji}
      </motion.span>
      <p className="text-apple-gray text-lg mb-1">还没有{cat?.label}的影视剧</p>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onAdd}
        className="mt-3 px-5 py-2 bg-primary-100 text-primary-700 rounded-full
                   text-sm font-medium hover:bg-primary-200 transition-colors"
      >
        + 添加影视剧
      </motion.button>
    </motion.div>
  );
}
