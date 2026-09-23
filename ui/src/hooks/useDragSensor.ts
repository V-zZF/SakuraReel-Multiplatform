import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

/** 拖拽传感器：PointerSensor（鼠标+触控笔），移动 5px 即激活 */
export default function useDragSensor() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );
}
