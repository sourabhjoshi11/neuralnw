import { View, Text, ScrollView } from "react-native";
import Animated, { FadeIn, SlideInRight } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import type { AnonPlayer } from "@/types";

type Props = {
  players: AnonPlayer[];
  myPlayerId?: string;
};

function RankBadge({ rank }: { rank: number }) {
  const colors = {
    1: ["#fbbf24", "#f59e0b"],
    2: ["#94a3b8", "#64748b"],
    3: ["#fb923c", "#f97316"],
  };
  const emoji = { 1: "👑", 2: "🥈", 3: "🥉" };

  return (
    <LinearGradient
      colors={colors[rank as keyof typeof colors] || ["#334155", "#1e293b"]}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: rank <= 3 ? 16 : 12, fontFamily: "Poppins_700Bold", color: "#fff" }}>
        {rank <= 3 ? emoji[rank as keyof typeof emoji] : `#${rank}`}
      </Text>
    </LinearGradient>
  );
}

function LivesIndicator({ skipsUsed }: { skipsUsed: number }) {
  const maxLives = 3;
  const livesLeft = maxLives - skipsUsed;

  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {Array.from({ length: maxLives }, (_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i < livesLeft ? "#22c55e" : "#ef4444",
            opacity: i < livesLeft ? 1 : 0.3,
          }}
        />
      ))}
    </View>
  );
}

export function EnhancedLeaderboard({ players, myPlayerId }: Props) {
  const sortedPlayers = [...players].sort((a, b) => b.points - a.points);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      showsVerticalScrollIndicator={false}
    >
      {sortedPlayers.map((player, index) => {
        const rank = index + 1;
        const isMe = player.id === myPlayerId;
        const isTop3 = rank <= 3;

        return (
          <Animated.View
            key={player.id}
            entering={FadeIn.delay(index * 50).springify()}
          >
            <LinearGradient
              colors={
                isMe
                  ? ["rgba(6,182,212,0.15)", "rgba(139,92,246,0.15)"]
                  : isTop3
                  ? ["rgba(59,130,246,0.08)", "rgba(6,182,212,0.08)"]
                  : ["rgba(255,255,255,0.03)", "rgba(255,255,255,0.03)"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 16,
                borderWidth: isMe ? 2 : 1,
                borderColor: isMe ? Colors.cyan : "rgba(255,255,255,0.06)",
              }}
            >
              {/* Rank Badge */}
              <RankBadge rank={rank} />

              {/* Player Avatar */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: player.color + "22",
                  borderWidth: 2,
                  borderColor: player.color,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: player.color,
                    fontSize: 18,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  {player.username[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>

              {/* Player Info */}
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text
                    style={{
                      color: isMe ? Colors.cyan : Colors.text.primary,
                      fontSize: 15,
                      fontFamily: "Poppins_600SemiBold",
                    }}
                    numberOfLines={1}
                  >
                    {player.username}
                  </Text>
                  {isMe && (
                    <View
                      style={{
                        backgroundColor: Colors.cyan + "33",
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: Colors.cyan,
                          fontSize: 9,
                          fontFamily: "Poppins_700Bold",
                        }}
                      >
                        YOU
                      </Text>
                    </View>
                  )}
                </View>

                {/* Lives */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <LivesIndicator skipsUsed={player.skipsUsed} />
                  <Text
                    style={{
                      color: Colors.text.muted,
                      fontSize: 10,
                      fontFamily: "Poppins_500Medium",
                    }}
                  >
                    {3 - player.skipsUsed} {3 - player.skipsUsed === 1 ? "life" : "lives"}
                  </Text>
                </View>
              </View>

              {/* Points */}
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text
                  style={{
                    color: isTop3 ? "#fbbf24" : Colors.text.primary,
                    fontSize: 20,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  {player.points}
                </Text>
                <Text
                  style={{
                    color: Colors.text.muted,
                    fontSize: 10,
                    fontFamily: "Poppins_500Medium",
                  }}
                >
                  points
                </Text>
              </View>

              {/* Blackout indicator */}
              {player.isBlackedOut && (
                <View
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    borderRadius: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ fontSize: 10 }}>💀</Text>
                </View>
              )}
            </LinearGradient>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}
