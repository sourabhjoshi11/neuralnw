import { View, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import type { AnonPlayer } from "@/types";

type Props = {
  history: string[]; // Player IDs
  players: AnonPlayer[];
};

export function SpinHistory({ history, players }: Props) {
  if (history.length === 0) return null;

  const recentHistory = history.slice(-5).reverse();

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <Text
        style={{
          color: Colors.text.muted,
          fontSize: 11,
          fontFamily: "Poppins_600SemiBold",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        Recent Spins
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {recentHistory.map((playerId, index) => {
          const player = players.find((p) => p.id === playerId);
          if (!player) return null;
          return (
            <Animated.View
              key={`${playerId}-${index}`}
              entering={FadeIn.delay(index * 50)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: Colors.bg.card,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: player.color + "33",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: player.color,
                }}
              />
              <Text
                style={{
                  color: Colors.text.secondary,
                  fontSize: 12,
                  fontFamily: "Poppins_500Medium",
                }}
              >
                {player.username}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
