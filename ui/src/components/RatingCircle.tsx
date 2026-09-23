import { useState, useEffect, useRef } from 'react';

// 根据评分返回颜色
export function getRatingColor(rating: number): string {
  if (rating === 0) return '#E5E5EA';
  if (rating <= 3) return '#C7C7CC';
  if (rating <= 5) return '#F8A5B6';
  if (rating <= 7) return '#F08080';
  if (rating <= 9) return '#E88398';
  return '#E2556B';
}

interface RatingCircleProps {
  rating: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  animate?: boolean; // 是否播放入场动画
}

// 数字递增 Hook
function useCountUp(target: number, duration: number, active: boolean) {
  const [value, setValue] = useState(active ? target : 0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }

    const start = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOut 缓动
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(start + (target - start) * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    // 短暂延迟后开始，让圆环先开始画
    const delay = setTimeout(() => {
      frameRef.current = requestAnimationFrame(step);
    }, 100);

    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, active]);

  return value;
}

export default function RatingCircle({
  rating,
  size = 42,
  strokeWidth = 3,
  showLabel = true,
  animate = true,
}: RatingCircleProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringColor = getRatingColor(rating);

  // 动画状态
  const [animReady, setAnimReady] = useState(!animate);
  const animatedRating = useCountUp(rating, 600, animate);

  // 触发圆环绘制动画
  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setAnimReady(true), 50);
      return () => clearTimeout(t);
    }
  }, [animate]);

  // 圆环进度：动画前 = 0，动画后 = 目标值
  const displayProgress = animReady ? rating / 10 : 0;
  const displayOffset = circumference * (1 - displayProgress);

  return (
    <div className="flex items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="flex-shrink-0"
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E5EA"
          strokeWidth={strokeWidth}
        />
        {/* 进度圆环 */}
        {rating > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={displayOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              transition: animReady
                ? 'stroke-dashoffset 0.8s cubic-bezier(0.25, 0.1, 0.25, 1)'
                : 'none',
            }}
          />
        )}
      </svg>
      {showLabel && (
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: rating === 0 ? '#C7C7CC' : '#2D2D2D' }}
        >
          {rating === 0 ? '--' : animatedRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
