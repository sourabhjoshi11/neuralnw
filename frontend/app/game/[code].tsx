import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { Haptics, shareText, copyToClipboard } from '@/utils/compat';
import { useAuthStore } from '@/store/authStore';
import { useGameStore } from '@/store/gameStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useGameTimer } from '@/hooks/useGameTimer';
import { SpinWheel } from '@/components/ui/SpinWheel';
import {
  TruthQuestionView,
  TruthAnswerView,
  ReactionView,
  DareShowView,
  DareVoteView,
  PunishmentVoteView,
  IdentityRevealView,
  PunishmentBanner,
} from '@/components/game/GamePhases';
import { AdGate } from '@/components/game/AdGate';
import { mapAnyPlayer } from '@/utils/mapPlayer';
import type { AnonPlayer, WSMessage, GamePhase, Reaction } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

// ─── Wire-format mappers ──────────────────────────────────────────────────────
// Backend uses snake_case and compact keys (un, pts) in WS; camelCase in HTTP.
// Both formats accepted via ?? fallbacks.

function mapApiRoom(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    code: r.code as string,
    hostId: ((r.host_id ?? r.hostId) as string) ?? '',
    status: r.status as 'waiting' | 'active' | 'ended',
    durationMinutes: ((r.duration_minutes ?? r.durationMinutes) as number) ?? 30,
    startsAt: ((r.starts_at ?? r.startsAt) as string | null) ?? null,
    endsAt: ((r.ends_at ?? r.endsAt) as string | null) ?? null,
    playerCount: ((r.player_count ?? r.playerCount) as number) ?? 0,
    currentTurn: ((r.current_turn_player_id ?? r.currentTurn) as string | null) ?? null,
  };
}

// mapAnyPlayer is imported from @/utils/mapPlayer

// ─── ConnectionBanner ─────────────────────────────────────────────────────────

function ConnectionBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={{
        backgroundColor: 'rgba(245,158,11,0.12)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(245,158,11,0.25)',
        paddingVertical: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <ActivityIndicator size="small" color={Colors.yellow} />
      <Text style={{ color: Colors.yellow, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
        Reconnecting...
      </Text>
    </Animated.View>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  isHost,
  isMe,
  isCurrentTurn,
}: {
  player: AnonPlayer;
  isHost: boolean;
  isMe: boolean;
  isCurrentTurn: boolean;
}) {
  const prevLives = useRef(player.lives);
  const prevPoints = useRef(player.points);
  const heartShake = useSharedValue(0);
  const heartOpacity = useSharedValue(1);
  const [pointsDiff, setPointsDiff] = useState<number | null>(null);
  const floatY = useSharedValue(0);
  const floatOpacity = useSharedValue(0);

  useEffect(() => {
    if (player.lives < prevLives.current) {
      heartShake.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-5, { duration: 60 }),
        withTiming(5, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
      heartOpacity.value = withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0.3, { duration: 300 }),
        withTiming(1, { duration: 300 }),
      );
    }
    prevLives.current = player.lives;
  }, [player.lives]);

  useEffect(() => {
    const diff = player.points - prevPoints.current;
    if (diff !== 0) {
      setPointsDiff(diff);
      floatY.value = 0;
      floatOpacity.value = 1;
      floatY.value = withTiming(-28, { duration: 900, easing: Easing.out(Easing.quad) });
      floatOpacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withTiming(0, { duration: 500 }),
      );
      const t = setTimeout(() => setPointsDiff(null), 800);
      prevPoints.current = player.points;
      return () => clearTimeout(t);
    }
    prevPoints.current = player.points;
  }, [player.points]);

  const heartRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: heartShake.value }],
    opacity: heartOpacity.value,
  }));

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
    opacity: floatOpacity.value,
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        paddingHorizontal: 16,
        backgroundColor: isMe
          ? 'rgba(59,130,246,0.07)'
          : isCurrentTurn
          ? 'rgba(6,182,212,0.07)'
          : 'transparent',
        borderRadius: 12,
        opacity: player.isBlackedOut ? 0.45 : 1,
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: player.color + '22',
          borderWidth: 2,
          borderColor: isCurrentTurn ? player.color : player.color + '88',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: player.color, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
          {player.username[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {isHost && <Text style={{ fontSize: 11 }}>👑</Text>}
          <Text
            style={{
              color: isMe ? Colors.blue : Colors.text.primary,
              fontSize: 14,
              fontFamily: 'Poppins_700Bold',
            }}
            numberOfLines={1}
          >
            {player.username}
            {isMe ? ' (you)' : ''}
          </Text>
          {player.isBlackedOut && (
            <View
              style={{
                backgroundColor: 'rgba(239,68,68,0.12)',
                borderRadius: 5,
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <Text style={{ color: Colors.red, fontSize: 9, fontFamily: 'Poppins_700Bold' }}>
                BLACKED OUT
              </Text>
            </View>
          )}
        </View>
        <Animated.View style={[{ flexDirection: 'row', gap: 2 }, heartRowStyle]}>
          {Array.from({ length: Math.max(0, player.lives) }).map((_, i) => (
            <Text key={i} style={{ fontSize: 9 }}>
              ❤️
            </Text>
          ))}
          {player.lives === 0 && (
            <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_400Regular' }}>
              no lives
            </Text>
          )}
        </Animated.View>
      </View>

      {/* Points + floating diff */}
      <View style={{ alignItems: 'center', gap: 2 }}>
        {pointsDiff !== null && (
          <Animated.Text
            style={[
              {
                fontSize: 12,
                fontFamily: 'Poppins_700Bold',
                color: pointsDiff > 0 ? Colors.green : Colors.red,
                position: 'absolute',
                top: -6,
              },
              floatStyle,
            ]}
          >
            {pointsDiff > 0 ? `+${pointsDiff}` : `${pointsDiff}`}
          </Animated.Text>
        )}
        {player.points > 0 && (
          <View
            style={{
              backgroundColor: 'rgba(59,130,246,0.1)',
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: Colors.blue, fontSize: 12, fontFamily: 'Poppins_700Bold' }}>
              {player.points}pt
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── LobbyView ────────────────────────────────────────────────────────────────

function LobbyView({
  room,
  players,
  myPlayer,
  isHost,
  isConnected,
  isReconnecting,
  onStart,
  starting,
}: {
  room: ReturnType<typeof mapApiRoom>;
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  isHost: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  const canStart = players.length >= 2;
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const sorted = [...players].sort((a, b) => a.joinOrder - b.joinOrder);

  const handleCopy = async () => {
    await copyToClipboard(room.code);
    Haptics.success();
  };

  return (
    <View style={{ flex: 1 }}>
      <ConnectionBanner visible={isReconnecting} />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Code Card */}
        <LinearGradient
          colors={['rgba(59,130,246,0.14)', 'rgba(6,182,212,0.07)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(59,130,246,0.22)',
            padding: 24,
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Text
            style={{
              color: Colors.text.muted,
              fontSize: 11,
              fontFamily: 'Poppins_600SemiBold',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Room Code
          </Text>
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 48,
              fontFamily: 'Poppins_700Bold',
              letterSpacing: 10,
            }}
          >
            {room.code}
          </Text>
          <Pressable
            onPress={handleCopy}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(6,182,212,0.12)',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: 'rgba(6,182,212,0.2)',
            }}
          >
            <Ionicons name="copy-outline" size={13} color={Colors.cyan} />
            <Text style={{ color: Colors.cyan, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
              Copy Code
            </Text>
          </Pressable>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
            Share with your classmates to join
          </Text>
        </LinearGradient>

        {/* Players Section */}
        <View style={{ gap: 12 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold' }}
            >
              Players
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: isConnected ? Colors.green : Colors.yellow,
                }}
              />
              <Text
                style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}
              >
                {players.length}/20
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.card,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >
            {sorted.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={Colors.text.muted} />
              </View>
            ) : (
              sorted.map((player, idx) => (
                <View key={player.id}>
                  <PlayerRow
                    player={player}
                    isHost={idx === 0}
                    isMe={player.id === myPlayer?.id}
                    isCurrentTurn={false}
                  />
                  {idx < sorted.length - 1 && (
                    <View
                      style={{
                        height: 1,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        marginHorizontal: 16,
                      }}
                    />
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        {/* Rules Card */}
        <View
          style={{
            backgroundColor: 'rgba(139,92,246,0.06)',
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(139,92,246,0.14)',
            padding: 16,
            gap: 10,
          }}
        >
          <Text
            style={{ color: Colors.purple, fontSize: 13, fontFamily: 'Poppins_700Bold' }}
          >
            ⚡ Quick Rules
          </Text>
          {[
            `${room.durationMinutes}-min game · bottle picks randomly`,
            'Truth: answer honestly → +10pts',
            'Dare: class votes if you did it → +20pts',
            '3 skips with no lives = punishment vote',
            "Last place's identity gets revealed 💀",
          ].map((rule) => (
            <View key={rule} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Text style={{ color: Colors.purple, fontSize: 11, marginTop: 2 }}>•</Text>
              <Text
                style={{
                  color: Colors.text.secondary,
                  fontSize: 12,
                  fontFamily: 'Poppins_400Regular',
                  flex: 1,
                }}
              >
                {rule}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 20,
          paddingBottom: 34,
          backgroundColor: Colors.bg.primary,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {isHost ? (
          <Pressable
            onPress={onStart}
            onPressIn={() => {
              btnScale.value = withSpring(0.96, SpringConfig.snappy);
            }}
            onPressOut={() => {
              btnScale.value = withSpring(1, SpringConfig.default);
            }}
            disabled={!canStart || starting}
          >
            <Animated.View style={btnStyle}>
              <LinearGradient
                colors={canStart ? ['#3b82f6', '#06b6d4'] : ['#1a2235', '#1a2235']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingVertical: 16,
                  borderRadius: BorderRadius.btn,
                  alignItems: 'center',
                  shadowColor: '#3b82f6',
                  shadowOpacity: canStart ? 0.4 : 0,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: canStart ? 8 : 0,
                }}
              >
                <Text
                  style={{
                    color: canStart ? '#fff' : Colors.text.muted,
                    fontSize: 16,
                    fontFamily: 'Poppins_700Bold',
                  }}
                >
                  {starting ? 'Starting...' : canStart ? '🍾 Start Game' : 'Need ≥ 2 players'}
                </Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        ) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={Colors.blue} />
            <Text
              style={{
                color: Colors.text.secondary,
                fontSize: 14,
                fontFamily: 'Poppins_400Regular',
              }}
            >
              Waiting for the host to start...
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── PlayerStrip ──────────────────────────────────────────────────────────────

function PlayerStrip({
  players,
  currentTurnPlayerId,
}: {
  players: AnonPlayer[];
  currentTurnPlayerId: string | null;
}) {
  // Sort by points descending — leader always leftmost
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const RANK_COLORS = [Colors.yellow, '#94a3b8', '#cd7c2f']; // gold, silver, bronze

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 10,
        paddingHorizontal: 16,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {sorted.map((p, idx) => {
          const isLeader = idx === 0 && p.points > 0;
          const isTurn = p.id === currentTurnPlayerId;
          const rankColor = idx < 3 && p.points > 0 ? RANK_COLORS[idx] : null;

          return (
            <View key={p.id} style={{ alignItems: 'center', gap: 3 }}>
              {/* Rank badge */}
              <View style={{ height: 14, justifyContent: 'center' }}>
                {rankColor ? (
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_700Bold', color: rankColor }}>
                    {idx === 0 ? '👑' : `#${idx + 1}`}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 10, fontFamily: 'Poppins_400Regular', color: Colors.text.muted }}>
                    #{idx + 1}
                  </Text>
                )}
              </View>

              {/* Avatar */}
              <View style={{ position: 'relative' }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: p.color + '22',
                    borderWidth: isTurn ? 2.5 : isLeader ? 2 : 1.5,
                    borderColor: isTurn ? p.color : isLeader ? Colors.yellow : p.color + '55',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: p.isBlackedOut ? 0.3 : 1,
                  }}
                >
                  <Text style={{ color: p.color, fontSize: 13, fontFamily: 'Poppins_700Bold' }}>
                    {p.isBlackedOut ? '💀' : p.username[0]?.toUpperCase()}
                  </Text>
                </View>

                {/* Current turn pulse ring */}
                {isTurn && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -3, left: -3, right: -3, bottom: -3,
                      borderRadius: 22,
                      borderWidth: 1.5,
                      borderColor: p.color + '55',
                    }}
                  />
                )}

                {/* Skip warning badge */}
                {p.skipsUsed >= 1 && (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -4,
                      backgroundColor: p.skipsUsed >= 3 ? Colors.red : Colors.yellow,
                      borderRadius: 6,
                      paddingHorizontal: 3,
                      paddingVertical: 1,
                      minWidth: 14,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 8, fontFamily: 'Poppins_700Bold', color: '#000' }}>
                      ⚡{p.skipsUsed}
                    </Text>
                  </View>
                )}
              </View>

              {/* Points */}
              <Text
                style={{
                  color: isLeader ? Colors.yellow : isTurn ? p.color : Colors.text.muted,
                  fontSize: 10,
                  fontFamily: 'Poppins_700Bold',
                }}
              >
                {p.points}pt
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── LiveScoreboard ──────────────────────────────────────────────────────────

function ScoreBar({
  player,
  rank,
  maxPoints,
  isMe,
  isTurn,
}: {
  player: AnonPlayer;
  rank: number;
  maxPoints: number;
  isMe: boolean;
  isTurn: boolean;
}) {
  const prevPoints = useRef(player.points);
  const barWidth = useSharedValue(0);
  const rowScale = useSharedValue(1);

  // Animate bar width on mount and points change
  useEffect(() => {
    const pct = maxPoints > 0 ? player.points / maxPoints : 0;
    barWidth.value = withTiming(pct, { duration: 600, easing: Easing.out(Easing.quad) });
  }, [player.points, maxPoints]);

  // Pulse row when points increase
  useEffect(() => {
    if (player.points > prevPoints.current) {
      rowScale.value = withSequence(
        withTiming(1.03, { duration: 120 }),
        withSpring(1, { damping: 8, stiffness: 200 }),
      );
    }
    prevPoints.current = player.points;
  }, [player.points]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as unknown as number,
  }));
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: rowScale.value }],
  }));

  const RANK_ICON = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
  const rankIsEmoji = rank <= 3;

  return (
    <Animated.View style={[{ marginBottom: 6 }, rowStyle]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Rank */}
        <Text style={{
          width: 22,
          textAlign: 'center',
          fontSize: rankIsEmoji ? 13 : 11,
          fontFamily: 'Poppins_700Bold',
          color: rank === 1 ? Colors.yellow : Colors.text.muted,
        }}>
          {RANK_ICON}
        </Text>

        {/* Avatar dot */}
        <View style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: player.color + '25',
          borderWidth: isTurn ? 2 : 1,
          borderColor: isTurn ? player.color : player.color + '66',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 9, fontFamily: 'Poppins_700Bold', color: player.color }}>
            {player.isBlackedOut ? '💀' : player.username[0]?.toUpperCase()}
          </Text>
        </View>

        {/* Name */}
        <Text
          numberOfLines={1}
          style={{
            width: 68,
            fontSize: 12,
            fontFamily: isMe ? 'Poppins_700Bold' : 'Poppins_500Medium',
            color: isMe ? Colors.blue : isTurn ? player.color : Colors.text.secondary,
          }}
        >
          {player.username}{isMe ? ' ★' : ''}
        </Text>

        {/* Progress bar track */}
        <View style={{
          flex: 1,
          height: 6,
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <Animated.View style={[{
            height: 6,
            borderRadius: 3,
            backgroundColor: isTurn ? player.color : player.color + 'bb',
            minWidth: player.points > 0 ? 4 : 0,
          }, barStyle]} />
        </View>

        {/* Points */}
        <Text style={{
          width: 38,
          textAlign: 'right',
          fontSize: 12,
          fontFamily: 'Poppins_700Bold',
          color: rank === 1 && player.points > 0 ? Colors.yellow : Colors.text.secondary,
        }}>
          {player.points}pt
        </Text>

        {/* Lives */}
        <Text style={{
          width: 26,
          textAlign: 'right',
          fontSize: 11,
          color: player.lives === 0 ? Colors.red : Colors.text.muted,
        }}>
          {player.lives === 0 ? '💀' : `❤️×${player.lives}`}
        </Text>
      </View>
    </Animated.View>
  );
}

function LiveScoreboard({
  players,
  myPlayer,
  currentTurnPlayerId,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const maxPoints = sorted[0]?.points ?? 0;
  const COLLAPSED_COUNT = 3;
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);
  const hasMore = sorted.length > COLLAPSED_COUNT;

  return (
    <View style={{
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.06)',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      backgroundColor: Colors.bg.secondary,
    }}>
      {visible.map((p, idx) => (
        <ScoreBar
          key={p.id}
          player={p}
          rank={idx + 1}
          maxPoints={Math.max(maxPoints, 1)}
          isMe={p.id === myPlayer?.id}
          isTurn={p.id === currentTurnPlayerId}
        />
      ))}

      {hasMore && (
        <Pressable
          onPress={() => { setExpanded((e) => !e); Haptics.light(); }}
          style={{ alignItems: 'center', paddingTop: 2 }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_500Medium' }}>
            {expanded ? '▲ collapse' : `▾ show all ${sorted.length} players`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── GameTimerLabel ───────────────────────────────────────────────────────────

function GameTimerLabel({ endsAt }: { endsAt: string | null }) {
  const { secondsLeft, formatted } = useGameTimer(endsAt);
  const urgent = secondsLeft > 0 && secondsLeft <= 120; // red under 2 min
  return (
    <Text style={{
      color: urgent ? Colors.red : Colors.text.muted,
      fontSize: 11,
      fontFamily: urgent ? 'Poppins_700Bold' : 'Poppins_400Regular',
    }}>
      ⏱ {formatted} left
    </Text>
  );
}

// ─── SlotMachineView ─────────────────────────────────────────────────────────

const SLOT_ITEM_H = 72;
const SLOT_VISIBLE = 3;

function SlotMachineView({
  players,
  currentTurnPlayerId,
  spinning,
}: {
  players: AnonPlayer[];
  currentTurnPlayerId: string | null;
  spinning: boolean;
}) {
  const n = Math.max(players.length, 1);
  const REPS = 7;

  const reel = useMemo(
    () => Array.from({ length: REPS * n }, (_, i) => players[i % n]),
    [players, n]
  );

  const translateY = useSharedValue(SLOT_ITEM_H);
  const isAnimating = useRef(false);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (!spinning || !currentTurnPlayerId || isAnimating.current || n === 0) return;
    const targetIdx = players.findIndex((p) => p.id === currentTurnPlayerId);
    if (targetIdx < 0) return;

    isAnimating.current = true;
    const landingIndex = 5 * n + targetIdx;
    const targetY = SLOT_ITEM_H * (1 - landingIndex);

    translateY.value = withTiming(
      targetY,
      { duration: 3200, easing: Easing.out(Easing.cubic) },
      () => {
        'worklet';
        isAnimating.current = false;
      }
    );
  }, [spinning, currentTurnPlayerId]);

  const winnerColor =
    currentTurnPlayerId
      ? (players.find((p) => p.id === currentTurnPlayerId)?.color ?? Colors.blue)
      : Colors.blue;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
      <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
        🎲 Who's next?
      </Text>

      {/* Slot window */}
      <View
        style={{
          width: 300,
          height: SLOT_ITEM_H * SLOT_VISIBLE,
          overflow: 'hidden',
          borderRadius: BorderRadius.card,
          backgroundColor: Colors.bg.card,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        {/* Center highlight band */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: SLOT_ITEM_H,
            left: 0,
            right: 0,
            height: SLOT_ITEM_H,
            backgroundColor: winnerColor + '14',
            borderTopWidth: 1.5,
            borderBottomWidth: 1.5,
            borderColor: winnerColor + '55',
            zIndex: 10,
          }}
        />

        {/* Top fade */}
        <LinearGradient
          colors={[Colors.bg.card, 'transparent']}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: SLOT_ITEM_H, zIndex: 11 }}
        />
        {/* Bottom fade */}
        <LinearGradient
          colors={['transparent', Colors.bg.card]}
          pointerEvents="none"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: SLOT_ITEM_H, zIndex: 11 }}
        />

        <Animated.View style={animStyle}>
          {reel.map((player, i) => (
            <View
              key={`${i}-${player.id}`}
              style={{
                height: SLOT_ITEM_H,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 24,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: player.color + '22',
                  borderWidth: 2,
                  borderColor: player.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: player.color, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>
                  {player.username[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ color: Colors.text.primary, fontSize: 17, fontFamily: 'Poppins_700Bold', flex: 1 }}
              >
                {player.username}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
        {spinning ? 'Selecting a player...' : 'Get ready...'}
      </Text>
    </View>
  );
}

// ─── WaitingSpinView ──────────────────────────────────────────────────────────

function WaitingSpinView({
  isHost,
  roomCode,
  token,
  players,
}: {
  isHost: boolean;
  roomCode: string;
  token: string | null;
  players: AnonPlayer[];
}) {
  const [spinning, setSpinning] = useState(false);
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const activePlayers = players.filter((p) => !p.isBlackedOut);
  const displayPlayers = activePlayers.length > 0 ? activePlayers : players;

  const handleSpin = async () => {
    if (!token || spinning) return;
    setSpinning(true);
    Haptics.heavy();
    try {
      const resp = await fetch(`${API_URL}/game/rooms/${roomCode}/spin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        Alert.alert('Error', (data as Record<string,string>).detail ?? 'Failed to spin. Is the server running?');
      }
    } catch {
      Alert.alert('Connection Error', 'Cannot reach the server. Check your internet connection and make sure the backend is running.');
    } finally {
      setSpinning(false);
    }
  };

  if (!isHost) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
        <SpinWheel
          players={displayPlayers}
          targetPlayerId={null}
          spinning={false}
          size={260}
        />
        <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
          Get ready!
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={Colors.blue} />
          <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
            Waiting for host to spin...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      <SpinWheel
        players={displayPlayers}
        targetPlayerId={null}
        spinning={false}
        size={260}
      />
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
          Everyone's in!
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
          Press the button to spin the bottle
        </Text>
      </View>

      <Pressable
        onPress={handleSpin}
        onPressIn={() => { btnScale.value = withSpring(0.94, SpringConfig.snappy); }}
        onPressOut={() => { btnScale.value = withSpring(1, SpringConfig.default); }}
        disabled={spinning}
        style={{ width: '100%' }}
      >
        <Animated.View style={btnStyle}>
          <LinearGradient
            colors={['#3b82f6', '#06b6d4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: BorderRadius.btn,
              paddingVertical: 18,
              alignItems: 'center',
              shadowColor: '#3b82f6',
              shadowOpacity: 0.5,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Poppins_700Bold' }}>
              {spinning ? 'Spinning...' : '🍾 Spin the Bottle!'}
            </Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─── SpinPhaseView ────────────────────────────────────────────────────────────

const SLOT_THRESHOLD = 10;
const SPIN_DELAY_MS = 4500; // pause before wheel starts spinning

function SpinPhaseView({
  players,
  myPlayer,
  currentTurnPlayerId,
  onMyTurnRevealed,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  onMyTurnRevealed?: () => void;
}) {
  const activePlayers = players.filter((p) => !p.isBlackedOut);
  const displayPlayers = activePlayers.length > 0 ? activePlayers : players;

  // Delay the actual spin so players have a moment to breathe between turns
  const [delayedTarget, setDelayedTarget] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [spinDone, setSpinDone] = useState(false);

  useEffect(() => {
    if (!currentTurnPlayerId) {
      setDelayedTarget(null);
      setCountdown(0);
      setSpinDone(false);
      return;
    }
    // Start countdown
    setSpinDone(false);
    const secs = Math.ceil(SPIN_DELAY_MS / 1000);
    setCountdown(secs);
    setDelayedTarget(null);

    const countdownTimers = Array.from({ length: secs }, (_, i) =>
      setTimeout(() => setCountdown(secs - i - 1), (i + 1) * 1000)
    );

    const spinTimer = setTimeout(() => {
      setDelayedTarget(currentTurnPlayerId);
      setCountdown(0);
    }, SPIN_DELAY_MS);

    return () => {
      countdownTimers.forEach(clearTimeout);
      clearTimeout(spinTimer);
    };
  }, [currentTurnPlayerId]);

  // Haptic ticks now handled inside SpinWheel — synced with animation
  // Single strong haptic when spin actually begins
  useEffect(() => {
    if (delayedTarget) Haptics.medium();
  }, [delayedTarget]);

  const winner = displayPlayers.find((p) => p.id === currentTurnPlayerId) ?? null;
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;

  if (displayPlayers.length > SLOT_THRESHOLD) {
    return (
      <SlotMachineView
        players={displayPlayers}
        currentTurnPlayerId={delayedTarget}
        spinning={!!delayedTarget}
      />
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 20 }}>
      <SpinWheel
        players={displayPlayers}
        targetPlayerId={delayedTarget}
        spinning={!!delayedTarget}
        size={290}
        onSpinComplete={() => {
          setSpinDone(true);
          if (myPlayer?.id === currentTurnPlayerId) {
            onMyTurnRevealed?.(); // triggers Haptics.success() inside
          } else {
            Haptics.medium(); // "fanfare" for observers
          }
        }}
      />

      {countdown > 0 ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 36, fontFamily: 'Poppins_700Bold' }}>
            {countdown}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            Next spin in...
          </Text>
        </View>
      ) : spinDone && winner ? (
        // Winner reveal card
        <Animated.View
          entering={FadeIn.duration(350)}
          style={{
            width: '100%',
            borderRadius: BorderRadius.card,
            borderWidth: 1.5,
            borderColor: winner.color + '55',
            backgroundColor: winner.color + '14',
            paddingVertical: 18,
            paddingHorizontal: 20,
            alignItems: 'center',
            gap: 6,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: winner.color + '30',
              borderWidth: 2,
              borderColor: winner.color,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            <Text style={{ color: winner.color, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
              {winner.username[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={{ color: winner.color, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>
            {isMyTurn ? 'Your turn!' : `${winner.username}'s turn`}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            {isMyTurn ? 'Choose truth or dare 👇' : 'Waiting for them to choose...'}
          </Text>
        </Animated.View>
      ) : (
        <Text style={{ color: Colors.cyan, fontSize: 14, fontFamily: 'Poppins_600SemiBold', letterSpacing: 1 }}>
          🍾 Spinning...
        </Text>
      )}
    </View>
  );
}

// ─── ChoicePhaseView ──────────────────────────────────────────────────────────

function ChoicePhaseView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  phaseEndsAt,
  token,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  phaseEndsAt: string | null;
  token: string | null;
}) {
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const { formatted } = useGameTimer(phaseEndsAt);
  const [submitting, setSubmitting] = useState(false);
  const truthScale = useSharedValue(1);
  const dareScale = useSharedValue(1);
  const truthStyle = useAnimatedStyle(() => ({ transform: [{ scale: truthScale.value }] }));
  const dareStyle = useAnimatedStyle(() => ({ transform: [{ scale: dareScale.value }] }));

  const submit = async (choice: 'truth' | 'dare') => {
    if (!currentRoundId || !token || submitting) return;
    setSubmitting(true);
    Haptics.selection();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ choice }),
      });
    } catch { /* WS phase_change handles the rest */ } finally {
      setSubmitting(false);
    }
  };

  if (!isMyTurn) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        {turnPlayer && (
          <>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: turnPlayer.color + '22',
                borderWidth: 3,
                borderColor: turnPlayer.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: turnPlayer.color, fontSize: 28, fontFamily: 'Poppins_700Bold' }}>
                {turnPlayer.username[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: turnPlayer.color, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>
              {turnPlayer.username} is choosing...
            </Text>
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={turnPlayer?.color ?? Colors.blue} />
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            {formatted}
          </Text>
        </View>
      </View>
    );
  }

  // My turn — pick truth or dare
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 28 }}>
      {turnPlayer && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: turnPlayer.color + '22',
              borderWidth: 3,
              borderColor: turnPlayer.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: turnPlayer.color, fontSize: 26, fontFamily: 'Poppins_700Bold' }}>
              {turnPlayer.username[0]?.toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: turnPlayer.color, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>
            Your turn!
          </Text>
        </View>
      )}

      <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
        Pick your poison
      </Text>

      <View style={{ flexDirection: 'row', gap: 16, width: '100%' }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => submit('truth')}
          onPressIn={() => { truthScale.value = withSpring(0.94, SpringConfig.snappy); }}
          onPressOut={() => { truthScale.value = withSpring(1, SpringConfig.default); }}
          disabled={submitting}
        >
          <Animated.View style={truthStyle}>
            <LinearGradient
              colors={['#3b82f6', '#2563eb']}
              style={{
                borderRadius: BorderRadius.card,
                padding: 24,
                alignItems: 'center',
                gap: 10,
                shadowColor: '#3b82f6',
                shadowOpacity: 0.5,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 36 }}>🎯</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Poppins_700Bold' }}>Truth</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Poppins_400Regular' }}>+10 pts</Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable
          style={{ flex: 1 }}
          onPress={() => submit('dare')}
          onPressIn={() => { dareScale.value = withSpring(0.94, SpringConfig.snappy); }}
          onPressOut={() => { dareScale.value = withSpring(1, SpringConfig.default); }}
          disabled={submitting}
        >
          <Animated.View style={dareStyle}>
            <LinearGradient
              colors={['#8b5cf6', '#7c3aed']}
              style={{
                borderRadius: BorderRadius.card,
                padding: 24,
                alignItems: 'center',
                gap: 10,
                shadowColor: '#8b5cf6',
                shadowOpacity: 0.5,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 4 },
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 36 }}>🔥</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Poppins_700Bold' }}>Dare</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Poppins_400Regular' }}>+20 pts</Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
          Time left:
        </Text>
        <Text style={{ color: Colors.yellow, fontSize: 14, fontFamily: 'Poppins_700Bold' }}>
          {formatted}
        </Text>
      </View>
    </View>
  );
}

