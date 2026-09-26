/**
 * Design tokens — editorial field-notebook system.
 *
 * The palette is warm paper rather than cold slate: a bone canvas, near-black
 * ink, and a single restrained ink-blue for actions. Colour is reserved for
 * genuine state (compliant / at risk / critical) so it always carries meaning
 * instead of decorating.
 *
 * Every family is declared as a full 50-950 ramp. A shade that is not declared
 * is silently dropped by Tailwind, which is how text ends up unstyled.
 *
 * @type {import('tailwindcss').Config}
 */

// Warm neutrals: the paper stack.
const paper = {
  50: '#fdfcfa', 100: '#faf8f4', 200: '#f4f1ea', 300: '#e8e3d8',
  400: '#d6cfc0', 500: '#b3a894', 600: '#8a7f6b', 700: '#655c4c',
  800: '#3f382e', 900: '#26221c', 950: '#15120f',
};

// Ink neutrals: text and hairlines, very slightly cool against the paper.
const ink = {
  50: '#f7f7f8', 100: '#ececed', 200: '#d7d7db', 300: '#b4b4bd',
  400: '#8a8a96', 500: '#6b6b78', 600: '#52525e', 700: '#3d3d47',
  800: '#2a2a32', 900: '#191920', 950: '#0e0e13',
};

// Ink blue: the single accent. Actions, focus, selection.
const indigo = {
  50: '#eef1fb', 100: '#dfe4f7', 200: '#c3ccef', 300: '#9daae2',
  400: '#7385d2', 500: '#5465c0', 600: '#414fa3', 700: '#364184',
  800: '#2f386c', 900: '#2b3259', 950: '#1a1d38',
};

const green = {
  50: '#eef8f1', 100: '#d6efe0', 200: '#b0dfc5', 300: '#7fc7a3',
  400: '#4ca97e', 500: '#2f8c62', 600: '#25714f', 700: '#1f5a40',
  800: '#1c4834', 900: '#183c2c', 950: '#0c2018',
};

const amber = {
  50: '#fdf6e9', 100: '#f9e9c8', 200: '#f3d494', 300: '#eaba5c',
  400: '#dd9c2c', 500: '#c17f16', 600: '#9c6512', 700: '#7d4f14',
  800: '#664016', 900: '#553618', 950: '#2e1d09',
};

const red = {
  50: '#fdf1f0', 100: '#fadedb', 200: '#f5c0bc', 300: '#ec9a94',
  400: '#de6d65', 500: '#c9483f', 600: '#a8352d', 700: '#882b25',
  800: '#6e2823', 900: '#5b2723', 950: '#311110',
};

const violet = {
  50: '#f5f2fb', 100: '#ebe5f8', 200: '#d9cef3', 300: '#beaee9',
  400: '#9d86dc', 500: '#8163cb', 600: '#6b4fb5', 700: '#5a4293',
  800: '#4b3976', 900: '#40335f', 950: '#241a3a',
};

const cyan = {
  50: '#edf7f8', 100: '#d5edef', 200: '#aedde1', 300: '#7cc5cd',
  400: '#49a5b0', 500: '#338791', 600: '#2b6c74', 700: '#26575e',
  800: '#234a50', 900: '#213f44', 950: '#0f2427',
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
        paper: ramp(paper),
        stone: ramp(paper),
        neutral: ramp(paper),
        zinc: ramp(paper),
        slate: ramp(ink),
        gray: ramp(ink),
        indigo: ramp(indigo),
        blue: ramp(indigo),
        violet: ramp(violet),
        purple: ramp(violet),
        green: ramp(green),
        emerald: ramp(green),
        amber: ramp(amber),
        yellow: ramp(amber),
        orange: ramp(amber),
        red: ramp(red),
        rose: ramp(red),
        cyan: ramp(cyan),
        teal: ramp(cyan),
        sky: ramp(cyan),
      },
      fontFamily: {
        // A serif display over a humanist sans reads editorial, not templated.
        display: ['"Newsreader"', 'Cairo', 'Georgia', 'serif'],
        sans: ['"Newsreader"', 'Cairo', 'Georgia', 'serif'],
        body: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
        arabic: ['Cairo', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      borderRadius: { xs: '0.25rem', sm: '0.375rem', DEFAULT: '0.5rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', '2xl': '1.25rem' },
      boxShadow: {
        // Paper does not float; it rests. Shadows stay almost imperceptible.
        xs: '0 1px 1px 0 rgb(38 34 28 / 0.04)',
        sm: '0 1px 2px 0 rgb(38 34 28 / 0.05), 0 1px 4px -1px rgb(38 34 28 / 0.04)',
        md: '0 2px 6px -1px rgb(38 34 28 / 0.07), 0 1px 3px -1px rgb(38 34 28 / 0.05)',
        lg: '0 8px 24px -6px rgb(38 34 28 / 0.12), 0 2px 6px -2px rgb(38 34 28 / 0.06)',
        // Used only for overlays that must sit above the page.
        overlay: '0 20px 50px -12px rgb(38 34 28 / 0.24)',
      },
      spacing: { '4.5': '1.125rem', '13': '3.25rem', '15': '3.75rem', '18': '4.5rem', '22': '5.5rem' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out both',
        'rise-in': 'rise-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-in': 'sheet-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        blink: 'blink 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
