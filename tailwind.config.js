/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: '#0F2042',
          deep: '#081a3c',
        },
        civic: {
          DEFAULT: '#1E40AF',
          hover: '#1E3A8A',
          ring: '#2563EB',
          wash: '#EFF6FF',
        },
        amber: {
          academic: '#D97706',
          seal: '#92400E',
          bg: '#FFFBEB',
          border: '#FDE68A',
        },
        emerald: {
          vote: '#10B981',
          deep: '#065F46',
          bg: '#ECFDF5',
          border: '#A7F3D0',
        },
        slate: {
          canvas: '#F8FAFC',
          border: '#E2E8F0',
          frame: '#CBD5E1',
          muted: '#94A3B8',
          text: '#475569',
          wash: '#F1F5F9',
        },
        error: {
          DEFAULT: '#BA1A1A',
          bg: '#FEE2E2',
          deep: '#991B1B',
        },
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      boxShadow: {
        tier1: '0 1px 3px 0 rgba(15, 32, 66, 0.04), 0 1px 2px -1px rgba(15, 32, 66, 0.04)',
        tier2: '0 10px 15px -3px rgba(15, 32, 66, 0.08), 0 4px 6px -4px rgba(15, 32, 66, 0.04)',
      },
      maxWidth: {
        ballot: '640px',
        page: '1280px',
      },
      letterSpacing: {
        headline: '-0.025em',
        headline2: '-0.02em',
        headline3: '-0.01em',
        label: '0.05em',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
        fadeIn: 'fadeIn 0.3s ease-out',
        scaleIn: 'scaleIn 0.2s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