// ─── CustomVotePhaseView ──────────────────────────────────────────────────────

function CustomVotePhaseView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  currentChoice,
  phaseEndsAt,
  token,
  customVote,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  currentChoice: 'truth' | 'dare' | null;
  phaseEndsAt: string | null;
  token: string | null;
  customVote: { yes: number; no: number; total: number; threshold: number };
}) {
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const { formatted } = useGameTimer(phaseEndsAt);
  const [myVote, setMyVote] = useState<'yes' | 'no' | null>(null);
  const choiceLabel = currentChoice === 'truth' ? 'Truth 🎯' : 'Dare 🔥';
  const choiceColor = currentChoice === 'truth' ? Colors.blue : '#8b5cf6';

  const castVote = async (value: 'yes' | 'no') => {
    if (!currentRoundId || !token || myVote) return;
    setMyVote(value);
    Haptics.light();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/custom_vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }),
      });
    } catch { /* best-effort */ }
  };

  const yesPercent = customVote.total > 0 ? Math.round((customVote.yes / customVote.total) * 100) : 0;

  if (isMyTurn) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        <View
          style={{
            backgroundColor: choiceColor + '18',
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: choiceColor + '40',
          }}
        >
          <Text style={{ color: choiceColor, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>
            {choiceLabel}
          </Text>
        </View>

        <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
          Your classmates are voting...
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
          They decide: custom question or random?
        </Text>

        {/* Vote progress */}
        <View style={{ width: '100%', gap: 10 }}>
          <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: `${yesPercent}%`,
                backgroundColor: Colors.green,
                borderRadius: 4,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.green, fontSize: 13, fontFamily: 'Poppins_700Bold' }}>
              👍 Custom {customVote.yes}
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
              Need {customVote.threshold} yes votes
            </Text>
            <Text style={{ color: Colors.red, fontSize: 13, fontFamily: 'Poppins_700Bold' }}>
              {customVote.no} 🎲 Random
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ActivityIndicator size="small" color={Colors.text.muted} />
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
            {formatted}
          </Text>
        </View>
      </View>
    );
  }

  // Non-turn player: show vote buttons
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }}>
      {turnPlayer && (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: turnPlayer.color + '22',
              borderWidth: 2.5,
              borderColor: turnPlayer.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: turnPlayer.color, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
              {turnPlayer.username[0]?.toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Poppins_500Medium' }}>
            {turnPlayer.username} chose{' '}
            <Text style={{ color: choiceColor, fontFamily: 'Poppins_700Bold' }}>{choiceLabel}</Text>
          </Text>
        </View>
      )}

      <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
        Custom question or random?
      </Text>

      <View style={{ flexDirection: 'row', gap: 14, width: '100%' }}>
        <Pressable
          style={{ flex: 1 }}
          onPress={() => castVote('yes')}
          disabled={!!myVote}
        >
          <LinearGradient
            colors={myVote === 'yes' ? ['#16a34a', '#15803d'] : myVote ? ['#1a2235', '#1a2235'] : ['rgba(34,197,94,0.18)', 'rgba(34,197,94,0.08)']}
            style={{
              borderRadius: BorderRadius.card,
              padding: 20,
              alignItems: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: myVote === 'yes' ? Colors.green : myVote ? 'rgba(255,255,255,0.06)' : 'rgba(34,197,94,0.35)',
            }}
          >
            <Text style={{ fontSize: 32 }}>👍</Text>
            <Text style={{ color: myVote === 'yes' ? '#fff' : myVote ? Colors.text.muted : Colors.green, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
              Custom
            </Text>
            <Text style={{ color: myVote === 'yes' ? 'rgba(255,255,255,0.7)' : Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
              write a question
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={{ flex: 1 }}
          onPress={() => castVote('no')}
          disabled={!!myVote}
        >
          <LinearGradient
            colors={myVote === 'no' ? ['#b45309', '#92400e'] : myVote ? ['#1a2235', '#1a2235'] : ['rgba(245,158,11,0.18)', 'rgba(245,158,11,0.08)']}
            style={{
              borderRadius: BorderRadius.card,
              padding: 20,
              alignItems: 'center',
              gap: 8,
              borderWidth: 1.5,
              borderColor: myVote === 'no' ? Colors.yellow : myVote ? 'rgba(255,255,255,0.06)' : 'rgba(245,158,11,0.35)',
            }}
          >
            <Text style={{ fontSize: 32 }}>🎲</Text>
            <Text style={{ color: myVote === 'no' ? '#fff' : myVote ? Colors.text.muted : Colors.yellow, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
              Random
            </Text>
            <Text style={{ color: myVote === 'no' ? 'rgba(255,255,255,0.7)' : Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
              pick from database
            </Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* Live count */}
      <View style={{ width: '100%', gap: 8 }}>
        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${yesPercent}%`,
              backgroundColor: Colors.green,
              borderRadius: 3,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: Colors.green, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
            👍 {customVote.yes} custom
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
            {formatted}
          </Text>
          <Text style={{ color: Colors.yellow, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
            🎲 {customVote.no} random
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── SuggestionPhaseView ──────────────────────────────────────────────────────

function SuggestionPhaseView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  currentChoice,
  phaseEndsAt,
  token,
  suggesterPlayerId,
  isSuggestionSubmitted,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  currentChoice: 'truth' | 'dare' | null;
  phaseEndsAt: string | null;
  token: string | null;
  suggesterPlayerId: string | null;
  isSuggestionSubmitted: boolean;
}) {
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;
  const isSuggester = !isMyTurn && myPlayer?.id === suggesterPlayerId;
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const suggesterPlayer = players.find((p) => p.id === suggesterPlayerId);
  const { formatted } = useGameTimer(phaseEndsAt);
  const [questionText, setQuestionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const choiceLabel = currentChoice === 'truth' ? 'truth' : 'dare';
  const choiceColor = currentChoice === 'truth' ? Colors.blue : '#8b5cf6';

  const submitQuestion = async () => {
    const trimmed = questionText.trim();
    if (!trimmed || !currentRoundId || !token || submitting || submitted) return;
    setSubmitting(true);
    Haptics.medium();
    try {
      const res = await fetch(`${API_URL}/game/rounds/${currentRoundId}/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed }),
      });
      if (res.ok) {
        setSubmitted(true);
        setQuestionText('');
        Haptics.success();
      }
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  };

  const hasSubmitted = submitted || isSuggestionSubmitted;

  // Turn player sees: "a classmate is writing..."
  if (isMyTurn) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
        <Text style={{ fontSize: 52 }}>✍️</Text>
        <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
          A classmate is writing your {choiceLabel}...
        </Text>
        {suggesterPlayer && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
              {hasSubmitted ? '✅ Question submitted!' : `${suggesterPlayer.username} is typing...`}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={choiceColor} />
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
            {formatted}
          </Text>
        </View>
      </View>
    );
  }

  // Suggester: sees the text input
  if (isSuggester) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🎤</Text>
            <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
              You're writing the {choiceLabel}!
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
              Write a {choiceLabel} for{' '}
              <Text style={{ color: turnPlayer?.color ?? Colors.text.primary, fontFamily: 'Poppins_700Bold' }}>
                {turnPlayer?.username ?? 'them'}
              </Text>
            </Text>
          </View>

          {hasSubmitted ? (
            <View
              style={{
                backgroundColor: 'rgba(34,197,94,0.1)',
                borderRadius: BorderRadius.card,
                borderWidth: 1,
                borderColor: 'rgba(34,197,94,0.25)',
                padding: 20,
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 36 }}>✅</Text>
              <Text style={{ color: Colors.green, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
                Question submitted!
              </Text>
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
                It'll be revealed when the timer ends.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={{
                  backgroundColor: Colors.bg.card,
                  borderRadius: BorderRadius.input,
                  borderWidth: 1.5,
                  borderColor: questionText ? choiceColor + '66' : 'rgba(255,255,255,0.1)',
                  color: Colors.text.primary,
                  fontSize: 15,
                  fontFamily: 'Poppins_400Regular',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  minHeight: 100,
                  textAlignVertical: 'top',
                }}
                multiline
                maxLength={300}
                autoFocus
                placeholder={`Write a ${choiceLabel} question...`}
                placeholderTextColor={Colors.text.muted}
                value={questionText}
                onChangeText={setQuestionText}
              />
              <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'right' }}>
                {questionText.length}/300
              </Text>

              <Pressable
                onPress={submitQuestion}
                disabled={!questionText.trim() || submitting}
              >
                <LinearGradient
                  colors={questionText.trim() ? [choiceColor, choiceColor + 'cc'] : ['#1a2235', '#1a2235']}
                  style={{
                    borderRadius: BorderRadius.btn,
                    paddingVertical: 16,
                    alignItems: 'center',
                    opacity: questionText.trim() ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
                    {submitting ? 'Submitting...' : '📤 Submit Question'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
              Time left:
            </Text>
            <Text style={{ color: Colors.yellow, fontSize: 13, fontFamily: 'Poppins_700Bold' }}>
              {formatted}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Other non-turn players: just watch
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 }}>
      <Text style={{ fontSize: 52 }}>✍️</Text>
      <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
        {suggesterPlayer ? `${suggesterPlayer.username} is writing...` : 'Someone is writing...'}
      </Text>
      <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
        {hasSubmitted ? '✅ Question submitted!' : `A custom ${choiceLabel} for ${turnPlayer?.username ?? 'them'}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={choiceColor} />
        <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
          {formatted}
        </Text>
      </View>
    </View>
  );
}

// ─── ConfettiParticle ────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#ec4899'];

function ConfettiParticle({ x, color, delay }: { x: number; color: string; delay: number }) {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 60;
    setTimeout(() => {
      opacity.value = withTiming(1, { duration: 100 });
      translateY.value = withTiming(700, { duration: 1400, easing: Easing.in(Easing.quad) });
      translateX.value = withTiming(drift, { duration: 1400 });
      rotate.value = withTiming(Math.random() * 720 - 360, { duration: 1400 });
      opacity.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 400 }),
      );
    }, delay);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const size = 8 + Math.random() * 6;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: 0,
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          borderRadius: 2,
        },
        style,
      ]}
      pointerEvents="none"
    />
  );
}

// ─── ActiveView ───────────────────────────────────────────────────────────────

function ActiveView({
  players,
  myPlayer,
  phase,
  currentTurnPlayerId,
  currentRoundId,
  currentContent,
  currentAnswer,
  reactions,
  comments,
  votes,
  phaseEndsAt,
  isReconnecting,
  token,
  roomCode,
  isHost,
  currentChoice,
  customVote,
  suggesterPlayerId,
  isSuggestionSubmitted,
  dareResult,
  punishmentResult,
  identityReveal,
  punishmentOptions,
  onDismissPunishment,
  readyVotes,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  phase: string;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  currentContent: import('@/types').TruthOrDare | null;
  currentAnswer: string | null;
  reactions: import('@/types').Reaction[];
  comments: import('@/types').Comment[];
  votes: import('@/types').Vote[];
  phaseEndsAt: string | null;
  isReconnecting: boolean;
  token: string | null;
  roomCode: string;
  isHost: boolean;
  currentChoice: 'truth' | 'dare' | null;
  customVote: { yes: number; no: number; total: number; threshold: number };
  suggesterPlayerId: string | null;
  isSuggestionSubmitted: boolean;
  dareResult: { passed: boolean; yesVotes: number; totalVotes: number } | null;
  punishmentResult: { result: 'ban' | 'reveal'; targetId: string } | null;
  identityReveal: { playerId: string; realName: string; phoneLast4: string } | null;
  punishmentOptions: { a: string; b: string } | null;
  onDismissPunishment: () => void;
  readyVotes: { count: number; total: number; threshold: number };
}) {
  const [myTurnFlash, setMyTurnFlash] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  // Pre-generate stable confetti particles (re-keyed on each trigger)
  const confettiParticles = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      x: Math.random() * 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 300,
    })),
  [confettiKey]);

  const triggerMyTurnFlash = useCallback(() => {
    Haptics.success();
    setMyTurnFlash(true);
    setShowConfetti(true);
    setConfettiKey((k) => k + 1);
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withTiming(1, { duration: 800 }),
      withTiming(0, { duration: 300 }),
    );
    setTimeout(() => {
      setMyTurnFlash(false);
      setShowConfetti(false);
    }, 1800);
  }, []);

  const myTurnColor = myPlayer
    ? (players.find((p) => p.id === myPlayer.id)?.color ?? '#3b82f6')
    : '#3b82f6';

  const [showScoreboard, setShowScoreboard] = useState(false);
  const drawerX = useSharedValue(280);
  const backdropOpacity = useSharedValue(0);

  const openScoreboard = useCallback(() => {
    setShowScoreboard(true);
    drawerX.value = withSpring(0, { damping: 20, stiffness: 200 });
    backdropOpacity.value = withTiming(1, { duration: 250 });
    Haptics.light();
  }, []);

  const closeScoreboard = useCallback(() => {
    drawerX.value = withTiming(280, { duration: 220 });
    backdropOpacity.value = withTiming(0, { duration: 220 });
    setTimeout(() => setShowScoreboard(false), 230);
    Haptics.light();
  }, []);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerX.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <View style={{ flex: 1 }}>
      <ConnectionBanner visible={isReconnecting} />

      {/* Confetti burst + "Your turn!" flash overlay */}
      {(myTurnFlash || showConfetti) && (
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
          pointerEvents="none"
        >
          {/* Confetti particles */}
          {showConfetti && confettiParticles.map((p) => (
            <ConfettiParticle key={`${confettiKey}-${p.id}`} x={p.x} color={p.color} delay={p.delay} />
          ))}

          {/* Flash overlay */}
          {myTurnFlash && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: myTurnColor + '22',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                },
                flashStyle,
              ]}
            >
              <Text style={{ fontSize: 64 }}>🎯</Text>
              <Text style={{ color: myTurnColor, fontSize: 32, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
                Your turn!
              </Text>
            </Animated.View>
          )}
        </View>
      )}

      {punishmentResult && (
        <PunishmentBanner
          result={punishmentResult}
          players={players}
          onDismiss={onDismissPunishment}
        />
      )}

      <Animated.View key={phase} entering={SlideInRight.duration(280)} style={{ flex: 1 }}>
      {phase === 'waiting_spin' ? (
        <WaitingSpinView
          isHost={isHost}
          roomCode={roomCode}
          token={token}
          players={players}
        />
      ) : phase === 'spinning' ? (
        <SpinPhaseView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          onMyTurnRevealed={triggerMyTurnFlash}
        />
      ) : phase === 'choice' ? (
        <ChoicePhaseView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          phaseEndsAt={phaseEndsAt}
          token={token}
        />
      ) : phase === 'custom_vote' ? (
        <CustomVotePhaseView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          currentChoice={currentChoice}
          phaseEndsAt={phaseEndsAt}
          token={token}
          customVote={customVote}
        />
      ) : phase === 'suggestion' ? (
        <SuggestionPhaseView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          currentChoice={currentChoice}
          phaseEndsAt={phaseEndsAt}
          token={token}
          suggesterPlayerId={suggesterPlayerId}
          isSuggestionSubmitted={isSuggestionSubmitted}
        />
      ) : phase === 'truth_question' ? (
        <TruthQuestionView
          players={players}
          currentTurnPlayerId={currentTurnPlayerId}
          content={currentContent}
          phaseEndsAt={phaseEndsAt}
        />
      ) : phase === 'truth_answer' || phase === 'truth_revealed' ? (
        <TruthAnswerView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          content={currentContent}
          phaseEndsAt={phaseEndsAt}
          token={token}
          roomCode={roomCode}
        />
      ) : phase === 'dare_show' ? (
        <DareShowView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          content={currentContent}
          phaseEndsAt={phaseEndsAt}
          token={token}
        />
      ) : phase === 'dare_vote' ? (
        <DareVoteView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          currentRoundId={currentRoundId}
          content={currentContent}
          phaseEndsAt={phaseEndsAt}
          token={token}
          votes={votes}
        />
      ) : phase === 'punishment_vote' ? (
        <PunishmentVoteView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
          phaseEndsAt={phaseEndsAt}
          votes={votes}
          optionA={punishmentOptions?.a}
          optionB={punishmentOptions?.b}
          token={token}
          roomCode={roomCode}
        />
      ) : phase === 'identity_reveal' ? (
        <IdentityRevealView
          players={players}
          reveal={identityReveal}
          phaseEndsAt={phaseEndsAt}
        />
      ) : phase === 'reaction' ? (
        <ReactionView
          players={players}
          myPlayer={myPlayer}
          currentRoundId={currentRoundId}
          content={currentContent}
          currentAnswer={currentAnswer}
          reactions={reactions}
          comments={comments}
          phaseEndsAt={phaseEndsAt}
          token={token}
          dareResult={dareResult}
          readyVotes={readyVotes}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
          <Text style={{ fontSize: 40 }}>⏳</Text>
          <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            {phase.replace(/_/g, ' ')}
          </Text>
        </View>
      )}
      </Animated.View>

      {/* Floating 📊 Scores button */}
      <Pressable
        onPress={openScoreboard}
        style={{
          position: 'absolute',
          top: 8,
          right: 12,
          backgroundColor: 'rgba(59,130,246,0.15)',
          borderWidth: 1,
          borderColor: 'rgba(59,130,246,0.3)',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          zIndex: 50,
        }}
      >
        <Text style={{ fontSize: 13 }}>📊</Text>
        <Text style={{ color: Colors.blue, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>
          Scores
        </Text>
      </Pressable>

      {/* Backdrop — tap outside to close */}
      {showScoreboard && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 200,
            },
            backdropStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={closeScoreboard} />
        </Animated.View>
      )}

      {/* Scoreboard drawer (right slide-in panel) */}
      {showScoreboard && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 280,
              backgroundColor: Colors.bg.secondary,
              borderLeftWidth: 1,
              borderLeftColor: 'rgba(255,255,255,0.08)',
              zIndex: 300,
            },
            drawerStyle,
          ]}
        >
          {/* Drawer header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
              📊 Scoreboard
            </Text>
            <Pressable onPress={closeScoreboard} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={Colors.text.secondary} />
            </Pressable>
          </View>

          {/* Player score rows */}
          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {(() => {
              const sorted = [...players].sort((a, b) => b.points - a.points);
              const maxPoints = Math.max(sorted[0]?.points ?? 0, 1);
              return sorted.map((p, idx) => (
                <ScoreBar
                  key={p.id}
                  player={p}
                  rank={idx + 1}
                  maxPoints={maxPoints}
                  isMe={p.id === myPlayer?.id}
                  isTurn={p.id === currentTurnPlayerId}
                />
              ));
            })()}
          </ScrollView>
        </Animated.View>
      )}

    </View>
  );
}

// ─── EndedView ────────────────────────────────────────────────────────────────

function EndedView({
  players,
  myPlayer,
  lastPlaceReveal,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  lastPlaceReveal: { name: string; phoneLast4: string } | null;
}) {
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 12 }}>
        <Text style={{ fontSize: 56 }}>🏆</Text>
        <Text
          style={{ color: Colors.text.primary, fontSize: 32, fontFamily: 'Poppins_700Bold' }}
        >
          Game Over!
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
          Final standings
        </Text>
      </View>

      {/* Leaderboard */}
      <View
        style={{
          backgroundColor: Colors.bg.card,
          borderRadius: BorderRadius.card,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        {sorted.map((player, idx) => {
          const isWinner = idx === 0;
          const isMe = player.id === myPlayer?.id;

          return (
            <View key={player.id}>
              <LinearGradient
                colors={
                  isWinner
                    ? ['rgba(245,158,11,0.1)', 'rgba(245,158,11,0.03)']
                    : ['transparent', 'transparent']
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 16,
                  backgroundColor: isMe ? 'rgba(59,130,246,0.06)' : undefined,
                }}
              >
                <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>
                  {idx < 3 ? medals[idx] : `${idx + 1}.`}
                </Text>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: player.color + '22',
                    borderWidth: isWinner ? 2 : 1.5,
                    borderColor: isWinner ? Colors.yellow : player.color,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: isWinner ? Colors.yellow : player.color,
                      fontSize: 14,
                      fontFamily: 'Poppins_700Bold',
                    }}
                  >
                    {player.username[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: isMe ? Colors.blue : isWinner ? Colors.yellow : Colors.text.primary,
                    fontSize: 14,
                    fontFamily: 'Poppins_700Bold',
                  }}
                  numberOfLines={1}
                >
                  {player.username}
                  {isMe ? ' (you)' : ''}
                </Text>
                <Text
                  style={{
                    color: isWinner ? Colors.yellow : Colors.text.secondary,
                    fontSize: 14,
                    fontFamily: 'Poppins_700Bold',
                  }}
                >
                  {player.points}pt
                </Text>
              </LinearGradient>
              {idx < sorted.length - 1 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    marginHorizontal: 16,
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Identity reveal */}
      {lastPlaceReveal && sorted.length > 0 && (
        <View
          style={{
            backgroundColor: 'rgba(239,68,68,0.07)',
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(239,68,68,0.18)',
            padding: 20,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: Colors.red,
              fontSize: 16,
              fontFamily: 'Poppins_700Bold',
              textAlign: 'center',
            }}
          >
            💀 Identity Revealed
          </Text>
          <Text
            style={{
              color: Colors.text.secondary,
              fontSize: 13,
              fontFamily: 'Poppins_400Regular',
              textAlign: 'center',
            }}
          >
            Last place ({sorted[sorted.length - 1]?.username}) is actually:
          </Text>
          <View
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              borderRadius: 12,
              padding: 16,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text
              style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}
            >
              {lastPlaceReveal.name}
            </Text>
            <Text
              style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}
            >
              ···· ···· ···· {lastPlaceReveal.phoneLast4}
            </Text>
          </View>
        </View>
      )}

      {/* Share button */}
      <Pressable
        onPress={() => {
          Haptics.medium();
          const medals = ['🥇', '🥈', '🥉'];
          const lines = sorted.map((p, i) =>
            `${i < 3 ? medals[i] : `${i + 1}.`} ${p.username} — ${p.points}pt`
          );
          const reveal = lastPlaceReveal
            ? `\n💀 Last place revealed: ${lastPlaceReveal.name} (···${lastPlaceReveal.phoneLast4})`
            : '';
          shareText(`🍾 ClassChaos Results\n\n${lines.join('\n')}${reveal}\n\nPlay now: classchaos.app`);
        }}
      >
        <LinearGradient
          colors={['#3b82f6', '#06b6d4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: BorderRadius.btn,
            paddingVertical: 15,
            alignItems: 'center',
            shadowColor: '#3b82f6',
            shadowOpacity: 0.4,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
            📤 Share Results
          </Text>
        </LinearGradient>
      </Pressable>

      {/* Leave */}
      <Pressable
        onPress={() => {
          Haptics.medium();
          router.push('/(tabs)/home');
        }}
      >
        <View
          style={{
            backgroundColor: Colors.bg.secondary,
            borderRadius: BorderRadius.btn,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text
            style={{ color: Colors.text.secondary, fontSize: 15, fontFamily: 'Poppins_700Bold' }}
          >
            Leave Room
          </Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GameRoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token, user } = useAuthStore();
  const store = useGameStore();

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [lastPlaceReveal, setLastPlaceReveal] = useState<{
    name: string;
    phoneLast4: string;
  } | null>(null);
  const [dareResult, setDareResult] = useState<{
    passed: boolean;
    yesVotes: number;
    totalVotes: number;
  } | null>(null);
  const [punishmentResult, setPunishmentResult] = useState<{
    result: 'ban' | 'reveal';
    targetId: string;
  } | null>(null);
  const [identityReveal, setIdentityReveal] = useState<{
    playerId: string;
    realName: string;
    phoneLast4: string;
  } | null>(null);
  const [punishmentOptions, setPunishmentOptions] = useState<{
    a: string;
    b: string;
  } | null>(null);
  const [showAdGate, setShowAdGate] = useState(false);
  const [currentChoice, setCurrentChoice] = useState<'truth' | 'dare' | null>(null);

  const room = store.room ? mapApiRoom(store.room as unknown as Record<string, unknown>) : null;

  // hostId check — handle both camelCase (mapped) and snake_case (raw API / WS)
  const rawRoom = store.room as unknown as Record<string, unknown>;
  const roomHostId = room?.hostId || (rawRoom?.host_id as string) || '';

  // myUserId — user from auth store OR userId mapped from myPlayer
  const rawMyPlayer = store.myPlayer as unknown as Record<string, unknown>;
  const myUserId = user?.id || (rawMyPlayer?.user_id as string) || store.myPlayer?.userId || '';

  const isHost = !!(myUserId && roomHostId && myUserId === roomHostId);

  // ── Initial data fetch ────────────────────────────────────────────────────

  useEffect(() => {
    if (!token || !code) return;

    // Already have this room from create/join flow — skip fetch
    const storedCode = (store.room as unknown as Record<string, unknown>)?.code as
      | string
      | undefined;
    if (storedCode === code && store.myPlayer) {
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/game/rooms/${code}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setFetchError(data.detail ?? 'Room not found');
          return;
        }
        store.setRoom(data.room);
        store.setMyPlayer(mapAnyPlayer(data.player as Record<string, unknown>));
        store.setPlayers(
          (data.players as Record<string, unknown>[]).map(mapAnyPlayer)
        );
      })
      .catch(() => setFetchError('Network error — please retry'))
      .finally(() => setLoading(false));
  }, [code, token]);

  // ── WS message handler ────────────────────────────────────────────────────

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      const d = msg.data as Record<string, unknown>;

      switch (msg.type) {
        case 'state_sync': {
          // Merge instead of replace so host_id/hostId is never wiped by a partial WS room object
          if (d.room) store.setRoom({ ...(store.room as object ?? {}), ...(d.room as object) } as never);
          if (d.players)
            store.setPlayers(
              (d.players as Record<string, unknown>[]).map(mapAnyPlayer)
            );
          const round = d.round as Record<string, unknown> | null | undefined;
          if (round) {
            const roundPhase = round.phase as GamePhase;
            store.setPhase(roundPhase, round.phase_ends_at as string | undefined);
            store.setCurrentTurn(round.player_id as string);
            store.setCurrentRoundId(round.id as string);
            if (round.content) store.setCurrentContent(round.content as never);
            // Restore custom vote / suggestion state on reconnect
            if (roundPhase === 'custom_vote' || roundPhase === 'suggestion') {
              if (round.choice) setCurrentChoice(round.choice as 'truth' | 'dare');
            }
            if (roundPhase === 'suggestion' && round.suggester_player_id) {
              store.setSuggesterPlayerId(round.suggester_player_id as string);
            }
          }
          setLoading(false);
          break;
        }
        case 'player_join': {
          const p = mapAnyPlayer(
            (d.player ?? d) as Record<string, unknown>
          );
          store.addPlayer(p);
          break;
        }
        case 'player_leave':
          store.removePlayer(d.playerId as string);
          break;

        case 'game_start': {
          store.setRoom({
            ...(store.room as object),
            status: 'active',
            starts_at: d.starts_at,
            ends_at: d.ends_at,
          } as never);
          if (d.players)
            store.setPlayers(
              (d.players as Record<string, unknown>[]).map(mapAnyPlayer)
            );
          if (d.color_map) store.updateColorMap(d.color_map as Record<string, string>);
          store.setPhase('waiting_spin');  // host presses spin manually
          Haptics.success();
          if (!user?.isPremium) setShowAdGate(true);
          break;
        }
        case 'spin_start':
          store.setCurrentTurn(d.target_player_id as string);
          store.setPhase('spinning');
          break;

        case 'spin_result':
          store.setCurrentTurn(d.target_player_id as string);
          store.setCurrentRoundId(d.round_id as string);
          store.setPhase(d.phase as GamePhase, d.phase_ends_at as string | undefined);
          store.clearCustomVote();
          store.setSuggesterPlayerId(null);
          store.setSuggestionSubmitted(false);
          break;

        case 'phase_change': {
          const newPhase = d.phase as GamePhase;
          store.setPhase(newPhase, (d.ends_at ?? d.phase_ends_at) as string | undefined);

          if (newPhase === 'custom_vote') {
            setCurrentChoice((d.choice as 'truth' | 'dare') ?? null);
            store.clearCustomVote();
          } else if (newPhase === 'suggestion') {
            setCurrentChoice((d.choice as 'truth' | 'dare') ?? null);
            store.setSuggesterPlayerId((d.suggester_player_id as string) ?? null);
            store.setSuggestionSubmitted(false);
          } else if (newPhase === 'spinning') {
            Haptics.heavy(); // everyone feels the spin start
            setDareResult(null);
            setIdentityReveal(null);
            setPunishmentResult(null);
            store.clearReadyVotes();
            store.clearCustomVote();
            store.setSuggesterPlayerId(null);
            store.setSuggestionSubmitted(false);
            setCurrentChoice(null);
          } else if (newPhase === 'punishment_vote') {
            store.setVotes([]);  // clear dare votes before punishment vote starts
            if (d.options) {
              const opts = d.options as Record<string, string>;
              setPunishmentOptions({ a: opts.a ?? 'Permanent ban', b: opts.b ?? 'Identity reveal' });
            }
          }
          break;
        }

        case 'content_shown':
          store.setCurrentContent(d.content as never);
          store.setPhase(d.phase as GamePhase, d.phase_ends_at as string | undefined);
          break;

        case 'answer_submitted':
          store.setCurrentAnswer(d.answer as string);
          break;

        case 'vote_update':
          store.setVotes(d.votes as never[]);
          break;

        case 'reaction':
          store.addReaction({
            id: (d.id as string) ?? `${Date.now()}-${Math.random()}`,
            playerId: (d.player_id ?? d.playerId) as string,
            emoji: d.emoji as Reaction['emoji'],
            createdAt: (d.createdAt ?? new Date().toISOString()) as string,
          });
          Haptics.light();
          break;

        case 'comment':
          store.addComment(d as never);
          break;

        case 'points_update':
          store.updatePlayer(d.player_id as string, {
            points: (d.pts ?? d.points) as number,
          });
          break;

        case 'player_colors_shuffle':
          store.updateColorMap(d.color_map as Record<string, string>);
          break;

        case 'blackout_start':
          store.updatePlayer(d.player_id as string, {
            isBlackedOut: true,
            blackoutEndsAt: d.ends_at as string,
          });
          if (d.player_id === store.myPlayer?.id) {
            Haptics.error();
          }
          break;

        case 'skip_life_used':
          store.updatePlayer(d.player_id as string, {
            lives: d.lives_remaining as number,
            points: d.pts as number,
          });
          break;

        case 'game_end': {
          store.setRoom({ ...(store.room as object), status: 'ended' } as never);
          if (d.leaderboard)
            store.setPlayers(
              (d.leaderboard as Record<string, unknown>[]).map(mapAnyPlayer)
            );
          const reveal = d.last_place_reveal as
            | { name: string; phoneLast4: string }
            | null;
          if (reveal) setLastPlaceReveal(reveal);
          store.setPhase('ended');
          Haptics.success();
          break;
        }

        case 'dare_result':
          setDareResult({
            passed: d.passed as boolean,
            yesVotes: (d.yes_votes ?? d.yesVotes) as number,
            totalVotes: (d.total_votes ?? d.totalVotes) as number,
          });
          (d.passed as boolean) ? Haptics.success() : Haptics.error();
          break;

        case 'punishment_vote_result':
          setPunishmentResult({
            result: d.result as 'ban' | 'reveal',
            targetId: ((d.target_player_id ?? d.targetId) as string) ?? '',
          });
          Haptics.warning();
          if (d.result === 'ban' && d.target_player_id) {
            store.updatePlayer(d.target_player_id as string, { lives: 0 });
          }
          break;

        case 'identity_reveal':
          setIdentityReveal({
            playerId: d.playerId as string,
            realName: d.realName as string,
            phoneLast4: d.phoneLast4 as string,
          });
          Haptics.warning();
          break;

        case 'ready_update':
          store.setReadyVotes(
            d.ready_count as number,
            d.total as number,
            d.threshold as number,
          );
          break;

        case 'custom_vote_update':
          store.setCustomVote(
            d.yes as number,
            d.no as number,
            d.total as number,
            d.threshold as number,
          );
          break;

        case 'suggestion_submitted':
          store.setSuggestionSubmitted(true);
          break;

        case 'error':
          Alert.alert('Game Error', (d.message as string) ?? 'Something went wrong');
          break;
      }
    },
    [store]
  );

  useWebSocket({
    roomCode: code ?? '',
    playerId: store.myPlayer?.id ?? '',
    token: token ?? '',
    onMessage: handleMessage,
    onOpen: () => store.setConnected(true),
    onClose: () => store.setConnected(false),
  });

  // ── Start game ────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!token || !code || starting) return;
    setStarting(true);
    Haptics.medium();
    try {
      const res = await fetch(`${API_URL}/game/rooms/${code}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        Alert.alert('Error', (d.detail as string) ?? 'Could not start game');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setStarting(false);
    }
  };

  // ── Leave handler ─────────────────────────────────────────────────────────

  const handleLeave = () => {
    Haptics.light();
    store.clearGame();
    router.push('/(tabs)/home');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const statusLabel =
    room?.status === 'waiting'
      ? `${store.players.length} player${store.players.length !== 1 ? 's' : ''} waiting`
      : room?.status === 'ended'
      ? 'Ended'
      : null; // active: show live timer instead

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <Pressable onPress={handleLeave} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
          <Text
            style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_700Bold' }}
          >
            Room · {code}
          </Text>
          {statusLabel != null ? (
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
              {statusLabel}
            </Text>
          ) : (
            <GameTimerLabel endsAt={room?.endsAt ?? null} />
          )}
        </View>

        {/* Connection dot */}
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: store.isConnected
              ? Colors.green
              : store.isReconnecting
              ? Colors.yellow
              : Colors.red,
          }}
        />
      </View>

      {/* Body */}
      {loading ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}
        >
          <ActivityIndicator size="large" color={Colors.blue} />
          <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
            Loading room...
          </Text>
        </View>
      ) : fetchError ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            padding: 24,
          }}
        >
          <Text style={{ fontSize: 40 }}>😕</Text>
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 18,
              fontFamily: 'Poppins_700Bold',
              textAlign: 'center',
            }}
          >
            {fetchError}
          </Text>
          <Pressable onPress={handleLeave}>
            <Text
              style={{ color: Colors.blue, fontSize: 15, fontFamily: 'Poppins_600SemiBold' }}
            >
              ← Back to Home
            </Text>
          </Pressable>
        </View>
      ) : room?.status === 'waiting' || room?.status == null ? (
        <LobbyView
          room={room ?? mapApiRoom({ id: '', code: code ?? '', status: 'waiting', duration_minutes: 30 })}
          players={store.players}
          myPlayer={store.myPlayer}
          isHost={isHost}
          isConnected={store.isConnected}
          isReconnecting={store.isReconnecting}
          onStart={handleStart}
          starting={starting}
        />
      ) : room.status === 'active' ? (
        <ActiveView
          players={store.players}
          myPlayer={store.myPlayer}
          phase={store.phase}
          currentTurnPlayerId={store.currentTurnPlayerId}
          currentRoundId={store.currentRoundId}
          currentContent={store.currentContent}
          currentAnswer={store.currentAnswer}
          reactions={store.reactions}
          comments={store.comments}
          votes={store.votes}
          phaseEndsAt={store.phaseEndsAt}
          isReconnecting={store.isReconnecting}
          token={token}
          roomCode={code ?? ''}
          isHost={isHost}
          currentChoice={currentChoice}
          customVote={store.customVote}
          suggesterPlayerId={store.suggesterPlayerId}
          isSuggestionSubmitted={store.isSuggestionSubmitted}
          dareResult={dareResult}
          punishmentResult={punishmentResult}
          identityReveal={identityReveal}
          punishmentOptions={punishmentOptions}
          onDismissPunishment={() => setPunishmentResult(null)}
          readyVotes={store.readyVotes}
        />
      ) : (
        <EndedView
          players={store.players}
          myPlayer={store.myPlayer}
          lastPlaceReveal={lastPlaceReveal}
        />
      )}

      <AdGate visible={showAdGate} onDismiss={() => setShowAdGate(false)} />
    </SafeAreaView>
  );
}
