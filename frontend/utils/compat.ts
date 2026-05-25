/**
 * Cross-platform wrappers for native-only APIs.
 * Web fallbacks are silent no-ops or browser equivalents.
 */
import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';
import { useSettingsStore } from '@/store/settingsStore';

function hapticsEnabled() {
  return useSettingsStore.getState().vibrationEnabled;
}

// ─── Haptics ─────────────────────────────────────────────────────────────────

export const Haptics = {
  // Subtle tap for UI interactions (buttons, tabs)
  light: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  // Standard feedback for most actions
  medium: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  // Strong feedback for important actions
  heavy: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  // Subtle selection feedback (like WhatsApp message selection)
  selection: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.selectionAsync().catch(() => {});
  },
  // Success notification (message sent, action completed)
  success: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success).catch(() => {});
  },
  // Error notification
  error: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error).catch(() => {});
  },
  // Warning notification
  warning: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  // WhatsApp-style: very subtle tap for message reactions
  reaction: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  // WhatsApp-style: subtle feedback when long-pressing messages
  longPress: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  // WhatsApp-style: feedback when sending message
  messageSent: () => {
    if (Platform.OS === 'web') return;
    if (!hapticsEnabled()) return;
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light).catch(() => {});
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
