import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', ...fontFamily.sans],
        mono: ['"JetBrains Mono"', ...fontFamily.mono],
      },
      colors: {
        surface: {
          DEFAULT: '#0f111a',
          soft: '#1b1f2b',
          glass: 'rgba(28, 32, 44, 0.75)',
        },
        accent: {
          blue: '#74c0ff',
          teal: '#2fdabd',
          amber: '#fcbf49',
          magenta: '#c77dff',
        },
      },
      boxShadow: {
        glass: '0 20px 60px rgba(0,0,0,0.45)',
      },
      backdropBlur: {
        xs: '6px',
      },
      animation: {
        pulseSlow: 'pulse 4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
