import { consumeSurfaceOrigin } from "./surfaceOrigin";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useIsPresent } from "framer-motion";
import Icon from "./Icon";
import type { ReactNode } from "react";
import "./tmdb.css";
import { useDialogBack } from "./useUnsaved";
let lockCount = 0;
let priorOverflow = "";

export default function Surface({
  title,
  onClose,
  children,
  leftLabel = "关闭",
  onBack,
  action,
  footer,
  pageKey,
  scrollRef,
  direction = 1,
  compact = false,
  headerAction = false,
  bare = false,
  floatingFooter = false,
  stable = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  direction?: number;
  compact?: boolean;
  headerAction?: boolean;
  bare?: boolean;
  floatingFooter?: boolean;
  stable?: boolean;
  leftLabel?: string;
  onBack?: () => void;
  action?: ReactNode;
  footer?: ReactNode;
  pageKey?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const [origin] = useState(() => {
    const rect = (
      document.activeElement as HTMLElement | null
    )?.getBoundingClientRect();
    const anchor = consumeSurfaceOrigin();
    if (!anchor && (!rect || !rect.width)) return "50% 50%";
    const mobile = innerWidth <= 640,
      width = mobile ? innerWidth : Math.min(512, innerWidth - 32),
      height = innerHeight * (mobile ? 0.85 : 0.9);
    const x = Math.max(
      0,
      Math.min(
        100,
        (((anchor?.x ?? rect!.x + rect!.width / 2) - (innerWidth - width) / 2) /
          width) *
          100,
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        100,
        (((anchor?.y ?? rect!.y + rect!.height / 2) -
          (innerHeight - height) / 2) /
          height) *
          100,
      ),
    );
    return `${x}% ${y}%`;
  });
  const ref = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useDialogBack(onBack || onClose);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    if (lockCount++ === 0) {
      priorOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    ref.current?.focus();
    return () => {
      if (--lockCount === 0) document.body.style.overflow = priorOverflow;
      prior?.focus();
    };
  }, []);
  useEffect(() => {
    ref.current?.focus();
    if (!scrollRef) body.current?.scrollTo(0, 0);
  }, [pageKey, scrollRef]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      className="tmdb-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.section
        initial={reduced ? false : { opacity: 0, scale: bare ? 0.88 : 0.965, y: bare ? 24 : 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: bare ? 0.9 : 0.965, y: bare ? 18 : 10 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 380, damping: 34 }
        }
        style={{ transformOrigin: origin }}
        ref={ref}
        tabIndex={-1}
        className={`tmdb-surface ${compact ? "tmdb-compact" : ""} ${bare ? "tmdb-bare" : ""} ${stable ? "tmdb-stable" : ""} ${floatingFooter ? "tmdb-floating" : ""}`}
        inert={!present}
        aria-hidden={!present || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Tab") {
            const nodes = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[role=button][tabindex]",
              ) || [],
            ).filter((n) => n.checkVisibility() && !n.closest("[inert]"));
            if (!nodes.length) return;
            const first = nodes[0],
              last = nodes.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {!bare && (
          <header className="tmdb-header">
            <h2>{title}</h2>
            <div className="tmdb-header-controls">
              <button
                className="tmdb-dismiss"
                aria-label={leftLabel}
                onClick={onBack || onClose}
              >
                <Icon name={onBack ? "back" : "close"} />
              </button>
              {headerAction && action}
            </div>
          </header>
        )}
        {bare && (
          <button
            className="tmdb-detail-dismiss"
            aria-label="关闭"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
        <div className="tmdb-scroll" ref={scrollRef || body}>
          <motion.div
            key={pageKey || title}
            className="tmdb-page-content"
            data-direction={direction >= 0 ? "forward" : "back"}
            initial={reduced ? false : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
          >
            {children}
          </motion.div>
        </div>
        {(footer || (action && !headerAction)) && (
          <footer
            className={`tmdb-footer ${action && !headerAction ? "tmdb-footer-actions" : ""}`}
          >
            {action && !headerAction && (
              <button onClick={onBack || onClose}>
                <Icon name="close" />
                取消
              </button>
            )}
            {footer}
            {!headerAction && action}
          </footer>
        )}
      </motion.section>
    </motion.div>
  );
}
export function UnsavedDialog({
  onSave,
  onDiscard,
  onContinue,
  busy,
}: {
  onSave: () => void;
  onDiscard: () => void;
  onContinue: () => void;
  busy?: boolean;
}) {
  return (
    <Surface title="有未保存的修改" onClose={onContinue} compact>
      <div className="tmdb-body tmdb-confirm-body">
        <div className="tmdb-confirm-symbol">
          <Icon name="save" />
        </div>
        <p>离开前要保存这些修改吗？</p>
        <div className="tmdb-actions">
          <button disabled={busy} onClick={onDiscard}>
            <Icon name="trash" />
            放弃修改
          </button>
          <button disabled={busy} onClick={onContinue}>
            <Icon name="edit" />
            继续编辑
          </button>
          <button className="tmdb-primary" disabled={busy} onClick={onSave}>
            <Icon name="check" />
            保存并关闭
          </button>
        </div>
      </div>
    </Surface>
  );
}
