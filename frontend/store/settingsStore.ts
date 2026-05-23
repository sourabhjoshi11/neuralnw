import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeName } from '@/constants/theme';

type SettingsState = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  theme: ThemeName;
  notificationsEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      vibrationEnabled: true,
      theme: 'dark',
      notificationsEnabled: false,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setVibrationEnabled: (vibrationEnabled) => set({ vibrationEnabled }),
      setTheme: (theme) => set({ theme }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    {
      name: 'classchaos-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
