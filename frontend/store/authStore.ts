import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types';

type AuthState = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User, token: string) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
  updatePremium: (isPremium: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      setUser: (user, token) =>
        set({ user, token, isAuthenticated: true, isLoading: false }),

      clearUser: () =>
        set({ user: null, token: null, isAuthenticated: false }),

      setLoading: (isLoading) => set({ isLoading }),

      updatePremium: (isPremium) =>
        set((state) =>
          state.user ? { user: { ...state.user, isPremium } } : {}
        ),
    }),
    {
      name: 'classchaos-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);
