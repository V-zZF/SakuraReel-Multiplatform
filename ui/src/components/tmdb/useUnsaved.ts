import { useEffect, useState } from 'react';
export function useUnsaved(dirty: boolean, busy: boolean, close: () => void) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  return { confirm, setConfirm, requestClose: () => { if (busy) return; if (dirty) setConfirm(true); else close(); } };
}
// A single history entry belongs to the whole dialog stack. Updating the stack
// in one microtask avoids removing a newly opened dialog during a React handoff.
const stack: { close: () => void }[] = [];
let skipPop = false;
let listening = false;
let queued = false;
function syncHistory() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    if (skipPop) return;
    if (stack.length && !history.state?.sakuraDialog) history.pushState({ ...history.state, sakuraDialog: true }, '');
    else if (!stack.length && history.state?.sakuraDialog) { skipPop = true; history.back(); }
  });
}
export function useDialogBack(close: () => void, enabled = true) {
  const [entry] = useState(() => ({ close }));
  entry.close = close;
  useEffect(() => {
    if (!enabled) return;
    if (!listening) {
      window.addEventListener('popstate', () => {
        if (skipPop) { skipPop = false; syncHistory(); return; }
        const top = stack.at(-1);
        if (top) { history.pushState({ ...history.state, sakuraDialog: true }, ''); top.close(); }
      });
      listening = true;
    }
    stack.push(entry); syncHistory();
    return () => { const index = stack.indexOf(entry); if (index >= 0) stack.splice(index, 1); syncHistory(); };
  }, [enabled, entry]);
}
