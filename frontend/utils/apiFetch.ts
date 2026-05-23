/**
 * Wrapper around fetch that:
 * - Auto-logs out on 401 (session expired)
 * - Can be extended for retry logic later
 */
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    const { isAuthenticated, clearUser } = useAuthStore.getState();
    if (isAuthenticated) {
      clearUser();
      Alert.alert('Session expired', 'Please log in again.');
    }
  }

  return res;
}
