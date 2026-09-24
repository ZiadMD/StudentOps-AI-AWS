/** @type {import('tailwindcss').Config} */
const cobalt = {
  50: '#eef3ff', 100: '#dfe8ff', 200: '#c3d3ff', 300: '#9bb4ff', 400: '#6c8afb',
  500: '#4a66f0', 600: '#3a4edb', 700: '#313fb8', 800: '#2b3893', 900: '#283375', 950: '#191f47',
};

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Visual remap only: existing `blue-*` utilities now render the cobalt brand accent.
        blue: cobalt,
        brand: cobalt,
        // Cool ink-tinted neutrals for a calmer, more premium surface hierarchy.
        slate: {
          50: '#f6f7fb', 100: '#eef0f6', 200: '#e1e4ee', 300: '#c9cedd', 400: '#98a0b8',
          500: '#6b7392', 600: '#4e5573', 700: '#383e58', 800: '#232842', 900: '#141830', 950: '#0b0e20',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Cairo', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(20 24 48 / 0.05)',
        sm: '0 1px 3px 0 rgb(20 24 48 / 0.07), 0 1px 2px -1px rgb(20 24 48 / 0.05)',
        DEFAULT: '0 2px 6px -1px rgb(20 24 48 / 0.07), 0 1px 3px -1px rgb(20 24 48 / 0.05)',
        md: '0 6px 16px -4px rgb(20 24 48 / 0.09), 0 2px 6px -2px rgb(20 24 48 / 0.05)',
        lg: '0 14px 30px -8px rgb(20 24 48 / 0.12), 0 4px 10px -4px rgb(20 24 48 / 0.06)',
        xl: '0 28px 56px -14px rgb(20 24 48 / 0.22), 0 8px 18px -8px rgb(20 24 48 / 0.10)',
        focus: '0 0 0 4px rgb(74 102 240 / 0.16)',
      },
      backdropBlur: { xs: '3px' },
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        'sop-fade': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sop-pop': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.975)' },
          to: { opacity: '1', transform: 'none' },
        },
        'sop-slide': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: { blink: 'blink 0.8s ease-in-out infinite' },
    },
  },
  plugins: [],
}
