import { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from "react-native-reanimated";
import { Colors } from "@/constants/theme";

function TypingDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-5, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.text.muted }, style]} />;
}

type Props = {
  users: { id: string; username: string }[];
};

export function TypingIndicator({ users }: Props) {
  const label = users.length === 1 ? `${users[0].username || "Someone"} is typing` : `${users.length} people are typing`;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(6,182,212,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(6,182,212,0.15)" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.cyan + "22", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.cyan + "33" }}>
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
      <Text style={{ color: Colors.cyan, fontSize: 13, fontFamily: "Poppins_500Medium" }}>{label}</Text>
    </Animated.View>
  );
}
