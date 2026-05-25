import { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import type { Sound } from "expo-av/build/Audio";
import { Colors } from "@/constants/theme";

type Props = {
  url: string;
  color: string;
};

export function VoiceBubble({ url, color }: Props) {
  const [sound, setSound] = useState<Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let soundObject: Sound | null = null;
    (async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync({ uri: url });
        soundObject = s;
        setSound(s);
        const status = await s.getStatusAsync();
        if (status.isLoaded) setDuration(status.durationMillis ?? 0);
        s.setOnPlaybackStatusUpdate((st) => {
          if (st.isLoaded) {
            setPosition(st.positionMillis);
            if (st.didJustFinish) setIsPlaying(false);
          }
        });
      } catch {}
    })();
    return () => {
      soundObject?.unloadAsync();
    };
  }, [url]);

  const togglePlay = async () => {
    if (!sound) return;
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
      <Pressable onPress={togglePlay} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color + "33", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={16} color={color} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
          <View style={{ width: duration ? `${(position / duration) * 100}%` : "0%", height: "100%", backgroundColor: color, borderRadius: 2 }} />
        </View>
        <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: "Poppins_400Regular" }}>
          {formatTime(position)} / {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}
