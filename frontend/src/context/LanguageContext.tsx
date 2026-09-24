import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, Direction, TRANSLATIONS } from '../lib/translations';

export const LANGUAGE_STORAGE_KEY = 'studentops_language';

interface LanguageContextValue {
  language: Language;
  direction: Direction;
  isRtl: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, defaultText?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'ar' || stored === 'en') {
        return stored;
      }
    } catch {
      // Fallback
    }
    return 'en';
  });

  const direction: Direction = language === 'ar' ? 'rtl' : 'ltr';
  const isRtl = direction === 'rtl';

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage errors
    }

    // Update document HTML direction and lang attribute
    document.documentElement.dir = direction;
    document.documentElement.lang = language;

    // Apply class for scoped fonts or styling if needed
    if (language === 'ar') {
      document.body.classList.add('rtl-layout');
    } else {
      document.body.classList.remove('rtl-layout');
    }
  }, [language, direction]);

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'en' ? 'ar' : 'en'));
  };

  const t = (key: string, defaultText?: string): string => {
    const dict = TRANSLATIONS[language];
    if (dict && dict[key]) {
      return dict[key];
    }
    const enDict = TRANSLATIONS['en'];
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return defaultText !== undefined ? defaultText : key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        direction,
        isRtl,
        setLanguage,
        toggleLanguage,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback for tests and standalone components
    return {
      language: 'en',
      direction: 'ltr',
      isRtl: false,
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (key: string, defaultText?: string) => TRANSLATIONS.en[key] || defaultText || key,
    };
  }
  return context;
};
