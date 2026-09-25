import type { ReactNode } from 'react';

type IconName = 'poster' | 'title' | 'category' | 'date' | 'rating' | 'note' | 'link';

const paths: Record<IconName, ReactNode> = {
  poster: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m3 17 5-5 4 4 3-3 6 6" /></>,
  title: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
  category: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  date: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18" /></>,
  rating: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z" />,
  note: <><path d="M4 4h16v13H9l-5 4V4Z" /><path d="M8 9h8m-8 4h6" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
};

export default function FieldIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 shrink-0 text-primary-600 ${className}`}>{paths[name]}</svg>;
}
