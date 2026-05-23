import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export async function hasNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  return existing.granted || existing.status === Notifications.PermissionStatus.GRANTED;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || existing.status === Notifications.PermissionStatus.GRANTED) {
    return true;
  }

  if (existing.canAskAgain === false) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === Notifications.PermissionStatus.GRANTED;
}
