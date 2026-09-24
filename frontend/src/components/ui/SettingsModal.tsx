import React from 'react';
import { Modal } from './Modal';
import { useLanguage } from '../../context/LanguageContext';
import { UserProfile } from '../../types';
import { Globe, Check, User, Shield, Users } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
          <Globe className="w-5 h-5 text-blue-600" />
          <span>{t('settingsTitle', 'System Settings')}</span>
        </div>
      }
      description={t('settingsDesc', 'Configure interface language, appearance, and workspace preferences.')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-lg text-xs font-semibold shadow-xs transition-all"
          >
            {t('close', 'Close')}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Language Selection Card */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-slate-500" />
                <span>{t('interfaceLanguage', 'Interface Language')}</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('interfaceLanguageDesc', 'Choose your preferred language for the application.')}
              </p>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
              {language === 'ar' ? 'العربية' : 'English'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* English Option */}
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                language === 'en'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-[13px] font-bold text-slate-900">English</span>
                {language === 'en' && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500">
                Left-to-right (LTR) layout
              </span>
            </button>

            {/* Arabic Option */}
            <button
              type="button"
              onClick={() => setLanguage('ar')}
              className={`p-3.5 rounded-xl border text-right transition-all flex flex-col justify-between ${
                language === 'ar'
                  ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1 flex-row-reverse">
                <span className="text-[13px] font-bold text-slate-900 font-['Cairo']">العربية</span>
                {language === 'ar' && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 font-['Cairo']">
                تخطيط من اليمين لليسار (RTL)
              </span>
            </button>
          </div>
        </div>

        {/* Account Details Section */}
        {currentUser && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {t('accountInfo', 'Account Information')}
            </h4>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('signedInAs', 'Signed in as')}</span>
                </div>
                <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                  {currentUser.full_name} ({currentUser.email})
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/50 pt-2">
                <div className="flex items-center gap-2 text-slate-600">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('roleLabel', 'Assigned Role')}</span>
                </div>
                <span className="font-mono font-medium text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {currentUser.role}
                </span>
              </div>

              {currentUser.team_id && (
                <div className="flex items-center justify-between border-t border-slate-200/50 pt-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('committeeLabel', 'Committee Scope')}</span>
                  </div>
                  <span className="font-medium text-slate-800">
                    {currentUser.team_name || currentUser.team_id}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
