/**
 * Design tokens.
 *
 * Every colour is declared as a full 50-950 ramp so no utility class can ever
 * resolve to "no colour" (a class Tailwind does not generate is silently
 * dropped, which is how text ends up unstyled). Status families are aliased
 * to the same ramps so existing usage stays coherent.
 *
 * @type {import('tailwindcss').Config}
 */
const slate = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
  400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
  800: '#1e293b', 900: '#0f172a', 950: '#020617',
};

const brand = {
  50: '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd',
  400: '#608afa', 500: '#3b66f6', 600: '#2547eb', 700: '#1d35d8',
  800: '#1e2bad', 900: '#1e2a89', 950: '#171c54',
};

const green = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
  400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
  800: '#065f46', 900: '#064e3b', 950: '#022c22',
};

const amber = {
  50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
  400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
  800: '#92400e', 900: '#78350f', 950: '#451a03',
};

const red = {
  50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
  400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c',
  800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a',
};

const blue = {
  50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
  400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
  800: '#1e40af', 900: '#1e3a8a', 950: '#172554',
};

const violet = {
  50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
  400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
  800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
};

const cyan = {
  50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9',
  400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490',
  800: '#155e75', 900: '#164e63', 950: '#083344',
};

const stone = {
  50: '#fafaf9', 100: '#f5f5f4', 200: '#e7e5e4', 300: '#d6d3d1',
  400: '#a8a29e', 500: '#78716c', 600: '#57534e', 700: '#44403c',
  800: '#292524', 900: '#1c1917', 950: '#0c0a09',
};

const ramp = (scale) => Object.fromEntries(
  Object.entries(scale).map(([shade, hex]) => [
    shade,
    `rgb(${hex.replace('#', '').match(/[a-f\d]{2}/gi).map((c) => parseInt(c, 16)).join(' ')} / <alpha-value>)`,
  ]),
);

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: ramp(slate),
        brand: ramp(brand),
        green: ramp(green),
        emerald: ramp(green),
        amber: ramp(amber),
        yellow: ramp(amber),
        orange: ramp(amber),
        red: ramp(red),
        rose: ramp(red),
        pink: ramp(red),
        blue: ramp(blue),
        violet: ramp(violet),
        purple: ramp(violet),
        indigo: ramp(violet),
        fuchsia: ramp(violet),
        cyan: ramp(cyan),
        sky: ramp(cyan),
        teal: ramp(cyan),
        stone: ramp(stone),
        neutral: ramp(stone),
        zinc: ramp(stone),
        lime: ramp(green),
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'Cairo', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Cairo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        arabic: ['Cairo', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sm: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
        md: '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.04)',
        lg: '0 12px 32px -8px rgb(15 23 42 / 0.14), 0 4px 10px -4px rgb(15 23 42 / 0.06)',
        drawer: '0 24px 64px -16px rgb(15 23 42 / 0.28)',
      },
      spacing: {
        '4.5': '1.125rem', '13': '3.25rem', '15': '3.75rem', '18': '4.5rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'drawer-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out both',
        'rise-in': 'rise-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-in': 'sheet-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        blink: 'blink 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
