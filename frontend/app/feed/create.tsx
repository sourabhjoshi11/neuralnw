import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  Alert,
} from "react-native";
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
import { useFeedStore } from "@/store/feedStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.classchaos.app";

export default function CreateFeedScreen() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { token } = useAuthStore();
  const { setFeed, setMyMemberId, addMyFeed } = useFeedStore();
  const scale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isValid = name.trim().length >= 3;

  const handleCreate = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/feed/feeds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        Alert.alert("Error", data.detail ?? "Failed to create feed");
        return;
      }
      setFeed(data.feed);
      setMyMemberId(data.member.id);
      addMyFeed(data.feed);
      router.push(`/feed/${data.feed.code}`);
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <View
        style={{
          flex: 1,
          padding: 20,
          paddingTop: 38,
          gap: 28,
          justifyContent: "flex-start",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)/feed")
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
            Create Class Feed
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          <Text
            style={{
              color: Colors.text.secondary,
              fontSize: 14,
              fontFamily: "Poppins_400Regular",
            }}
          >
            Give your feed a name (e.g. "CS-A Batch 2024")
          </Text>
          <TextInput
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.input,
              borderWidth: 1,
              borderColor: name
                ? "rgba(59,130,246,0.4)"
                : "rgba(255,255,255,0.07)",
              color: Colors.text.primary,
              fontSize: 16,
              fontFamily: "Poppins_500Medium",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
            placeholder="CS-A Batch 2024"
            placeholderTextColor={Colors.text.muted}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>

        <Pressable
          onPress={handleCreate}
          onPressIn={() => {
            scale.value = withSpring(0.95, SpringConfig.snappy);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, SpringConfig.default);
          }}
          disabled={!isValid || loading}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={isValid ? ["#06b6d4", "#8b5cf6"] : ["#1a2235", "#1a2235"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 16,
                borderRadius: BorderRadius.btn,
                alignItems: "center",
                shadowColor: "#06b6d4",
                shadowOpacity: isValid ? 0.4 : 0,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: isValid ? 8 : 0,
              }}
            >
              <Text
                style={{
                  color: isValid ? "#fff" : Colors.text.muted,
                  fontSize: 16,
                  fontFamily: "Poppins_700Bold",
                }}
              >
                {loading ? "Creating..." : "Create Feed 💬"}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
