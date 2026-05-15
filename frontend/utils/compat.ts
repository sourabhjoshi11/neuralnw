/**
 * Cross-platform wrappers for native-only APIs.
 * Web fallbacks are silent no-ops or browser equivalents.
 */
import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

// ─── Haptics ─────────────────────────────────────────────────────────────────

export const Haptics = {
  light: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  selection: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {});
  },
  error: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error).catch(() => {});
  },
  warning: () => {
    if (Platform.OS === 'web') return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};

// ─── Share / Clipboard ────────────────────────────────────────────────────────

export async function shareText(message: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(message);
      alert('Copied to clipboard!');
    } catch {
      alert(message);
    }
    return;
  }
  const { Share } = await import('react-native');
  Share.share({ message });
}

export async function copyToClipboard(text: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // silent fail
    }
    return;
  }
  const Clipboard = await import('expo-clipboard');
  Clipboard.setStringAsync(text).catch(() => {});
}

// ─── WebSocket URL helper ─────────────────────────────────────────────────────

export function wsUrl(base: string): string {
  if (Platform.OS === 'web') {
    // On web, use wss:// if the page is served over https
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return base.replace(/^ws:\/\//, 'wss://');
    }
  }
  return base;
}
