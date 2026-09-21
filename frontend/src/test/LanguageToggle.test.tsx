import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider, useLanguage, LANGUAGE_STORAGE_KEY } from '../context/LanguageContext';
import { SettingsModal } from '../components/ui/SettingsModal';

const TestComponent = () => {
  const { language, direction, isRtl, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="dir">{direction}</span>
      <span data-testid="isRtl">{isRtl ? 'true' : 'false'}</span>
      <span data-testid="translated">{t('operationsOverview')}</span>
      <button onClick={() => setLanguage('ar')}>Switch to Arabic</button>
      <button onClick={() => setLanguage('en')}>Switch to English</button>
    </div>
  );
};

describe('LanguageContext and Settings Language Toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
  });

  it('defaults to English with LTR direction and translates correctly', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId('lang').textContent).toBe('en');
    expect(screen.getByTestId('dir').textContent).toBe('ltr');
    expect(screen.getByTestId('isRtl').textContent).toBe('false');
    expect(screen.getByTestId('translated').textContent).toBe('Operations Overview');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches to Arabic, updates direction to RTL, translates and persists in localStorage', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Switch to Arabic'));

    expect(screen.getByTestId('lang').textContent).toBe('ar');
    expect(screen.getByTestId('dir').textContent).toBe('rtl');
    expect(screen.getByTestId('isRtl').textContent).toBe('true');
    expect(screen.getByTestId('translated').textContent).toBe('نظرة عامة على العمليات');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
  });

  it('restores language choice from localStorage upon initialization', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');

    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId('lang').textContent).toBe('ar');
    expect(screen.getByTestId('dir').textContent).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('allows switching language via SettingsModal cleanly', () => {
    render(
      <LanguageProvider>
        <SettingsModal
          isOpen={true}
          onClose={() => {}}
          currentUser={{
            id: 'u1',
            email: 'admin@studentops.org',
            full_name: 'System Admin',
            role: 'region_hr_head',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          }}
        />
      </LanguageProvider>
    );

    // Verify Arabic button is present in settings modal
    const arabicBtn = screen.getByRole('button', { name: /العربية/i });
    expect(arabicBtn).toBeInTheDocument();

    fireEvent.click(arabicBtn);

    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
