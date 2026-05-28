// Temporary compatibility wrapper for expo-av to expo-audio migration
// Gracefully handles missing audio modules

export const Audio = {
  Recording: {
    createAsync: async () => {
      try {
        // Audio recording disabled temporarily
        return { recording: null, status: {} };
      } catch (e) {
        console.warn('Audio recording error:', e);
        return { recording: null, status: {} };
      }
    },
  },
  Sound: {
    createAsync: async (source: any) => {
      try {
        // Audio playback disabled temporarily
        return { sound: null, status: {} };
      } catch (e) {
        console.warn('Audio playback error:', e);
        return { sound: null, status: {} };
      }
    },
  },
  setAudioModeAsync: async (mode: any) => {
    try {
      // Audio mode disabled temporarily
    } catch (e) {
      console.warn('Audio mode error:', e);
    }
  },
};

export type Recording = any;
export type Sound = any;
