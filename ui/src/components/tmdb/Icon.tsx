import type { ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  upload: (
    <>
      <path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h13l4 4v14H3V3Z" />
      <path d="M7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  link: (
    <>
      <path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0m4 1 2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8Z" />
      <path d="m2 12 10 5 10-5M2 16l10 5 10-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 3v18m10-18v18M3 8h4m-4 8h4m10-8h4m-4 8h4" />
    </>
  ),
  money: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 7H9v5h6v5H9m3-12v14" />
    </>
  ),

  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3 6 0 1 4 4 1 1 6-4 2-1 4-6 1-2-4-4-1-1-6 4-2Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 7h14M5 17h14" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="7" r="4" />
      <path d="M8 11v10l3-3-2-2 2-2-3-3" />
    </>
  ),
  edit: (
    <>
      <path d="m14 5 5 5M4 20l1-6L16 3l5 5-11 11Z" />
      <path d="M13 21h8" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8" cy="9" r="1" />
      <path d="m3 17 5-5 5 5 3-3 5 5" />
    </>
  ),
  retry: (
    <>
      <path d="M20 10a8 8 0 1 0-2 8M20 3v7h-7" />
    </>
  ),
  back: <path d="m14 5-7 7 7 7" />,
  star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18m-13 4h1m3 0h1m3 0h1m-9 3h1m3 0h1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6H8" />
    </>
  ),
  note: (
    <>
      <path d="M4 4h16v13H9l-5 4Z" />
      <path d="M8 9h8m-8 4h6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-3 5-5 3 3-5Z" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V2m-4 4 4-4 4 4M7 9H4v12h16V9h-3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
    </>
  ),
  text: (
    <>
      <path d="M4 5h16M12 5v15M8 20h8" />
    </>
  ),
};
export default function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`tmdb-icon ${className}`}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.text}
    </svg>
  );
}
