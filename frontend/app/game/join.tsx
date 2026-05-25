import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
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
import { mapAnyPlayer } from "@/utils/mapPlayer";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.classchaos.app";

export default function JoinGameScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const { token } = useAuthStore();
  const { setRoom, setMyPlayer, setPlayers } = useGameStore();

  const scale = useSharedValue(1);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isValid = /^\d{6}$/.test(code);

  const handleJoin = useCallback(async () => {
    if (!token) {
      Alert.alert("Login required", "Please login first");
      return;
    }

    if (!isValid || loading) return;

    setLoading(true);

    try {
      const resp = await fetch(`${API_URL}/game/rooms/${code}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await resp.json();

      if (!resp.ok) {
        Alert.alert("Error", data.detail ?? "Room not found");
        return;
      }

      setRoom(data.room);

      setMyPlayer(mapAnyPlayer(data.player));

      setPlayers(data.players.map(mapAnyPlayer));

      router.replace(`/game/${data.room.code}`);
    } catch (error) {
      console.log(error);

      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, code, loading, isValid, setRoom, setMyPlayer, setPlayers]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.topSection}>
          <View style={styles.header}>
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

            <Text style={styles.title}>Join Room</Text>
          </View>

          {/* Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.subtitle}>Enter the 6-digit room code</Text>

            <TextInput
              style={[styles.input, code && styles.inputActive]}
              placeholder="123456"
              placeholderTextColor={Colors.text.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              autoFocus
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ""))}
            />
          </View>
        </View>

        {/* Bottom Button */}
        <View style={styles.buttonContainer}>
          <Pressable
            disabled={!isValid || loading}
            onPress={handleJoin}
            onPressIn={() => {
              scale.value = withSpring(0.95, SpringConfig.snappy);
            }}
            onPressOut={() => {
              scale.value = withSpring(1, SpringConfig.default);
            }}
          >
            <Animated.View style={btnStyle}>
              <LinearGradient
                colors={
                  isValid ? ["#3b82f6", "#06b6d4"] : ["#1a2235", "#1a2235"]
                }
                start={{
                  x: 0,
                  y: 0,
                }}
                end={{
                  x: 1,
                  y: 1,
                }}
                style={styles.button}
              >
                <Text
                  style={[styles.buttonText, !isValid && styles.disabledText]}
                >
                  {loading ? "Joining..." : "Join Room →"}
                </Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },

  container: {
    flex: 1,
    padding: 20,
    paddingTop: 50,
  },

  topSection: {
    gap: 28,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  title: {
    color: Colors.text.primary,
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
  },

  subtitle: {
    color: Colors.text.secondary,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },

  inputContainer: {
    gap: 16,
  },

  input: {
    backgroundColor: Colors.bg.card,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    color: Colors.text.primary,
    fontSize: 32,
    fontFamily: "Poppins_700Bold",
    paddingHorizontal: 20,
    paddingVertical: 16,
    textAlign: "center",
    letterSpacing: 8,
  },

  inputActive: {
    borderColor: "rgba(59,130,246,0.4)",
  },

  buttonContainer: {
    marginTop: "auto",
    paddingBottom: 30,
  },

  button: {
    paddingVertical: 16,
    borderRadius: BorderRadius.btn,
    alignItems: "center",
    shadowColor: "#3b82f6",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 8,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },

  disabledText: {
    color: Colors.text.muted,
  },
});
