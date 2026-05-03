import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { usePreventScreenCapture } from 'expo-screen-capture';
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { FeedPaywall } from '@/components/feed/FeedPaywall';
import type { FeedMessage } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.classchaos.app';

const SENDER_COLORS = [
  '#3b82f6', '#06b6d4', '#8b5cf6', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#a78bfa',
];

function colorForSender(senderId: string) {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function expiresIn(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 2) return null; // only warn when < 2h
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function mapMessage(m: Record<string, unknown>): FeedMessage {
  return {
    id: m.id as string,
    feedId: ((m.feed_id ?? m.feedId) as string) ?? '',
    senderId: ((m.sender_id ?? m.senderId) as string) ?? '',
    username: ((m.username) as string) ?? '',
    content: m.content as string,
    replyToId: ((m.reply_to_id ?? m.replyToId) as string | null) ?? null,
    reactions: ((m.reactions ?? {}) as Record<string, number>),
    createdAt: ((m.created_at ?? m.createdAt) as string) ?? '',
    expiresAt: ((m.expires_at ?? m.expiresAt) as string) ?? '',
  };
}

const REACT_EMOJIS = ['😂', '🔥', '💀', '❤️', '😱', '👀'];

// ─── TypingIndicator ─────────────────────────────────────────────────────────

function TypingDot({ delay }: { delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        false
      )
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.text.muted }, style]}
    />
  );
}

