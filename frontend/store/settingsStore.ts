import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SettingsState = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  theme: 'dark' | 'light';
  notificationsEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      vibrationEnabled: true,
      theme: 'dark',
      notificationsEnabled: true,
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
