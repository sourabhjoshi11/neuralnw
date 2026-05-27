import { Audio, Sound } from "@/utils/audioCompat";
import { Platform } from "react-native";

class GameSoundManager {
  private sounds: Map<string, Sound> = new Map();
  private initialized = false;

  async init() {
    if (this.initialized || Platform.OS === "web") return;
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      
      // Load all sounds
      const soundFiles = {
        tick: require("../../assets/sounds/tick.wav"),
        spinEnd: require("../../assets/sounds/spin_end.wav"),
        fanfare: require("../../assets/sounds/spin_end.wav"), // Reuse for now, add custom later
      };

      for (const [key, file] of Object.entries(soundFiles)) {
        const { sound } = await Audio.Sound.createAsync(file, { shouldPlay: false });
        this.sounds.set(key, sound);
      }

      this.initialized = true;
    } catch {}
  }

  async play(soundName: string, volume = 1.0) {
    const sound = this.sounds.get(soundName);
    if (!sound) return;
    try {
      await sound.setPositionAsync(0);
      await sound.setVolumeAsync(volume);
      await sound.playAsync();
    } catch {}
  }

  async cleanup() {
    for (const sound of this.sounds.values()) {
      await sound.unloadAsync();
    }
    this.sounds.clear();
    this.initialized = false;
  }
}

export const gameSoundManager = new GameSoundManager();
