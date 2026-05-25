import { Platform } from 'react-native';

let Notifications: any = null;

async function loadNotifications() {
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    return Notifications;
  } catch {
    return null;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const NotificationsModule = await loadNotifications();
  if (!NotificationsModule) return false;
  
  try {
    const existing = await NotificationsModule.getPermissionsAsync();
    return existing.granted || existing.status === NotificationsModule.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const NotificationsModule = await loadNotifications();
  if (!NotificationsModule) return false;

  try {
    if (Platform.OS === 'android') {
      await NotificationsModule.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: NotificationsModule.AndroidImportance.DEFAULT,
      });
    }

    const existing = await NotificationsModule.getPermissionsAsync();
    if (existing.granted || existing.status === NotificationsModule.PermissionStatus.GRANTED) {
      return true;
    }

    if (existing.canAskAgain === false) {
      return false;
    }

    const requested = await NotificationsModule.requestPermissionsAsync();
    return requested.granted || requested.status === NotificationsModule.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}
