import { useEffect, useState } from 'react';
import type { PointerEvent } from 'react';
import { useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export default function useCardTilt(enabled: boolean, strength = 1) {
  const reduced = !!useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rawLift = useMotionValue(0);
  const rotateX = useSpring(rawX, { stiffness: 220, damping: 24 });
  const rotateY = useSpring(rawY, { stiffness: 220, damping: 24 });
  const y = useSpring(rawLift, { stiffness: 220, damping: 24 });

  const reset = () => {
    rawX.set(0);
    rawY.set(0);
    rawLift.set(0);
    setHovered(false);
  };
  useEffect(() => {
    if (!enabled || reduced) {
      rawX.set(0);
      rawY.set(0);
      rawLift.set(0);
      setHovered(false);
    }
  }, [enabled, reduced, rawX, rawY, rawLift]);
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || reduced || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    rawX.set(-y * 2.5 * strength);
    rawY.set(x * 2.5 * strength);
    rawLift.set(-4 * strength);
    setHovered(true);
  };

  return {
    style: { rotateX, rotateY, y, transformPerspective: 900 },
    reduced,
    hovered: enabled && !reduced && hovered,
    onPointerMove,
    onPointerLeave: reset,
    reset,
  };
}
