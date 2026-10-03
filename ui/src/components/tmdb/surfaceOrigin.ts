let handoffAnchor: { x: number; y: number } | null = null;
export function captureSurfaceOrigin(element?: HTMLElement | null) {
  const el = element || (document.activeElement as HTMLElement | null);
  const rect = el?.getBoundingClientRect();
  if (rect?.width && el !== document.body)
    handoffAnchor = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function consumeSurfaceOrigin() {
  const anchor = handoffAnchor;
  handoffAnchor = null;
  return anchor;
}
