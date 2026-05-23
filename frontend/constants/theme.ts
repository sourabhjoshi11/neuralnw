export type ThemeName = 'dark' | 'light';

const darkColors = {
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
};

const lightColors: typeof darkColors = {
  bg: {
    primary: '#f8fafc',
    secondary: '#e2e8f0',
    card: '#ffffff',
  },
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#64748b',
  },
  border: 'rgba(15,23,42,0.1)',
  blue: '#2563eb',
  cyan: '#0891b2',
  purple: '#7c3aed',
  pink: '#db2777',
  green: '#059669',
  yellow: '#d97706',
  red: '#dc2626',
};

export const Colors = {
  bg: { ...darkColors.bg },
  text: { ...darkColors.text },
  border: darkColors.border,
  blue: darkColors.blue,
  cyan: darkColors.cyan,
  purple: darkColors.purple,
  pink: darkColors.pink,
  green: darkColors.green,
  yellow: darkColors.yellow,
  red: darkColors.red,
};

export function applyTheme(theme: ThemeName) {
  const next = theme === 'light' ? lightColors : darkColors;
  Object.assign(Colors.bg, next.bg);
  Object.assign(Colors.text, next.text);
  Colors.border = next.border;
  Colors.blue = next.blue;
  Colors.cyan = next.cyan;
  Colors.purple = next.purple;
  Colors.pink = next.pink;
  Colors.green = next.green;
  Colors.yellow = next.yellow;
  Colors.red = next.red;
}

export const WheelColors = [
  '#3b82f6',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
  '#f59e0b',
] as const;

export const Gradients = {
  primary: ['#3b82f6', '#06b6d4'] as [string, string],
  overlay: ['transparent', '#0a0e1a'] as [string, string],
  cardAccent: ['#3b82f6', '#06b6d4'] as [string, string],
} as const;

export const SpringConfig = {
  default: { damping: 10, stiffness: 100 },
  snappy: { damping: 12, stiffness: 150 },
  gentle: { damping: 15, stiffness: 80 },
} as const;

export const BorderRadius = {
  btn: 18,
  card: 20,
  pill: 24,
  input: 16,
  sheet: 24,
} as const;

export const Typography = {
  display: { fontFamily: 'Poppins_700Bold' },
  heading: { fontFamily: 'Poppins_700Bold' },
  body: { fontFamily: 'Poppins_400Regular' },
  bodyMedium: { fontFamily: 'Poppins_500Medium' },
  bodySemiBold: { fontFamily: 'Poppins_600SemiBold' },
  bodyBold: { fontFamily: 'Poppins_700Bold' },
} as const;
