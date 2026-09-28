import { LogOut, MessageSquare, Settings, UserRound } from 'lucide-react';
import { Menu } from './Menu';
import { useLanguage } from '../../context/LanguageContext';
import type { Language } from '../../lib/translations';
import { isChannelAdmin, type Role } from '../Sidebar';

/**
 * The account menu, opened from the avatar in the header.
 *
 * Channel settings appears only for the roles that may actually change the
 * channel. It is not rendered disabled for anyone else: a control the viewer
 * can never use is noise, and a greyed-out admin setting invites people to
 * ask why they cannot change something they were never allowed to change.
 */

const LANGUAGE_LABELS: Record<Language, { name: string; native: string }> = {
  en: { name: 'English', native: 'English' },
  ar: { name: 'Arabic', native: 'العربية' },
};

export function AccountMenu({
  role,
  fullName,
  avatar,
  onOpenProfile,
  onOpenSettings,
  onOpenChannelSettings,
  onSignOut,
}: {
  role: Role;
  fullName: string;
  avatar: React.ReactNode;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenChannelSettings: () => void;
  onSignOut: () => void;
}) {
  const { language, setLanguage } = useLanguage();
  const canAdminister = isChannelAdmin(role);

  const actions = [
    { key: 'profile', label: 'Profile', icon: <UserRound className="h-4 w-4" />, onSelect: onOpenProfile },
    { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, onSelect: onOpenSettings },
    ...(canAdminister
      ? [{
        key: 'channel',
        label: 'Channel settings',
        icon: <MessageSquare className="h-4 w-4" />,
        onSelect: onOpenChannelSettings,
      }]
      : []),
    { key: 'signout', label: 'Sign out', icon: <LogOut className="h-4 w-4" />, onSelect: onSignOut, tone: 'danger' as const },
  ];

  return (
    <Menu
      label="Account menu"
      actions={actions}
      header={(
        <div>
          <p className="truncate text-sm font-medium text-slate-900">{fullName}</p>
          <div className="mt-2">
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Language
            </span>
            <div role="radiogroup" aria-label="Language" className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map(code => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={language === code}
                  onClick={() => setLanguage(code)}
                  className={`min-h-9 flex-1 rounded-md px-2 text-xs font-medium transition-colors ${
                    language === code
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {LANGUAGE_LABELS[code].native}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    >
      {avatar}
    </Menu>
  );
}
