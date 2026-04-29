import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

/**
 * Validates the persisted token against /auth/me on every app start.
 * Clears the session if the token is expired, revoked, or the user is banned.
 */
export function useSession() {
  const { token, isAuthenticated, setLoading, clearUser } = useAuthStore();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          clearUser();
        }
        // 200 → token still valid, keep session as-is
      })
      .catch(() => {
        // Network error on startup — keep cached session, user sees last state
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { isAuthenticated };
}
