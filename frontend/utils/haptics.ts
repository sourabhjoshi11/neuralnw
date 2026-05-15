import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/store/settingsStore';

function enabled() {
  return useSettingsStore.getState().vibrationEnabled;
}

export function impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) {
  if (!enabled()) return;
  Haptics.impactAsync(style);
}

export function notification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
) {
  if (!enabled()) return;
  Haptics.notificationAsync(type);
}

export function selection() {
  if (!enabled()) return;
  Haptics.selectionAsync();
}
