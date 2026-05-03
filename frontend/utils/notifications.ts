export async function requestNotificationPermission(): Promise<boolean> {
  try {
    // expo-notifications must be installed: npx expo install expo-notifications
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getPermissionsAsync, requestPermissionsAsync } = require('expo-notifications');
    const { status: existing } = await getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}
