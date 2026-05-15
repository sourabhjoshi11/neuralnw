import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Haptics } from '@/utils/compat';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useGameTimer } from '@/hooks/useGameTimer';
import type { AnonPlayer, TruthOrDare, Reaction, Comment } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TimerPill({ endsAt, warnAt = 15 }: { endsAt: string | null; warnAt?: number }) {
  const { secondsLeft, formatted } = useGameTimer(endsAt);
  const urgent = secondsLeft <= warnAt && secondsLeft > 0;
  const prevSeconds = useRef(secondsLeft);

  // Haptic beep on each second tick when ≤5s left
  useEffect(() => {
    if (
      secondsLeft > 0 &&
      secondsLeft <= 5 &&
      secondsLeft !== prevSeconds.current
    ) {
      secondsLeft <= 2 ? Haptics.heavy() : Haptics.medium();
    }
    prevSeconds.current = secondsLeft;
  }, [secondsLeft]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: urgent ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: urgent ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: urgent ? Colors.red : Colors.green,
        }}
      />
      <Text
        style={{
          color: urgent ? Colors.red : Colors.text.secondary,
          fontSize: 13,
          fontFamily: 'Poppins_700Bold',
        }}
      >
        {formatted}
      </Text>
    </View>
  );
}

function PlayerAvatar({
  player,
  size = 52,
}: {
  player: AnonPlayer;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: player.color + '22',
        borderWidth: 2.5,
        borderColor: player.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: player.color,
          fontSize: size * 0.38,
          fontFamily: 'Poppins_700Bold',
        }}
      >
        {player.username[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

function ContentCard({ content }: { content: TruthOrDare }) {
  const isTruth = content.type === 'truth';
  return (
    <LinearGradient
      colors={
        isTruth
          ? ['rgba(59,130,246,0.14)', 'rgba(59,130,246,0.06)']
          : ['rgba(139,92,246,0.14)', 'rgba(139,92,246,0.06)']
      }
      style={{
        borderRadius: BorderRadius.card,
        borderWidth: 1,
        borderColor: isTruth ? 'rgba(59,130,246,0.25)' : 'rgba(139,92,246,0.25)',
        padding: 20,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            backgroundColor: isTruth ? Colors.blue : Colors.purple,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Poppins_700Bold', letterSpacing: 1 }}>
            {isTruth ? 'TRUTH' : 'DARE'}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>
            +{content.points}pt
          </Text>
        </View>
      </View>
      <Text
        style={{
          color: Colors.text.primary,
          fontSize: 20,
          fontFamily: 'Poppins_700Bold',
          lineHeight: 28,
        }}
      >
        {content.content}
      </Text>
    </LinearGradient>
  );
}

// ─── TruthQuestionView ────────────────────────────────────────────────────────

export function TruthQuestionView({
  players,
  currentTurnPlayerId,
  content,
  phaseEndsAt,
}: {
  players: AnonPlayer[];
  currentTurnPlayerId: string | null;
  content: TruthOrDare | null;
  phaseEndsAt: string | null;
}) {
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ flex: 1, padding: 20, gap: 20, justifyContent: 'center' }}
    >
      {turnPlayer && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <PlayerAvatar player={turnPlayer} size={56} />
          <Text style={{ color: turnPlayer.color, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
            {turnPlayer.username} chose Truth
          </Text>
        </View>
      )}

      {content ? (
        <ContentCard content={content} />
      ) : (
        <ActivityIndicator color={Colors.blue} />
      )}

      <View style={{ alignItems: 'center', gap: 10 }}>
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
          Read the question carefully...
        </Text>
        <TimerPill endsAt={phaseEndsAt} warnAt={2} />
      </View>
    </Animated.View>
  );
}

// ─── TruthAnswerView ──────────────────────────────────────────────────────────

export function TruthAnswerView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  content,
  phaseEndsAt,
  token,
  roomCode,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  content: TruthOrDare | null;
  phaseEndsAt: string | null;
  token: string | null;
  roomCode: string;
}) {
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const MAX = 500;

  const submitAnswer = async () => {
    const trimmed = answer.trim();
    if (!trimmed || !currentRoundId || !token || submitting) return;
    setSubmitting(true);
    Haptics.medium();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answer: trimmed }),
      });
    } catch {
      // server timer handles timeout
    } finally {
      setSubmitting(false);
    }
  };

  const skipTurn = async () => {
    if (!token || skipping) return;
    setSkipping(true);
    Haptics.error();
    try {
      const res = await fetch(`${API_URL}/game/rooms/${roomCode}/skip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>;
        // silently ignore — WS will update state
      }
    } catch {
      // ignore
    } finally {
      setSkipping(false);
    }
  };

  if (!isMyTurn) {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={{ flex: 1, padding: 20, gap: 20, justifyContent: 'center' }}
      >
        {content && <ContentCard content={content} />}

        <View style={{ alignItems: 'center', gap: 14 }}>
          {turnPlayer && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PlayerAvatar player={turnPlayer} size={40} />
              <Text
                style={{ color: turnPlayer.color, fontSize: 15, fontFamily: 'Poppins_700Bold' }}
              >
                {turnPlayer.username} is answering...
              </Text>
            </View>
          )}
          <ActivityIndicator color={Colors.blue} />
          <TimerPill endsAt={phaseEndsAt} />
        </View>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {content && <ContentCard content={content} />}

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_600SemiBold' }}>
              Your answer
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: answer.length > MAX * 0.85 ? Colors.red : Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
                {answer.length}/{MAX}
              </Text>
              <TimerPill endsAt={phaseEndsAt} />
            </View>
          </View>

          <TextInput
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: BorderRadius.input,
              borderWidth: 1,
              borderColor: answer ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.08)',
              color: Colors.text.primary,
              fontSize: 16,
              fontFamily: 'Poppins_400Regular',
              paddingHorizontal: 16,
              paddingVertical: 14,
              minHeight: 120,
              textAlignVertical: 'top',
            }}
            multiline
            maxLength={MAX}
            placeholder="Type your honest answer..."
            placeholderTextColor={Colors.text.muted}
            value={answer}
            onChangeText={setAnswer}
            autoFocus
          />
        </View>

        <Pressable
          onPress={submitAnswer}
          onPressIn={() => { btnScale.value = withSpring(0.96, SpringConfig.snappy); }}
          onPressOut={() => { btnScale.value = withSpring(1, SpringConfig.default); }}
          disabled={!answer.trim() || submitting}
        >
          <Animated.View style={btnStyle}>
            <LinearGradient
              colors={answer.trim() ? ['#3b82f6', '#06b6d4'] : ['#1a2235', '#1a2235']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 15,
                borderRadius: BorderRadius.btn,
                alignItems: 'center',
                shadowColor: '#3b82f6',
                shadowOpacity: answer.trim() ? 0.4 : 0,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 4 },
                elevation: answer.trim() ? 8 : 0,
              }}
            >
              <Text
                style={{
                  color: answer.trim() ? '#fff' : Colors.text.muted,
                  fontSize: 16,
                  fontFamily: 'Poppins_700Bold',
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Answer ✓'}
              </Text>
            </LinearGradient>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={skipTurn}
          disabled={skipping}
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            borderRadius: BorderRadius.btn,
            borderWidth: 1,
            borderColor: 'rgba(239,68,68,0.18)',
            paddingVertical: 13,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: Colors.red, fontSize: 14, fontFamily: 'Poppins_700Bold' }}>
            {skipping ? 'Skipping...' : '💨 Skip (costs a life)'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── FloatingEmoji ────────────────────────────────────────────────────────────

function FloatingEmoji({
  emoji,
  startX,
  onDone,
}: {
  emoji: string;
  startX: number;
  onDone: () => void;
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.4);

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 50;
    const rise = 220 + Math.random() * 80;

    // Pop in
    scale.value = withSequence(
      withSpring(1.3, { damping: 7, stiffness: 350 }),
      withTiming(1.0, { duration: 150 }),
    );
    opacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(1, { duration: 1200 }),
      withTiming(0, { duration: 600 }),
    );
    translateY.value = withTiming(-rise, {
      duration: 1900,
      easing: Easing.out(Easing.quad),
    });
    translateX.value = withTiming(drift, { duration: 1900 });

    const t = setTimeout(onDone, 1950);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        {
          position: 'absolute',
          bottom: 90,
          left: startX,
          fontSize: 34,
          zIndex: 999,
        },
        style,
      ]}
      pointerEvents="none"
    >
      {emoji}
    </Animated.Text>
  );
}

// ─── ReactionView ─────────────────────────────────────────────────────────────


const EMOJIS = ['😂', '😱', '🔥', '❤️', '💀'] as const;

export function ReactionView({
  players,
  myPlayer,
  currentRoundId,
  content,
  currentAnswer,
  reactions,
  comments,
  phaseEndsAt,
  token,
  dareResult,
  readyVotes,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentRoundId: string | null;
  content: TruthOrDare | null;
  currentAnswer: string | null;
  reactions: Reaction[];
  comments: Comment[];
  phaseEndsAt: string | null;
  token: string | null;
  dareResult?: { passed: boolean; yesVotes: number; totalVotes: number } | null;
  readyVotes?: { count: number; total: number; threshold: number };
}) {
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [iAmReady, setIAmReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Floating emoji state — YouTube-style (local + remote)
  const [floaters, setFloaters] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const seenReactionIds = useRef<Set<string>>(new Set());
  // Per-emoji cooldown timestamps (800ms) to prevent backend spam
  const emojiCooldowns = useRef<Map<string, number>>(new Map());

  // Spawn floaters for incoming WS reactions (other players)
  useEffect(() => {
    const newOnes = reactions.filter((r) => !seenReactionIds.current.has(r.id));
    newOnes.forEach((r) => seenReactionIds.current.add(r.id));
    if (newOnes.length === 0) return;
    setFloaters((prev) => [
      ...prev,
      ...newOnes.map((r) => ({
        id: r.id + '_' + Date.now() + Math.random(),
        emoji: r.emoji,
        x: 220 + Math.random() * 100,
      })),
    ]);
  }, [reactions]);

  // Aggregate emoji counts
  const emojiCounts = EMOJIS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = reactions.filter((r) => r.emoji === e).length;
    return acc;
  }, {});

  const sendReaction = useCallback((emoji: string) => {
    if (!currentRoundId || !token) return;

    // Spawn local floater immediately (no wait for WS echo)
    setFloaters((prev) => [
      ...prev,
      { id: `local_${Date.now()}_${Math.random()}`, emoji, x: 220 + Math.random() * 100 },
    ]);
    Haptics.light();

    // Cooldown: only send to backend once per 800ms per emoji
    const now = Date.now();
    const last = emojiCooldowns.current.get(emoji) ?? 0;
    if (now - last < 800) return;
    emojiCooldowns.current.set(emoji, now);

    fetch(`${API_URL}/game/rounds/${currentRoundId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    }).catch(() => { /* silent */ });
  }, [currentRoundId, token]);

  const sendComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !currentRoundId || !token || sending) return;
    setSending(true);
    setCommentText('');
    Haptics.medium();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: trimmed }),
      });
    } catch { /* ignore */ } finally {
      setSending(false);
    }
  }, [commentText, currentRoundId, token, sending]);

  const sendReady = useCallback(async () => {
    if (!currentRoundId || !token || iAmReady) return;
    setIAmReady(true);
    Haptics.success();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/ready`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* WS will update state */ }
  }, [currentRoundId, token, iAmReady]);

  const isTruth = content?.type === 'truth';
  const readyCount = readyVotes?.count ?? 0;
  const readyThreshold = readyVotes?.threshold ?? 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={{ flex: 1 }}>
        {/* Floating emoji reactions — YouTube style */}
        {floaters.map((f) => (
          <FloatingEmoji
            key={f.id}
            emoji={f.emoji}
            startX={f.x}
            onDone={() =>
              setFloaters((prev) => prev.filter((p) => p.id !== f.id))
            }
          />
        ))}

        {/* Scrollable content area */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {/* Content card (question + answer) */}
          {content && (
            <LinearGradient
              colors={
                isTruth
                  ? ['rgba(59,130,246,0.12)', 'rgba(59,130,246,0.05)']
                  : ['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.05)']
              }
              style={{
                borderRadius: BorderRadius.card,
                borderWidth: 1,
                borderColor: isTruth ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)',
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
                {isTruth ? '🎯 Truth' : '🔥 Dare'}
              </Text>
              <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold', lineHeight: 22 }}>
                {content.content}
              </Text>
              {currentAnswer && (
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    padding: 12,
                    borderLeftWidth: 3,
                    borderLeftColor: Colors.blue,
                  }}
                >
                  <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_500Medium', marginBottom: 4 }}>
                    Answer
                  </Text>
                  <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_400Regular', lineHeight: 22 }}>
                    {currentAnswer}
                  </Text>
                </View>
              )}
            </LinearGradient>
          )}

          {/* Dare result banner */}
          {!isTruth && dareResult && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={{
                borderRadius: BorderRadius.card,
                borderWidth: 1,
                borderColor: dareResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                backgroundColor: dareResult.passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                padding: 14,
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 28 }}>{dareResult.passed ? '✅' : '❌'}</Text>
              <Text style={{ color: dareResult.passed ? Colors.green : Colors.red, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>
                {dareResult.passed ? 'Dare Completed!' : 'Dare Failed'}
              </Text>
              <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
                {dareResult.yesVotes}/{dareResult.totalVotes} voted yes
              </Text>
            </Animated.View>
          )}

          {/* Comments */}
          {comments.map((c) => {
            const isMe = c.playerId === myPlayer?.id;
            return (
              <Animated.View
                key={c.id}
                entering={FadeIn.duration(200)}
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                }}
              >
                {!isMe && (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: c.color + '22',
                      borderWidth: 1.5,
                      borderColor: c.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    <Text style={{ color: c.color, fontSize: 11, fontFamily: 'Poppins_700Bold' }}>
                      {c.username[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ gap: 3, maxWidth: '90%' }}>
                  {!isMe && (
                    <Text style={{ color: c.color, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>
                      {c.username}
                    </Text>
                  )}
                  <View
                    style={{
                      backgroundColor: isMe ? 'rgba(59,130,246,0.15)' : Colors.bg.card,
                      borderRadius: 14,
                      borderTopLeftRadius: !isMe ? 4 : 14,
                      borderTopRightRadius: isMe ? 4 : 14,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: isMe ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
                      {c.text}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}

          {comments.length === 0 && (
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 }}>
              Be first to react 👇
            </Text>
          )}
        </ScrollView>

        {/* Bottom bar: emoji + comment input */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.06)',
            backgroundColor: Colors.bg.primary,
            gap: 10,
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          {/* Timer + Emoji row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TimerPill endsAt={phaseEndsAt} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {EMOJIS.map((emoji) => {
                const count = emojiCounts[emoji] ?? 0;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => sendReaction(emoji)}
                    style={{
                      alignItems: 'center',
                      gap: 1,
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.07)',
                      minWidth: 36,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    {count > 0 && (
                      <Text style={{ color: Colors.text.muted, fontSize: 9, fontFamily: 'Poppins_700Bold' }}>
                        {count}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Next Turn vote button */}
          <Pressable
            onPress={sendReady}
            disabled={iAmReady}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: iAmReady ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
              borderRadius: 12,
              paddingVertical: 10,
              borderWidth: 1,
              borderColor: iAmReady ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
            }}
          >
            <Text style={{ fontSize: 16 }}>{iAmReady ? '✅' : '⏭️'}</Text>
            <Text
              style={{
                color: iAmReady ? '#22c55e' : Colors.text.secondary,
                fontSize: 13,
                fontFamily: 'Poppins_700Bold',
              }}
            >
              {iAmReady ? 'Voted Next' : 'Next Turn'}
            </Text>
            {readyCount > 0 && (
              <View
                style={{
                  backgroundColor: 'rgba(34,197,94,0.15)',
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ color: '#22c55e', fontSize: 11, fontFamily: 'Poppins_700Bold' }}>
                  {readyCount}/{readyThreshold}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Comment input */}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: Colors.bg.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: commentText ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)',
                color: Colors.text.primary,
                fontSize: 14,
                fontFamily: 'Poppins_400Regular',
                paddingHorizontal: 16,
                paddingVertical: 10,
                maxHeight: 80,
              }}
              placeholder="Say something..."
              placeholderTextColor={Colors.text.muted}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={280}
              onSubmitEditing={sendComment}
              returnKeyType="send"
              blurOnSubmit
            />
            <Pressable
              onPress={sendComment}
              disabled={!commentText.trim() || sending}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: commentText.trim() ? Colors.blue : Colors.bg.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16 }}>↑</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── DareShowView ─────────────────────────────────────────────────────────────

export function DareShowView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  content,
  phaseEndsAt,
  token,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  content: TruthOrDare | null;
  phaseEndsAt: string | null;
  token: string | null;
}) {
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const isMyTurn = myPlayer?.id === currentTurnPlayerId;
  const { secondsLeft } = useGameTimer(phaseEndsAt);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleDareDone = async () => {
    if (!currentRoundId || !token || submitting || done) return;
    setSubmitting(true);
    Haptics.success();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/dare_done`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDone(true);
    } catch { /* WS phase_change will handle transition */ } finally {
      setSubmitting(false);
    }
  };

  // Urgency ring color based on time left
  const urgent = secondsLeft <= 20 && secondsLeft > 0;
  const ringColor = urgent ? Colors.red : '#8b5cf6';

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 22, alignItems: 'center', paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header — who's doing the dare */}
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
        <Text style={{ fontSize: 40 }}>{isMyTurn ? '😤' : '👀'}</Text>
        <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
          {isMyTurn ? 'Your Dare!' : `${turnPlayer?.username ?? '?'}'s Dare`}
        </Text>
        {!isMyTurn && turnPlayer && (
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            Watch and judge 👇
          </Text>
        )}
      </View>

      {/* Dare card */}
      {content && (
        <Animated.View entering={FadeIn.duration(400)} style={{ width: '100%' }}>
          <LinearGradient
            colors={['rgba(139,92,246,0.18)', 'rgba(139,92,246,0.06)']}
            style={{
              borderRadius: BorderRadius.card,
              borderWidth: isMyTurn ? 2 : 1,
              borderColor: isMyTurn ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.3)',
              padding: 22,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#a78bfa', fontSize: 11, fontFamily: 'Poppins_700Bold', letterSpacing: 1.5 }}>
                🔥 DARE
              </Text>
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
                +{content.points} pts
              </Text>
            </View>
            <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', lineHeight: 28 }}>
              {content.content}
            </Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Countdown ring + label */}
      <View style={{ alignItems: 'center', gap: 12 }}>
        {/* Big countdown number */}
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            borderWidth: 3,
            borderColor: ringColor + '88',
            backgroundColor: ringColor + '12',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{
            color: urgent ? Colors.red : '#a78bfa',
            fontSize: 32,
            fontFamily: 'Poppins_700Bold',
          }}>
            {secondsLeft > 0 ? secondsLeft : '⚡'}
          </Text>
        </View>

        <Text style={{
          color: urgent ? Colors.red : Colors.text.muted,
          fontSize: 13,
          fontFamily: urgent ? 'Poppins_700Bold' : 'Poppins_400Regular',
          textAlign: 'center',
        }}>
          {isMyTurn
            ? urgent
              ? '⚠️ Time almost up — finish the dare!'
              : 'Complete the dare before time runs out'
            : urgent
              ? '⚠️ Voting starts very soon!'
              : 'After time ends, voting begins'}
        </Text>
      </View>

      {/* "You're being watched" note for dare player */}
      {isMyTurn && (
        <View style={{
          backgroundColor: 'rgba(139,92,246,0.08)',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(139,92,246,0.2)',
          paddingHorizontal: 16,
          paddingVertical: 10,
          width: '100%',
        }}>
          <Text style={{ color: '#a78bfa', fontSize: 12, fontFamily: 'Poppins_500Medium', textAlign: 'center' }}>
            👁️ Everyone is watching — do it properly!
          </Text>
        </View>
      )}

      {/* Done button — only dare player sees this */}
      {isMyTurn && (
        <Pressable
          onPress={handleDareDone}
          disabled={submitting || done}
          style={{ width: '100%' }}
        >
          <LinearGradient
            colors={done ? ['#16a34a', '#15803d'] : ['#8b5cf6', '#7c3aed']}
            style={{
              borderRadius: BorderRadius.btn,
              paddingVertical: 18,
              alignItems: 'center',
              gap: 6,
              shadowColor: done ? '#16a34a' : '#8b5cf6',
              shadowOpacity: 0.5,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 4 },
              elevation: 10,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 17, fontFamily: 'Poppins_700Bold' }}>
              {done ? '✅ Done! Voting starting...' : submitting ? 'Starting vote...' : '✅ I Did It! Start Voting'}
            </Text>
            {!done && (
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
                Tap when you've completed the dare
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      )}
    </ScrollView>
  );
}

