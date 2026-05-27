import { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Colors, BorderRadius, SpringConfig } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { useGameStore } from "@/store/gameStore";
import { analytics } from "@/utils/analytics";
import { mapAnyPlayer } from "@/utils/mapPlayer";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.classchaos.app";
const DURATIONS = [15, 30, 45, 60];
const MIN_DURATION = 5;
const MAX_DURATION = 120;

export default function CreateGameScreen() {
  const [duration, setDuration] = useState(30);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [loading, setLoading] = useState(false);
  const customRef = useRef<TextInput>(null);
  const { token } = useAuthStore();
  const { setRoom, setMyPlayer, setPlayers } = useGameStore();
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleCustomConfirm = () => {
    const val = parseInt(customInput, 10);
    if (isNaN(val) || val < MIN_DURATION || val > MAX_DURATION) {
      Alert.alert(
        "Invalid Duration",
        `Please enter a duration between ${MIN_DURATION} and ${MAX_DURATION} minutes.`,
      );
      return;
    }
    setDuration(val);
    setCustomMode(false);
  };

  const effectiveDuration = customMode
    ? parseInt(customInput, 10) || duration
    : duration;

  const handleCreate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/game/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ duration_minutes: duration }), // always uses committed `duration` state
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert("Error", data.detail ?? "Failed to create room");
        return;
      }
      setRoom(data.room);
      setMyPlayer(mapAnyPlayer(data.player));
      setPlayers((data.players as Record<string, unknown>[]).map(mapAnyPlayer));
      analytics.track('game_created', { code: data.room.code });
      router.push(`/game/${data.room.code}`);
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 38, gap: 28 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)/home")
            }
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={Colors.text.secondary}
            />
          </Pressable>
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 24,
              fontFamily: "Poppins_700Bold",
            }}
          >
            Create Room
          </Text>
        </View>

        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            padding: 20,
            gap: 16,
          }}
        >
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 16,
              fontFamily: "Poppins_700Bold",
            }}
          >
            Game Duration
          </Text>
          {/* Preset chips */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                style={{ flex: 1 }}
                onPress={() => {
                  setDuration(d);
                  setCustomMode(false);
                  setCustomInput("");
                }}
              >
                <View
                  style={{
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor:
                      !customMode && duration === d
                        ? Colors.blue
                        : Colors.bg.secondary,
                    borderWidth: 1,
                    borderColor:
                      !customMode && duration === d
                        ? Colors.blue
                        : "rgba(255,255,255,0.07)",
                  }}
                >
                  <Text
                    style={{
                      color:
                        !customMode && duration === d
                          ? "#fff"
                          : Colors.text.secondary,
                      fontSize: 14,
                      fontFamily: "Poppins_700Bold",
                    }}
                  >
                    {d}m
                  </Text>
                </View>
              </Pressable>
            ))}
            {/* Custom chip */}
            <Pressable
              style={{ flex: 1 }}
              onPress={() => {
                setCustomMode(true);
                setCustomInput(String(duration));
                setTimeout(() => customRef.current?.focus(), 100);
              }}
            >
              <View
                style={{
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: customMode
                    ? Colors.blue
                    : Colors.bg.secondary,
                  borderWidth: 1,
                  borderColor: customMode
                    ? Colors.blue
                    : "rgba(255,255,255,0.07)",
                }}
              >
                <Ionicons
                  name="pencil"
                  size={14}
                  color={customMode ? "#fff" : Colors.text.secondary}
                />
              </View>
            </Pressable>
          </View>

          {/* Custom input row */}
          {customMode && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginTop: 4,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: Colors.bg.secondary,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.blue,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  gap: 8,
                }}
              >
                <TextInput
                  ref={customRef}
                  value={customInput}
                  onChangeText={(t) => setCustomInput(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                  placeholder={`${MIN_DURATION}–${MAX_DURATION}`}
                  placeholderTextColor={Colors.text.muted}
                  style={{
                    flex: 1,
                    color: Colors.text.primary,
                    fontSize: 15,
                    fontFamily: "Poppins_700Bold",
                  }}
                />
                <Text
                  style={{
                    color: Colors.text.muted,
                    fontSize: 13,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  min
                </Text>
              </View>
              <Pressable onPress={handleCustomConfirm}>
                <View
                  style={{
                    backgroundColor: Colors.blue,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 13,
                      fontFamily: "Poppins_700Bold",
                    }}
                  >
                    Set
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* Current selection label */}
          <Text
            style={{
              color: Colors.text.muted,
              fontSize: 12,
              fontFamily: "Poppins_400Regular",
              textAlign: "center",
            }}
          >
            {customMode
              ? `Custom: ${parseInt(customInput, 10) >= MIN_DURATION && parseInt(customInput, 10) <= MAX_DURATION ? customInput + " minutes" : "enter " + MIN_DURATION + "–" + MAX_DURATION}`
              : `Selected: ${duration} minutes`}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            padding: 20,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 16,
              fontFamily: "Poppins_700Bold",
            }}
          >
            How it works
          </Text>
          {[
            ["🍾", "Spin selects a random player"],
            ["🎯", "Truth (+10pts) or Dare (+20pts)"],
            ["😂", "1 min reaction time for everyone"],
            ["🏆", "Last place gets revealed!"],
          ].map(([emoji, text]) => (
            <View
              key={text}
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
              <Text
                style={{
                  color: Colors.text.secondary,
                  fontSize: 13,
                  fontFamily: "Poppins_400Regular",
                  flex: 1,
                }}
              >
                {text}
              </Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => {
            if (customMode) {
              // If they haven't tapped Set yet, auto-confirm custom value
              const val = parseInt(customInput, 10);
              if (!isNaN(val) && val >= MIN_DURATION && val <= MAX_DURATION) {
                setDuration(val);
                setCustomMode(false);
              } else if (customMode) {
                handleCustomConfirm();
                return;
              }
            }
            handleCreate();
          }}
          onPressIn={() => {
            scale.value = withSpring(0.95, SpringConfig.snappy);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, SpringConfig.default);
          }}
          disabled={loading}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={["#3b82f6", "#06b6d4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 16,
                borderRadius: BorderRadius.btn,
                alignItems: "center",
                shadowColor: "#3b82f6",
                shadowOpacity: 0.4,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontFamily: "Poppins_700Bold",
                }}
              >
                {loading
                  ? "Creating..."
                  : `Create ${customMode ? parseInt(customInput, 10) || duration : duration}min Room 🎲`}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
