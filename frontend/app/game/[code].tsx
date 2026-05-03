import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Share,
  StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
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
import type { AnonPlayer, WSMessage } from '@/types';

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

function mapAnyPlayer(p: Record<string, unknown>): AnonPlayer {
  return {
    id: p.id as string,
    userId: ((p.user_id ?? p.userId) as string) ?? '',
    username: ((p.username ?? p.un) as string) ?? '?',
    color: (p.color as string) ?? '#3b82f6',
    points: ((p.points ?? p.pts) as number) ?? 0,
    lives: (p.lives as number) ?? 1,
    skipsUsed: ((p.skips_used ?? p.skips) as number) ?? 0,
    isBlackedOut: ((p.is_blacked_out ?? p.blacked_out) as boolean) ?? false,
    blackoutEndsAt: ((p.blackout_ends_at ?? p.blackoutEndsAt) as string | null) ?? null,
    turnCount: ((p.turn_count ?? p.turnCount) as number) ?? 0,
    lastTurnAt: ((p.last_turn_at ?? p.lastTurnAt) as string | null) ?? null,
    joinOrder: ((p.join_order ?? p.joinOrder) as number) ?? 0,
  };
}

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
      <Text style={{ color: Colors.yellow, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
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
        <Text style={{ color: player.color, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
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
              fontFamily: 'Syne_800ExtraBold',
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
              <Text style={{ color: Colors.red, fontSize: 9, fontFamily: 'Inter_700Bold' }}>
                BLACKED OUT
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {Array.from({ length: Math.max(0, player.lives) }).map((_, i) => (
            <Text key={i} style={{ fontSize: 9 }}>
              ❤️
            </Text>
          ))}
          {player.lives === 0 && (
            <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
              no lives
            </Text>
          )}
        </View>
      </View>

      {/* Points */}
      {player.points > 0 && (
        <View
          style={{
            backgroundColor: 'rgba(59,130,246,0.1)',
            borderRadius: 8,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: Colors.blue, fontSize: 12, fontFamily: 'Inter_700Bold' }}>
            {player.points}pt
          </Text>
        </View>
      )}
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
    await Clipboard.setStringAsync(room.code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
              fontFamily: 'Inter_600SemiBold',
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
              fontFamily: 'Syne_900Black',
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
            <Text style={{ color: Colors.cyan, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
              Copy Code
            </Text>
          </Pressable>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            Share with your classmates to join
          </Text>
        </LinearGradient>

        {/* Players Section */}
        <View style={{ gap: 12 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text
              style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}
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
                style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_500Medium' }}
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
            style={{ color: Colors.purple, fontSize: 13, fontFamily: 'Syne_800ExtraBold' }}
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
                  fontFamily: 'Inter_400Regular',
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
                    fontFamily: 'Syne_800ExtraBold',
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
                fontFamily: 'Inter_400Regular',
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
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {players.map((p) => (
          <View key={p.id} style={{ alignItems: 'center', gap: 3 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: p.color + '22',
                borderWidth: p.id === currentTurnPlayerId ? 2.5 : 1.5,
                borderColor: p.id === currentTurnPlayerId ? p.color : p.color + '55',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: p.isBlackedOut ? 0.3 : 1,
              }}
            >
              <Text style={{ color: p.color, fontSize: 12, fontFamily: 'Syne_800ExtraBold' }}>
                {p.username[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: Colors.text.muted, fontSize: 9, fontFamily: 'Inter_500Medium' }}>
              {p.points}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
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
      <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Syne_800ExtraBold' }}>
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
                <Text style={{ color: player.color, fontSize: 18, fontFamily: 'Syne_900Black' }}>
                  {player.username[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{ color: Colors.text.primary, fontSize: 17, fontFamily: 'Syne_800ExtraBold', flex: 1 }}
              >
                {player.username}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>

      <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
        {spinning ? 'Selecting a player...' : 'Get ready...'}
      </Text>
    </View>
  );
}

// ─── SpinPhaseView ────────────────────────────────────────────────────────────

const SLOT_THRESHOLD = 10;

function SpinPhaseView({
  players,
  myPlayer,
  currentTurnPlayerId,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
}) {
  const activePlayers = players.filter((p) => !p.isBlackedOut);
  const displayPlayers = activePlayers.length > 0 ? activePlayers : players;

  if (displayPlayers.length > SLOT_THRESHOLD) {
    return (
      <SlotMachineView
        players={displayPlayers}
        currentTurnPlayerId={currentTurnPlayerId}
        spinning={!!currentTurnPlayerId}
      />
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 20 }}>
      <SpinWheel
        players={displayPlayers}
        targetPlayerId={currentTurnPlayerId}
        spinning={!!currentTurnPlayerId}
        size={270}
      />
      <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
        🍾 Spinning...
      </Text>
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ choice }),
      });
    } catch {
      // WS will handle phase update; if it fails server timer covers it
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 28 }}>
        {/* Turn player banner */}
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
              <Text style={{ color: turnPlayer.color, fontSize: 26, fontFamily: 'Syne_900Black' }}>
                {turnPlayer.username[0]?.toUpperCase()}
              </Text>
            </View>
            <Text style={{ color: turnPlayer.color, fontSize: 20, fontFamily: 'Syne_900Black' }}>
              {isMyTurn ? 'Your turn!' : `${turnPlayer.username}'s turn`}
            </Text>
          </View>
        )}

        {isMyTurn ? (
          <>
            <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
              Pick your poison
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, width: '100%' }}>
              {/* Truth */}
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
                    <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Syne_900Black' }}>Truth</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter_400Regular' }}>+10 pts</Text>
                  </LinearGradient>
                </Animated.View>
              </Pressable>

              {/* Dare */}
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
                    <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Syne_900Black' }}>Dare</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter_400Regular' }}>+20 pts</Text>
                  </LinearGradient>
                </Animated.View>
              </Pressable>
            </View>

            {/* Timer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                Time left:
              </Text>
              <Text style={{ color: Colors.yellow, fontSize: 14, fontFamily: 'Inter_700Bold' }}>
                {formatted}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={turnPlayer?.color ?? Colors.blue} />
            <Text style={{ color: Colors.text.secondary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
              {turnPlayer?.username ?? 'Player'} is choosing...
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
              {formatted}
            </Text>
          </View>
        )}
      </View>
    </View>
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
  dareResult,
  punishmentResult,
  identityReveal,
  punishmentOptions,
  onDismissPunishment,
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
  dareResult: { passed: boolean; yesVotes: number; totalVotes: number } | null;
  punishmentResult: { result: 'ban' | 'reveal'; targetId: string } | null;
  identityReveal: { playerId: string; realName: string; phoneLast4: string } | null;
  punishmentOptions: { a: string; b: string } | null;
  onDismissPunishment: () => void;
}) {
  const showStrip = phase !== 'reaction' && phase !== 'dare_vote' && phase !== 'punishment_vote' && phase !== 'identity_reveal';

  return (
    <View style={{ flex: 1 }}>
      <ConnectionBanner visible={isReconnecting} />

      {punishmentResult && (
        <PunishmentBanner
          result={punishmentResult}
          players={players}
          onDismiss={onDismissPunishment}
        />
      )}

      {phase === 'spinning' ? (
        <SpinPhaseView
          players={players}
          myPlayer={myPlayer}
          currentTurnPlayerId={currentTurnPlayerId}
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
          currentTurnPlayerId={currentTurnPlayerId}
          content={currentContent}
          phaseEndsAt={phaseEndsAt}
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
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
          <Text style={{ fontSize: 40 }}>⏳</Text>
          <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Syne_800ExtraBold', textAlign: 'center' }}>
            {phase.replace(/_/g, ' ')}
          </Text>
        </View>
      )}

      {showStrip && <PlayerStrip players={players} currentTurnPlayerId={currentTurnPlayerId} />}
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
          style={{ color: Colors.text.primary, fontSize: 32, fontFamily: 'Syne_900Black' }}
        >
          Game Over!
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
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
                      fontFamily: 'Syne_800ExtraBold',
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
                    fontFamily: 'Syne_800ExtraBold',
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
                    fontFamily: 'Inter_700Bold',
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
              fontFamily: 'Syne_800ExtraBold',
              textAlign: 'center',
            }}
          >
            💀 Identity Revealed
          </Text>
          <Text
            style={{
              color: Colors.text.secondary,
              fontSize: 13,
              fontFamily: 'Inter_400Regular',
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
              style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Syne_900Black' }}
            >
              {lastPlaceReveal.name}
            </Text>
            <Text
              style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}
            >
              ···· ···· ···· {lastPlaceReveal.phoneLast4}
            </Text>
          </View>
        </View>
      )}

      {/* Share button */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const medals = ['🥇', '🥈', '🥉'];
          const lines = sorted.map((p, i) =>
            `${i < 3 ? medals[i] : `${i + 1}.`} ${p.username} — ${p.points}pt`
          );
          const reveal = lastPlaceReveal
            ? `\n💀 Last place revealed: ${lastPlaceReveal.name} (···${lastPlaceReveal.phoneLast4})`
            : '';
          Share.share({
            message: `🍾 ClassChaos Results\n\n${lines.join('\n')}${reveal}\n\nPlay now: classchaos.app`,
          });
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
          <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Syne_800ExtraBold' }}>
            📤 Share Results
          </Text>
        </LinearGradient>
      </Pressable>

      {/* Leave */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
            style={{ color: Colors.text.secondary, fontSize: 15, fontFamily: 'Syne_800ExtraBold' }}
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

  const room = store.room ? mapApiRoom(store.room as unknown as Record<string, unknown>) : null;
  const isHost = !!(user?.id && room?.hostId && user.id === room.hostId);

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
          if (d.room) store.setRoom(d.room as never);
          if (d.players)
            store.setPlayers(
              (d.players as Record<string, unknown>[]).map(mapAnyPlayer)
            );
          const round = d.round as Record<string, unknown> | null | undefined;
          if (round) {
            store.setPhase(
              round.phase as string,
              round.phase_ends_at as string | undefined
            );
            store.setCurrentTurn(round.player_id as string);
            store.setCurrentRoundId(round.id as string);
            if (round.content) store.setCurrentContent(round.content as never);
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
          store.setPhase('spinning');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
          store.setPhase(d.phase as string, d.phase_ends_at as string | undefined);
          break;

        case 'phase_change':
          store.setPhase(d.phase as string, (d.ends_at ?? d.phase_ends_at) as string | undefined);
          if (d.phase === 'spinning') {
            setDareResult(null);
            setIdentityReveal(null);
            setPunishmentResult(null);
          }
          if (d.phase === 'punishment_vote' && d.options) {
            const opts = d.options as Record<string, string>;
            setPunishmentOptions({ a: opts.a ?? 'Option A', b: opts.b ?? 'Option B' });
          }
          break;

        case 'content_shown':
          store.setCurrentContent(d.content as never);
          store.setPhase(d.phase as string, d.phase_ends_at as string | undefined);
          break;

        case 'answer_submitted':
          store.setCurrentAnswer(d.answer as string);
          break;

        case 'vote_update':
          store.setVotes(d.votes as never[]);
          break;

        case 'reaction':
          store.addReaction(d as never);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        }

        case 'dare_result':
          setDareResult({
            passed: d.passed as boolean,
            yesVotes: (d.yes_votes ?? d.yesVotes) as number,
            totalVotes: (d.total_votes ?? d.totalVotes) as number,
          });
          Haptics.notificationAsync(
            (d.passed as boolean)
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Error
          );
          break;

        case 'punishment_vote_result':
          setPunishmentResult({
            result: d.result as 'ban' | 'reveal',
            targetId: ((d.target_player_id ?? d.targetId) as string) ?? '',
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    store.clearGame();
    router.push('/(tabs)/home');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const statusLabel =
    room?.status === 'waiting'
      ? `${store.players.length} player${store.players.length !== 1 ? 's' : ''} waiting`
      : room?.status === 'active'
      ? 'In progress'
      : 'Ended';

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
            style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Syne_800ExtraBold' }}
          >
            Room · {code}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            {statusLabel}
          </Text>
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
          <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
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
              fontFamily: 'Syne_800ExtraBold',
              textAlign: 'center',
            }}
          >
            {fetchError}
          </Text>
          <Pressable onPress={handleLeave}>
            <Text
              style={{ color: Colors.blue, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}
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
          dareResult={dareResult}
          punishmentResult={punishmentResult}
          identityReveal={identityReveal}
          punishmentOptions={punishmentOptions}
          onDismissPunishment={() => setPunishmentResult(null)}
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
