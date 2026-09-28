/** Deterministic color-coded initials avatar. Color is stable for any given name. */

const AVATAR_PALETTE = [
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-800',
  'bg-orange-100 text-orange-800',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function ProfileAvatar({ name, size = 'small' }: { name: string; size?: 'small' | 'large' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
  const colorClass = AVATAR_PALETTE[hashName(name) % AVATAR_PALETTE.length];
  const dimensions = size === 'large' ? 'h-32 w-32 text-3xl' : 'h-8 w-8 text-xs';
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${colorClass} ${dimensions}`}>
      {initials}
    </span>
  );
}
