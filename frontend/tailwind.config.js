import colors from 'tailwindcss/colors';

// Per-property mappings preserve white text on solid buttons while adapting
// legacy light surfaces. Tailwind still generates all variants and /opacity.
const rgb = (hex) => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16)).join(' ');
const token = (name, fallback) => `rgb(var(--theme-${name}, ${rgb(fallback)}) / <alpha-value>)`;
const neutral = (property, shades) => Object.fromEntries(shades.map(shade => [
  shade, token(`${property}-${shade}`, colors.slate[shade]),
]));
const families = ['blue', 'sky', 'indigo', 'purple', 'emerald', 'teal', 'amber', 'rose', 'red', 'green', 'yellow', 'orange'];
const status = (property, shades) => Object.fromEntries(families.map(family => [family,
  Object.fromEntries(shades.map(shade => [shade, token(`${family}-${property}`, colors[family][shade])])),
]));
const borders = {
  slate: neutral('border', [50, 100, 200, 300, 400, 500, 800, 900]),
  ...status('border', [100, 200, 300]),
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundColor: {
        white: token('surface', '#ffffff'),
        slate: neutral('bg', [50, 100, 200, 300, 800, 900]),
        ...status('soft', [50, 100]),
      },
      textColor: {
        slate: neutral('text', [400, 500, 600, 700, 800, 900]),
        ...status('text', [500, 600, 700, 800, 900]),
      },
      borderColor: borders,
      divideColor: borders,
      ringColor: { slate: neutral('ring', [300, 500, 900]) },
      ringOffsetColor: { white: token('surface', '#ffffff') },
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
        }
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        blink: 'blink 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
