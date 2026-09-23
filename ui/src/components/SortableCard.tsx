import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AnimeCard from './AnimeCard';
import type { Anime } from '../types';

// 卡片入场变体
const cardItem = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
};

interface SortableCardProps {
  anime: Anime;
  onClick: (anime: Anime) => void;
  disabled?: boolean;
}

export default function SortableCard({ anime, onClick, disabled = false }: SortableCardProps) {
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

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <motion.div
        variants={cardItem}
        initial="hidden"
        animate="visible"
        exit="exit"
        whileHover={disabled ? { y: -3, scale: 1.012 } : undefined}
        whileTap={disabled ? { scale: 0.99 } : undefined}
        transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.75 }}
      >
        {/* 拖拽手柄（编辑模式下显示，仅此处可拖拽） */}
        {!disabled && (
          <div
            {...attributes}
            {...listeners}
            className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center
                          w-6 h-6 rounded-full bg-white/80 backdrop-blur-sm
                          text-[#C7C7CC] text-xs leading-none select-none
                          cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            ⠿
          </div>
        )}

        <AnimeCard
          anime={anime}
          onClick={onClick}
          isDragging={isDragging}
        />
      </motion.div>
    </div>
  );
}
