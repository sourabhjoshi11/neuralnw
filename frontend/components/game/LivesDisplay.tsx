import { View, Text } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

type Props = {
  skipsUsed: number;
  maxLives?: number;
  showLabel?: boolean;
};

export function LivesDisplay({ skipsUsed, maxLives = 3, showLabel = true }: Props) {
  const livesLeft = maxLives - skipsUsed;
  const isLow = livesLeft <= 1;
  const isDanger = livesLeft === 0;

  return (
    <Animated.View entering={FadeIn.springify()}>
      <LinearGradient
        colors={
          isDanger
            ? ["rgba(239,68,68,0.2)", "rgba(220,38,38,0.2)"]
            : isLow
            ? ["rgba(251,191,36,0.2)", "rgba(245,158,11,0.2)"]
            : ["rgba(34,197,94,0.2)", "rgba(22,163,74,0.2)"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: isDanger
            ? "rgba(239,68,68,0.4)"
            : isLow
            ? "rgba(251,191,36,0.4)"
            : "rgba(34,197,94,0.4)",
        }}
      >
        {/* Heart Icons */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {Array.from({ length: maxLives }, (_, i) => {
            const isFilled = i < livesLeft;
            return (
              <Animated.View
                key={i}
                entering={ZoomIn.delay(i * 100).springify()}
              >
                <Ionicons
                  name={isFilled ? "heart" : "heart-outline"}
                  size={16}
                  color={
                    isFilled
                      ? isDanger
                        ? "#ef4444"
                        : isLow
                        ? "#fbbf24"
                        : "#22c55e"
                      : "rgba(255,255,255,0.2)"
                  }
                />
              </Animated.View>
            );
          })}
        </View>

        {/* Label */}
        {showLabel && (
          <Text
            style={{
              color: isDanger
                ? "#ef4444"
                : isLow
                ? "#fbbf24"
                : "#22c55e",
              fontSize: 12,
              fontFamily: "Poppins_700Bold",
            }}
          >
            {livesLeft} {livesLeft === 1 ? "Life" : "Lives"}
          </Text>
        )}

        {/* Warning Icon */}
        {isLow && (
          <Animated.View entering={ZoomIn.springify()}>
            <Ionicons
              name="warning"
              size={14}
              color={isDanger ? "#ef4444" : "#fbbf24"}
            />
          </Animated.View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}
