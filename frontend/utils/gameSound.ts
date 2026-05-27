import { Platform } from 'react-native';
import { useSettingsStore } from '@/store/settingsStore';
import { Audio, Sound } from '@/utils/audioCompat';

let audioPlayers: Record<string, Sound> = {};

async function initAudio() {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  } catch {
    // Audio not available
  }
}

async function loadSound(key: string, source: any) {
  if (Platform.OS === 'web') return;
  try {
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false, volume: 0.7 });
    audioPlayers[key] = sound;
  } catch {
    // Failed to load
  }
}

export async function initGameSounds() {
  await initAudio();
  // Use existing tick sound for timer
  await loadSound('tick', require('../assets/sounds/tick.wav'));
  await loadSound('reveal', require('../assets/sounds/spin_end.wav'));
  await loadSound('correct', require('../assets/sounds/spin_end.wav'));
  await loadSound('wrong', require('../assets/sounds/tick.wav'));
}

export function playSound(key: string) {
  if (!useSettingsStore.getState().soundEnabled) return;
  const player = audioPlayers[key];
  if (!player) return;
  try {
    player.setPositionAsync(0).then(() => player.playAsync()).catch(() => {});
  } catch {
    // Ignore
  }
}
