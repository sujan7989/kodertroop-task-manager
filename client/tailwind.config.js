/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        accent: {
          purple: '#8b5cf6',
          cyan:   '#06b6d4',
          pink:   '#ec4899',
          amber:  '#f59e0b',
        },
        background: '#0a0f1e',
        surface: {
          DEFAULT: '#111827',
          secondary: '#1a2235',
          elevated: '#1f2d44',
        },
        border: {
          DEFAULT: '#1e2d45',
          light: '#263352',
          glow: 'rgba(99,102,241,0.4)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-sm':  '0 0 10px rgba(99,102,241,0.2)',
        'glow':     '0 0 25px rgba(99,102,241,0.25)',
        'glow-lg':  '0 0 50px rgba(99,102,241,0.3)',
        'card':     '0 4px 24px rgba(0,0,0,0.4)',
        'card-hover': '0 8px 40px rgba(99,102,241,0.2)',
        'modal':    '0 25px 80px rgba(0,0,0,0.8)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-hero': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
        'gradient-dark': 'linear-gradient(180deg, #111827 0%, #0a0f1e 100%)',
      },
      animation: {
        'fade-in-up':    'fadeInUp 0.5s ease forwards',
        'fade-in-scale': 'fadeInScale 0.3s ease forwards',
        'pulse-glow':    'pulse-glow 2s ease-in-out infinite',
        'float':         'float 3s ease-in-out infinite',
        'spin-slow':     'spin-slow 8s linear infinite',
        'shimmer':       'shimmer 2s infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
