import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { Colors, BorderRadius, SpringConfig } from '@/constants/theme';
import { useGameTimer } from '@/hooks/useGameTimer';
import type { AnonPlayer, TruthOrDare, Reaction, Comment } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TimerPill({ endsAt, warnAt = 15 }: { endsAt: string | null; warnAt?: number }) {
  const { secondsLeft, formatted } = useGameTimer(endsAt);
  const urgent = secondsLeft <= warnAt && secondsLeft > 0;
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
          fontFamily: 'Inter_700Bold',
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
          fontFamily: 'Syne_900Black',
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
          <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>
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
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
            +{content.points}pt
          </Text>
        </View>
      </View>
      <Text
        style={{
          color: Colors.text.primary,
          fontSize: 20,
          fontFamily: 'Syne_800ExtraBold',
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
          <Text style={{ color: turnPlayer.color, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}>
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
        <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
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
                style={{ color: turnPlayer.color, fontSize: 15, fontFamily: 'Syne_800ExtraBold' }}
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
            <Text style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
              Your answer
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: answer.length > MAX * 0.85 ? Colors.red : Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
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
              fontFamily: 'Inter_400Regular',
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
                  fontFamily: 'Syne_800ExtraBold',
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
          <Text style={{ color: Colors.red, fontSize: 14, fontFamily: 'Syne_800ExtraBold' }}>
            {skipping ? 'Skipping...' : '💨 Skip (costs a life)'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
}) {
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Aggregate emoji counts
  const emojiCounts = EMOJIS.reduce<Record<string, number>>((acc, e) => {
    acc[e] = reactions.filter((r) => r.emoji === e).length;
    return acc;
  }, {});

  const sendReaction = useCallback(async (emoji: string) => {
    if (!currentRoundId || !token || myReaction === emoji) return;
    setMyReaction(emoji);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await fetch(`${API_URL}/game/rounds/${currentRoundId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      });
    } catch { /* WS will reflect */ }
  }, [currentRoundId, token, myReaction]);

  const sendComment = useCallback(async () => {
    const trimmed = commentText.trim();
    if (!trimmed || !currentRoundId || !token || sending) return;
    setSending(true);
    setCommentText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  const isTruth = content?.type === 'truth';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <View style={{ flex: 1 }}>
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
              <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_500Medium' }}>
                {isTruth ? '🎯 Truth' : '🔥 Dare'}
              </Text>
              <Text style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Syne_800ExtraBold', lineHeight: 22 }}>
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
                  <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 4 }}>
                    Answer
                  </Text>
                  <Text style={{ color: Colors.text.primary, fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
                    {currentAnswer}
                  </Text>
                </View>
              )}
            </LinearGradient>
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
                    <Text style={{ color: c.color, fontSize: 11, fontFamily: 'Syne_800ExtraBold' }}>
                      {c.username[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ gap: 3, maxWidth: '90%' }}>
                  {!isMe && (
                    <Text style={{ color: c.color, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
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
                    <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
                      {c.text}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}

          {comments.length === 0 && (
            <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8 }}>
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
                const selected = myReaction === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => sendReaction(emoji)}
                    style={{
                      alignItems: 'center',
                      gap: 1,
                      backgroundColor: selected
                        ? 'rgba(59,130,246,0.15)'
                        : 'rgba(255,255,255,0.05)',
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderWidth: 1,
                      borderColor: selected ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.07)',
                      minWidth: 36,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    {count > 0 && (
                      <Text style={{ color: Colors.text.muted, fontSize: 9, fontFamily: 'Inter_700Bold' }}>
                        {count}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

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
                fontFamily: 'Inter_400Regular',
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