// ─── DareVoteView ─────────────────────────────────────────────────────────────

export function DareVoteView({
  players,
  myPlayer,
  currentTurnPlayerId,
  currentRoundId,
  content,
  phaseEndsAt,
  token,
  votes,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  currentRoundId: string | null;
  content: TruthOrDare | null;
  phaseEndsAt: string | null;
  token: string | null;
  votes: import('@/types').Vote[];
}) {
  const [myVote, setMyVote] = useState<'yes' | 'no' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isTarget = myPlayer?.id === currentTurnPlayerId;
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);

  const yesCount = votes.filter((v) => v.value === 'yes').length;
  const noCount = votes.filter((v) => v.value === 'no').length;
  const totalVoters = players.filter((p) => p.id !== currentTurnPlayerId).length;
  const totalVoted = votes.length;
  const yesRatio = totalVoters > 0 ? yesCount / totalVoters : 0;

  const castVote = useCallback(async (value: 'yes' | 'no') => {
    if (!currentRoundId || !token || myVote || submitting || isTarget) return;
    setMyVote(value);
    setSubmitting(true);
    Haptics.medium();
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value }),
      });
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  }, [currentRoundId, token, myVote, submitting, isTarget]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>
            Did they do it?
          </Text>
          {turnPlayer && (
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
              Judge{' '}
              <Text style={{ color: turnPlayer.color, fontFamily: 'Poppins_600SemiBold' }}>
                {turnPlayer.username}
              </Text>
            </Text>
          )}
        </View>
        <TimerPill endsAt={phaseEndsAt} />
      </View>

      {content && (
        <LinearGradient
          colors={['rgba(139,92,246,0.12)', 'rgba(139,92,246,0.05)']}
          style={{
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(139,92,246,0.2)',
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={{ color: 'rgba(139,92,246,0.8)', fontSize: 11, fontFamily: 'Poppins_700Bold', letterSpacing: 1 }}>
            DARE
          </Text>
          <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold', lineHeight: 22 }}>
            {content.content}
          </Text>
        </LinearGradient>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
            {totalVoted}/{totalVoters} voted
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
            YES {yesCount} · NO {noCount}
          </Text>
        </View>
        <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <View
            style={{
              height: '100%',
              width: `${yesRatio * 100}%`,
              backgroundColor: Colors.green,
              borderRadius: 4,
            }}
          />
        </View>
      </View>

      {isTarget ? (
        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            padding: 20,
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ fontSize: 28 }}>👀</Text>
          <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
            Class is judging you...
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
            Did you complete the dare?
          </Text>
        </View>
      ) : myVote ? (
        <View
          style={{
            backgroundColor: myVote === 'yes' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            borderRadius: BorderRadius.card,
            padding: 18,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: myVote === 'yes' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
          }}
        >
          <Text style={{ color: myVote === 'yes' ? Colors.green : Colors.red, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
            {myVote === 'yes' ? '✅ Voted YES' : '❌ Voted NO'}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>
            Waiting for others...
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable onPress={() => castVote('yes')} disabled={submitting} style={{ flex: 1 }}>
            <LinearGradient
              colors={['rgba(34,197,94,0.2)', 'rgba(34,197,94,0.08)']}
              style={{
                borderRadius: BorderRadius.btn,
                borderWidth: 1.5,
                borderColor: 'rgba(34,197,94,0.35)',
                paddingVertical: 18,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 28 }}>🔥</Text>
              <Text style={{ color: Colors.green, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>YES</Text>
              <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>They did it</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => castVote('no')} disabled={submitting} style={{ flex: 1 }}>
            <LinearGradient
              colors={['rgba(239,68,68,0.2)', 'rgba(239,68,68,0.08)']}
              style={{
                borderRadius: BorderRadius.btn,
                borderWidth: 1.5,
                borderColor: 'rgba(239,68,68,0.35)',
                paddingVertical: 18,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 28 }}>💀</Text>
              <Text style={{ color: Colors.red, fontSize: 16, fontFamily: 'Poppins_700Bold' }}>NO</Text>
              <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>They chickened</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── PunishmentVoteView ───────────────────────────────────────────────────────

export function PunishmentVoteView({
  players,
  myPlayer,
  currentTurnPlayerId,
  phaseEndsAt,
  votes,
  optionA = 'Permanent ban',
  optionB = 'Identity reveal',
  token,
  roomCode,
}: {
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  currentTurnPlayerId: string | null;
  phaseEndsAt: string | null;
  votes: import('@/types').Vote[];
  optionA?: string;
  optionB?: string;
  token: string | null;
  roomCode: string;
}) {
  const [myVote, setMyVote] = useState<'a' | 'b' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const isTarget = myPlayer?.id === currentTurnPlayerId;

  const aCount = votes.filter((v) => v.value === 'a').length;
  const bCount = votes.filter((v) => v.value === 'b').length;
  const total = votes.length;

  const castVote = async (opt: 'a' | 'b') => {
    if (!token || myVote || submitting || isTarget) return;
    setMyVote(opt);
    setSubmitting(true);
    Haptics.medium();
    try {
      await fetch(`${API_URL}/game/rooms/${roomCode}/punishment_vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: opt }),
      });
    } catch { /* WS vote_update will reflect */ } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 36 }}>⚡</Text>
        <Text style={{ color: Colors.text.primary, fontSize: 22, fontFamily: 'Poppins_700Bold' }}>
          Punishment Vote
        </Text>
        {turnPlayer && (
          <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
            Choose{' '}
            <Text style={{ color: turnPlayer.color, fontFamily: 'Poppins_600SemiBold' }}>
              {turnPlayer.username}
            </Text>
            {"'s"} punishment
          </Text>
        )}
        <TimerPill endsAt={phaseEndsAt} />
      </View>

      {total > 0 && (
        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            padding: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            gap: 8,
          }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_500Medium', textAlign: 'center' }}>
            {total} vote{total !== 1 ? 's' : ''} cast
          </Text>
          <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', flexDirection: 'row' }}>
            <View style={{ flex: aCount + 0.001, backgroundColor: Colors.red, borderRadius: 3 }} />
            <View style={{ flex: bCount + 0.001, backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 3 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.red, fontSize: 11, fontFamily: 'Poppins_700Bold' }}>🔨 Ban · {aCount}</Text>
            <Text style={{ color: Colors.yellow, fontSize: 11, fontFamily: 'Poppins_700Bold' }}>🎭 Reveal · {bCount}</Text>
          </View>
        </View>
      )}

      {isTarget ? (
        <View
          style={{
            backgroundColor: Colors.bg.card,
            borderRadius: BorderRadius.card,
            padding: 24,
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ fontSize: 32 }}>😬</Text>
          <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
            Class decides your fate...
          </Text>
        </View>
      ) : myVote ? (
        <View
          style={{
            backgroundColor: myVote === 'a' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
            borderRadius: BorderRadius.card,
            padding: 20,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: myVote === 'a' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
          }}
        >
          <Text style={{ color: myVote === 'a' ? Colors.red : Colors.yellow, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>
            {myVote === 'a' ? '🔨 Voted Ban' : '🎭 Voted Reveal'}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 4 }}>
            Waiting for result...
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            key="a"
            onPress={() => castVote('a')}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            <LinearGradient
              colors={['rgba(239,68,68,0.2)', 'rgba(239,68,68,0.06)']}
              style={{
                borderRadius: BorderRadius.btn,
                borderWidth: 1.5,
                borderColor: 'rgba(239,68,68,0.35)',
                paddingVertical: 24,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 28 }}>🔨</Text>
              <Text style={{ color: Colors.red, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>Ban</Text>
              <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 8 }}>
                {optionA}
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            key="b"
            onPress={() => castVote('b')}
            disabled={submitting}
            style={{ flex: 1 }}
          >
            <LinearGradient
              colors={['rgba(245,158,11,0.2)', 'rgba(245,158,11,0.06)']}
              style={{
                borderRadius: BorderRadius.btn,
                borderWidth: 1.5,
                borderColor: 'rgba(245,158,11,0.35)',
                paddingVertical: 24,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 28 }}>🎭</Text>
              <Text style={{ color: Colors.yellow, fontSize: 15, fontFamily: 'Poppins_700Bold' }}>Reveal</Text>
              <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingHorizontal: 8 }}>
                {optionB}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

// ─── IdentityRevealView ───────────────────────────────────────────────────────

export function IdentityRevealView({
  players,
  reveal,
  phaseEndsAt,
}: {
  players: AnonPlayer[];
  reveal: { playerId: string; realName: string; phoneLast4: string } | null;
  phaseEndsAt: string | null;
}) {
  const target = reveal ? players.find((p) => p.id === reveal.playerId) : null;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 }}>
      <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 52 }}>🎭</Text>
        <Text style={{ color: Colors.text.primary, fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
          Identity Revealed!
        </Text>
        {target && (
          <Text style={{ color: target.color, fontSize: 16, fontFamily: 'Poppins_600SemiBold' }}>
            {target.username}
          </Text>
        )}
      </Animated.View>

      {reveal ? (
        <Animated.View
          entering={FadeIn.duration(600).delay(300)}
          style={{
            width: '100%',
            borderRadius: BorderRadius.card,
            borderWidth: 1.5,
            borderColor: 'rgba(239,68,68,0.35)',
            backgroundColor: 'rgba(239,68,68,0.08)',
            padding: 24,
            gap: 16,
            alignItems: 'center',
          }}
        >
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_500Medium', letterSpacing: 1 }}>
              REAL NAME
            </Text>
            <Text style={{ color: Colors.text.primary, fontSize: 24, fontFamily: 'Poppins_700Bold' }}>
              {reveal.realName}
            </Text>
          </View>
          <View style={{ width: '100%', height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_500Medium', letterSpacing: 1 }}>
              PHONE
            </Text>
            <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold', letterSpacing: 4 }}>
              ···· ···· ···· {reveal.phoneLast4}
            </Text>
          </View>
        </Animated.View>
      ) : (
        <View
          style={{
            width: '100%',
            borderRadius: BorderRadius.card,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            backgroundColor: Colors.bg.card,
            padding: 24,
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ActivityIndicator color={Colors.red} />
          <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
            Revealing identity...
          </Text>
        </View>
      )}

      <TimerPill endsAt={phaseEndsAt} />
    </View>
  );
}

// ─── PunishmentBanner ─────────────────────────────────────────────────────────

export function PunishmentBanner({
  result,
  players,
  onDismiss,
}: {
  result: { result: 'ban' | 'reveal'; targetId: string };
  players: AnonPlayer[];
  onDismiss: () => void;
}) {
  const target = players.find((p) => p.id === result.targetId);
  const isBan = result.result === 'ban';

  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        margin: 12,
        borderRadius: BorderRadius.card,
        borderWidth: 1,
        borderColor: isBan ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)',
        backgroundColor: isBan ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 22 }}>{isBan ? '🔨' : '🎭'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isBan ? Colors.red : Colors.yellow, fontSize: 14, fontFamily: 'Poppins_700Bold' }}>
          {isBan ? 'Player Banned' : 'Identity Revealing...'}
        </Text>
        {target && (
          <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
            {target.username} {isBan ? 'has been removed' : "'s identity is revealed"}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
