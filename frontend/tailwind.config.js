/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0e1a',
          secondary: '#111827',
          card: '#1a2235',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#475569',
        },
        border: 'rgba(255,255,255,0.08)',
        blue: '#3b82f6',
        cyan: '#06b6d4',
        purple: '#8b5cf6',
        pink: '#ec4899',
        green: '#10b981',
        yellow: '#f59e0b',
        red: '#ef4444',
      },
      fontFamily: {
        sans: ['Poppins_400Regular'],
        poppins: ['Poppins_400Regular'],
        'poppins-medium': ['Poppins_500Medium'],
        'poppins-semibold': ['Poppins_600SemiBold'],
        'poppins-bold': ['Poppins_700Bold'],
        // Legacy aliases kept for backward compat — both map to Poppins now
        syne: ['Poppins_700Bold'],
        inter: ['Poppins_400Regular'],
        'inter-medium': ['Poppins_500Medium'],
        'inter-semibold': ['Poppins_600SemiBold'],
        'inter-bold': ['Poppins_700Bold'],
      },
      borderRadius: {
        btn: '18px',
        card: '20px',
        pill: '24px',
        input: '16px',
        sheet: '24px',
      },
    },
  },
  plugins: [],
};