function TypingIndicator({ users }: { users: { id: string; username: string }[] }) {
  const label =
    users.length === 1
      ? `${users[0].username || 'Someone'} is typing`
      : `${users.length} people are typing`;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: Colors.bg.card,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </View>
      <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMe,
  replySource,
  onReply,
  onReact,
  reactingTo,
  onPickEmoji,
}: {
  message: FeedMessage;
  isMe: boolean;
  replySource: FeedMessage | undefined;
  onReply: (msg: FeedMessage) => void;
  onReact: (msgId: string, emoji: string) => void;
  reactingTo: string | null;
  onPickEmoji: (msgId: string) => void;
}) {
  const color = colorForSender(message.senderId);
  const displayName = message.username || `anon·${message.senderId.slice(-4)}`;
  const expiry = expiresIn(message.expiresAt);
  const hasReactions = Object.keys(message.reactions).some((k) => message.reactions[k] > 0);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        flexDirection: 'row',
        alignSelf: isMe ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        gap: 8,
        marginBottom: 2,
      }}
    >
      {!isMe && (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: color + '22',
            borderWidth: 1.5,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 4,
          }}
        >
          <Text style={{ color, fontSize: 12, fontFamily: 'Syne_800ExtraBold' }}>
            {displayName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}

      <View style={{ gap: 4, maxWidth: '100%' }}>
        {!isMe && (
          <Text style={{ color, fontSize: 11, fontFamily: 'Inter_600SemiBold', marginLeft: 2 }}>
            {displayName}
          </Text>
        )}

        <Pressable
          onPress={() => onReply(message)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onPickEmoji(message.id);
          }}
        >
          {isMe ? (
            <LinearGradient
              colors={['rgba(6,182,212,0.25)', 'rgba(139,92,246,0.2)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 18,
                borderTopRightRadius: 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: 'rgba(6,182,212,0.25)',
                gap: 6,
              }}
            >
              {replySource && (
                <View
                  style={{
                    borderLeftWidth: 2,
                    borderLeftColor: 'rgba(6,182,212,0.5)',
                    paddingLeft: 8,
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
                    {replySource.username || `anon·${replySource.senderId.slice(-4)}`}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}
                  >
                    {replySource.content}
                  </Text>
                </View>
              )}
              <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
                {message.content}
              </Text>
            </LinearGradient>
          ) : (
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderRadius: 18,
                borderTopLeftRadius: 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
                gap: 6,
              }}
            >
              {replySource && (
                <View
                  style={{
                    borderLeftWidth: 2,
                    borderLeftColor: color + '80',
                    paddingLeft: 8,
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
                    {replySource.username || `anon·${replySource.senderId.slice(-4)}`}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}
                  >
                    {replySource.content}
                  </Text>
                </View>
              )}
              <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
                {message.content}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Reaction emoji picker inline */}
        {reactingTo === message.id && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={{
              flexDirection: 'row',
              gap: 6,
              backgroundColor: Colors.bg.card,
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 7,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              alignSelf: isMe ? 'flex-end' : 'flex-start',
            }}
          >
            {REACT_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onReact(message.id, emoji)}
                style={{ padding: 2 }}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Reaction counts */}
        {hasReactions && (
          <View
            style={{
              flexDirection: 'row',
              gap: 5,
              flexWrap: 'wrap',
              alignSelf: isMe ? 'flex-end' : 'flex-start',
            }}
          >
            {Object.entries(message.reactions)
              .filter(([, count]) => count > 0)
              .map(([emoji, count]) => (
                <Pressable
                  key={emoji}
                  onPress={() => onReact(message.id, emoji)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    backgroundColor: Colors.bg.card,
                    borderRadius: 10,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.07)',
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
                    {count}
                  </Text>
                </Pressable>
              ))}
          </View>
        )}

        {/* Meta row */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            alignSelf: isMe ? 'flex-end' : 'flex-start',
            marginLeft: isMe ? 0 : 2,
          }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
            {timeAgo(message.createdAt)}
          </Text>
          {expiry && (
            <Text style={{ color: Colors.yellow, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
              ⏳ {expiry}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── FeedRoomScreen ───────────────────────────────────────────────────────────

export default function FeedRoomScreen() {
  usePreventScreenCapture();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { token } = useAuthStore();
  const store = useFeedStore();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedMessage | null>(null);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const loadMessages = useCallback(async (isRefresh = false) => {
    if (!token || !code) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>[];
        store.setMessages(data.map(mapMessage));
      } else if (res.status === 403) {
        Alert.alert('Access denied', 'You need to join this feed first.', [
          { text: 'Join', onPress: () => router.replace('/feed/join') },
          { text: 'Back', onPress: () => router.back() },
        ]);
      }
    } catch {
      if (!isRefresh) Alert.alert('Error', 'Could not load messages.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, code]);

  useEffect(() => { loadMessages(); }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !token || !code) return;
    if (store.weeklyCount >= store.weeklyLimit) {
      setShowPaywall(true);
      return;
    }
    setSending(true);
    const replyId = replyTo?.id ?? null;
    setText('');
    setReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed, reply_to_id: replyId }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (res.ok) {
        store.addMessage(mapMessage(data));
        store.incrementWeeklyCount();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (res.status === 429) {
        setShowPaywall(true);
      } else if (res.status === 422) {
        Alert.alert('Message flagged', 'Your message was flagged by moderation. Keep it appropriate.');
      } else {
        Alert.alert('Error', (data.detail as string) ?? 'Could not send message.');
      }
    } catch {
      Alert.alert('Error', 'Network error.');
    } finally {
      setSending(false);
    }
  }, [text, sending, token, code, replyTo, store]);

  const handleReact = useCallback((msgId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    store.addReaction(msgId, emoji);
    setReactingTo(null);
  }, [store]);

  const handlePickEmoji = useCallback((msgId: string) => {
    setReactingTo((prev) => (prev === msgId ? null : msgId));
  }, []);

  const remainingMessages = Math.max(0, store.weeklyLimit - store.weeklyCount);
  const atLimit = remainingMessages === 0;

  const feed = store.feed;
  const now = Date.now();
  const messages = store.messages.filter(
    (m) => m.expiresAt && new Date(m.expiresAt).getTime() > now
  );

  // Unique senders from recent messages for stories row
  const storyUsers = useMemo(() => {
    const seen = new Set<string>();
    const result: { senderId: string; username: string }[] = [];
    for (const m of [...messages].reverse()) {
      if (!seen.has(m.senderId)) {
        seen.add(m.senderId);
        result.push({ senderId: m.senderId, username: m.username });
        if (result.length >= 12) break;
      }
    }
    return result;
  }, [messages]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.06)',
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </Pressable>

        <View style={{ flex: 1, gap: 1 }}>
          <Text
            style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Syne_800ExtraBold' }}
            numberOfLines={1}
          >
            {feed?.name ?? `Feed · ${code}`}
          </Text>
          <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
            {code} · {feed?.memberCount ?? '?'} members · msgs expire in 24h
          </Text>
        </View>

        <Pressable onPress={() => loadMessages(true)} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={18} color={Colors.text.muted} />
        </Pressable>
      </View>

      {/* Stories row */}
      {storyUsers.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 14 }}
          style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}
        >
          {storyUsers.map(({ senderId, username }) => {
            const color = colorForSender(senderId);
            const isMe = senderId === store.myMemberId;
            const label = username || `anon·${senderId.slice(-4)}`;
            return (
              <View key={senderId} style={{ alignItems: 'center', gap: 5 }}>
                <LinearGradient
                  colors={[color, color + '88']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    padding: 2.5,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 24,
                      backgroundColor: Colors.bg.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color, fontSize: 18, fontFamily: 'Syne_900Black' }}>
                      {label[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                </LinearGradient>
                <Text
                  style={{
                    color: isMe ? Colors.cyan : Colors.text.muted,
                    fontSize: 9,
                    fontFamily: 'Inter_500Medium',
                    maxWidth: 52,
                  }}
                  numberOfLines={1}
                >
                  {isMe ? 'You' : label.split('·')[0]}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Messages */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Inter_400Regular' }}>
              Loading messages...
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadMessages(true)}
                tintColor={Colors.cyan}
              />
            }
          >
            {messages.length === 0 ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 }}>
                <Text style={{ fontSize: 40 }}>🔇</Text>
                <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Syne_800ExtraBold', textAlign: 'center' }}>
                  No messages yet
                </Text>
                <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                  Be the first to say something. All anonymous.
                </Text>
              </View>
            ) : (
              messages.map((msg) => {
                const isMe = !!store.myMemberId && msg.senderId === store.myMemberId;
                const replySource = msg.replyToId
                  ? messages.find((m) => m.id === msg.replyToId)
                  : undefined;
                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isMe={isMe}
                    replySource={replySource}
                    onReply={setReplyTo}
                    onReact={handleReact}
                    reactingTo={reactingTo}
                    onPickEmoji={handlePickEmoji}
                  />
                );
              })
            )}
          </ScrollView>
        )}

        {/* Typing indicator */}
        {store.typingUsers.length > 0 && (
          <TypingIndicator users={store.typingUsers} />
        )}

        {/* Bottom bar */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.06)',
            backgroundColor: Colors.bg.primary,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Platform.OS === 'ios' ? 8 : 12,
            gap: 8,
          }}
        >
          {/* Weekly limit bar */}
          {store.weeklyCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${(store.weeklyCount / store.weeklyLimit) * 100}%`,
                    backgroundColor: atLimit ? Colors.red : remainingMessages === 1 ? Colors.yellow : Colors.cyan,
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text style={{ color: atLimit ? Colors.red : Colors.text.muted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
                {atLimit ? 'Limit reached' : `${remainingMessages} left this week`}
              </Text>
            </View>
          )}

          {/* Reply preview */}
          {replyTo && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: Colors.bg.card,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderLeftWidth: 2,
                borderLeftColor: Colors.cyan,
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
                  Replying to {replyTo.username || `anon·${replyTo.senderId.slice(-4)}`}
                </Text>
                <Text numberOfLines={1} style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                  {replyTo.content}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)}>
                <Ionicons name="close" size={16} color={Colors.text.muted} />
              </Pressable>
            </View>
          )}

          {/* Input row */}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: Colors.bg.card,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: text ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.07)',
                color: Colors.text.primary,
                fontSize: 14,
                fontFamily: 'Inter_400Regular',
                paddingHorizontal: 16,
                paddingVertical: 11,
                maxHeight: 90,
              }}
              placeholder={atLimit ? 'Weekly limit reached' : 'Say something anonymous...'}
              placeholderTextColor={Colors.text.muted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              editable={!atLimit}
              returnKeyType="default"
            />
            <Pressable
              onPress={sendMessage}
              disabled={!text.trim() || sending || atLimit}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={
                  text.trim() && !atLimit
                    ? ['#06b6d4', '#8b5cf6']
                    : ['#1a2235', '#1a2235']
                }
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name="send"
                  size={17}
                  color={text.trim() && !atLimit ? '#fff' : Colors.text.muted}
                />
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <FeedPaywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={() => {
          setShowPaywall(false);
          router.push('/(tabs)/settings');
        }}
      />
    </SafeAreaView>
  );
}
