import { useState } from 'react';

/** Temporary portrait until account photos are supported by the API. */
export function ProfileAvatar({ name, size = 'small' }: { name: string; size?: 'small' | 'large' }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
  const dimensions = size === 'large' ? 'h-32 w-32 text-3xl' : 'h-8 w-8 text-xs';
  if (failed) {
    return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-teal-50 font-semibold text-teal-800 ${dimensions}`}>{initials}</span>;
  }
  return (
    <img
      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&h=240&q=80"
      alt="Temporary profile photo"
      width={size === 'large' ? 128 : 32}
      height={size === 'large' ? 128 : 32}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-slate-200 object-cover ${dimensions}`}
    />
  );
}
