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
        syne: ['Syne_800ExtraBold', 'Syne_900Black'],
        'syne-black': ['Syne_900Black'],
        inter: ['Inter_400Regular'],
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
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
