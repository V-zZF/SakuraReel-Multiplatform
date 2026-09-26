import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AnimeCard from './AnimeCard';
import type { Anime } from '../types';
import { motion } from 'framer-motion';
import useCardTilt from '../hooks/useCardTilt';

interface SortableCardProps {
  anime: Anime;
  onClick: (anime: Anime) => void;
  disabled?: boolean;
}

export default function SortableCard({ anime, onClick, disabled = false }: SortableCardProps) {
  const tilt = useCardTilt(disabled, 1);
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
    <div ref={setNodeRef} style={style} className="relative aspect-[0.5] min-w-0">
      <motion.div className={`h-full rounded-card transition-shadow duration-200 ${tilt.hovered ? 'shadow-card-hover' : ''}`}
        style={tilt.style} onPointerMove={tilt.onPointerMove} onPointerLeave={tilt.onPointerLeave}>
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
