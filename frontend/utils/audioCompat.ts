// Temporary compatibility wrapper for expo-av to expo-audio migration
// TODO: Migrate to expo-audio properly

export const Audio = {
  Recording: {
    createAsync: async () => {
      console.warn('Audio recording not yet migrated to expo-audio');
      return { recording: null, status: {} };
    },
  },
  Sound: {
    createAsync: async (source: any) => {
      console.warn('Audio playback not yet migrated to expo-audio');
      return { sound: null, status: {} };
    },
  },
  setAudioModeAsync: async (mode: any) => {
    console.warn('Audio mode not yet migrated');
  },
};

export type Recording = any;
export type Sound = any;
