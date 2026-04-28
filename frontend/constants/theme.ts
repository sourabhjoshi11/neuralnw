export const Colors = {
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
} as const;

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
  display: { fontFamily: 'Syne_900Black' },
  heading: { fontFamily: 'Syne_800ExtraBold' },
  body: { fontFamily: 'Inter_400Regular' },
  bodyMedium: { fontFamily: 'Inter_500Medium' },
  bodySemiBold: { fontFamily: 'Inter_600SemiBold' },
  bodyBold: { fontFamily: 'Inter_700Bold' },
} as const;
