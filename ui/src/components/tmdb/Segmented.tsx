import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
export default function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const reduced = useReducedMotion();
  return (
    <div
      className="tmdb-segment tmdb-motion-segment"
      role="group"
      aria-label={label}
    >
      {options.map(([key, title]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {value === key && (
            <motion.span
              className="tmdb-segment-selection"
              layoutId={reduced ? undefined : `segment-${id}`}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 440, damping: 38 }
              }
            />
          )}
          <span className="tmdb-segment-label">{title}</span>
        </button>
      ))}
    </div>
  );
}
