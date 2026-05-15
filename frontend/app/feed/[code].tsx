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
  Modal,
  Keyboard,
  PanResponder,
  Animated as RNAnimated,
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
import { Haptics, copyToClipboard } from '@/utils/compat';

import { Platform as RNPlatform } from 'react-native';
// expo-screen-capture not available on web
const usePreventScreenCapture: () => void = RNPlatform.OS === 'web'
  ? () => {}
  : require('expo-screen-capture').usePreventScreenCapture;
import { Colors, BorderRadius } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { FeedPaywall } from '@/components/feed/FeedPaywall';
import type { FeedMessage, FeedMember } from '@/types';

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

function messageTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m} ${ampm}`;
}

function dateSeparatorLabel(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 4,
      }}>
        <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_500Medium' }}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
    </View>
  );
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
    isPinned: (m.is_pinned ?? m.isPinned ?? false) as boolean,
    editedAt: ((m.edited_at ?? m.editedAt) as string | null) ?? null,
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
      <Text style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isMe,
  isOnline,
  replySource,
  onReply,
  onReact,
  onPickEmoji,
  onAvatarPress,
}: {
  message: FeedMessage;
  isMe: boolean;
  isOnline: boolean;
  replySource: FeedMessage | undefined;
  onReply: (msg: FeedMessage) => void;
  onReact: (msgId: string, emoji: string) => void;
  onPickEmoji: (msgId: string) => void;
  onAvatarPress?: () => void;
}) {
  const color = colorForSender(message.senderId);
  const displayName = message.username || `anon·${message.senderId.slice(-4)}`;
  const expiry = expiresIn(message.expiresAt);
  const hasReactions = Object.keys(message.reactions ?? {}).some((k) => (message.reactions ?? {})[k] > 0);

  // Swipe-to-reply gesture
  const swipeX = useRef(new RNAnimated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) swipeX.setValue(Math.min(g.dx, 60));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) {
          onReply(message);
        }
        RNAnimated.spring(swipeX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <RNAnimated.View
      style={{ transform: [{ translateX: swipeX }] }}
      {...panResponder.panHandlers}
    >
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
        <Pressable style={{ width: 30, height: 30, marginTop: 4 }} onPress={onAvatarPress}>
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
            }}
          >
            <Text style={{ color, fontSize: 12, fontFamily: 'Poppins_700Bold' }}>
              {displayName[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          {isOnline && (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: '#22c55e',
                borderWidth: 1.5,
                borderColor: Colors.bg.primary,
              }}
            />
          )}
        </Pressable>
      )}

      <View style={{ gap: 4, maxWidth: '100%' }}>
        {!isMe && (
          <Text style={{ color, fontSize: 11, fontFamily: 'Poppins_600SemiBold', marginLeft: 2 }}>
            {displayName}
          </Text>
        )}

        <Pressable
          onLongPress={() => {
            Haptics.medium();
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
                borderTopRightRadius: 4,  // tail top-right
                borderBottomRightRadius: 4, // tail bottom-right
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
                  <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
                    {replySource.username || `anon·${replySource.senderId.slice(-4)}`}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}
                  >
                    {replySource.content}
                  </Text>
                </View>
              )}
              <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 }}>
                {message.content}
              </Text>
            </LinearGradient>
          ) : (
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderRadius: 18,
                borderTopLeftRadius: 4,    // tail top-left
                borderBottomLeftRadius: 4, // tail bottom-left
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
                  <Text style={{ color, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
                    {replySource.username || `anon·${replySource.senderId.slice(-4)}`}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}
                  >
                    {replySource.content}
                  </Text>
                </View>
              )}
              <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 }}>
                {message.content}
              </Text>
            </View>
          )}
        </Pressable>

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
                  <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_700Bold' }}>
                    {count}
                  </Text>
                </Pressable>
              ))}
          </View>
        )}

        {/* Meta row: time + ticks for sent messages */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: isMe ? 'flex-end' : 'flex-start',
            marginLeft: isMe ? 0 : 2,
          }}
        >
          <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_400Regular' }}>
            {messageTime(message.createdAt)}
          </Text>
          {message.editedAt && (
            <Text style={{ color: Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_400Regular' }}>· edited</Text>
          )}
          {expiry && (
            <Text style={{ color: Colors.yellow, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
              · ⏳ {expiry}
            </Text>
          )}
          {/* Double tick for my messages — message.id exists = delivered to server */}
          {isMe && (
            <Text style={{ color: Colors.cyan, fontSize: 11, letterSpacing: -2 }}>✓✓</Text>
          )}
        </View>
      </View>
    </Animated.View>
    </RNAnimated.View>
  );
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

// ─── MemberInfoSheet ──────────────────────────────────────────────────────────

function MemberInfoSheet({ member, isOnline, onClose }: { member: FeedMember | null; isOnline: boolean; onClose: () => void }) {
  if (!member) return null;
  const color = colorForSender(member.id);
  return (
    <Modal visible={!!member} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={{ backgroundColor: Colors.bg.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 }} />
            <View style={{ alignItems: 'center', gap: 12, paddingHorizontal: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color + '22', borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color, fontSize: 26, fontFamily: 'Poppins_700Bold' }}>{member.username[0]?.toUpperCase()}</Text>
                {isOnline && (
                  <View style={{ position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', borderWidth: 2, borderColor: Colors.bg.card }} />
                )}
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>{member.username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isOnline && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' }} />}
                  <Text style={{ color: isOnline ? '#22c55e' : Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
                    {isOnline ? 'Online now' : 'Offline'}
                  </Text>
                  {member.isAdmin && (
                    <View style={{ backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Poppins_700Bold' }}>ADMIN</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: Colors.text.primary, fontSize: 20, fontFamily: 'Poppins_700Bold' }}>{member.weeklyMessageCount}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>this week</Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

type ContextMenuProps = {
  visible: boolean;
  message: FeedMessage | null;
  isMe: boolean;
  isAdmin: boolean;
  isPinned: boolean;
  onClose: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
};

function ContextMenu({ visible, message, isMe, isAdmin, isPinned, onClose, onReply, onReact, onCopy, onEdit, onDelete, onPin }: ContextMenuProps) {
  if (!message) return null;
  const actions = [
    { icon: 'arrow-undo', label: 'Reply', onPress: onReply },
    { icon: 'copy-outline', label: 'Copy', onPress: onCopy },
    ...(isMe ? [{ icon: 'create-outline', label: 'Edit', onPress: onEdit }] : []),
    ...(isAdmin ? [{ icon: isPinned ? 'pin' : 'pin-outline', label: isPinned ? 'Unpin' : 'Pin', onPress: onPin }] : []),
    ...(isMe || isAdmin ? [{ icon: 'trash-outline', label: 'Delete', onPress: onDelete, danger: true }] : []),
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View style={{
            backgroundColor: Colors.bg.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 8,
            paddingBottom: 32,
          }}>
            {/* Handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 12 }} />

            {/* Message preview */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
              <Text numberOfLines={2} style={{ color: Colors.text.secondary, fontSize: 13, fontFamily: 'Poppins_400Regular' }}>
                {message.content}
              </Text>
            </View>

            {/* Emoji row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
              {REACT_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => { onReact(emoji); onClose(); }}
                  style={({ pressed }) => ({ transform: [{ scale: pressed ? 1.3 : 1 }], padding: 6 })}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Action buttons */}
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => { action.onPress(); onClose(); }}
                android_ripple={{ color: 'rgba(255,255,255,0.07)' }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16 }}
              >
                <Ionicons
                  name={action.icon as any}
                  size={22}
                  color={action.danger ? '#ef4444' : Colors.text.secondary}
                />
                <Text style={{
                  color: action.danger ? '#ef4444' : Colors.text.primary,
                  fontSize: 16,
                  fontFamily: 'Poppins_500Medium',
                }}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [showPaywall, setShowPaywall] = useState(false);
  const [contextMsg, setContextMsg] = useState<FeedMessage | null>(null);
  // Edit mode
  const [editingMsg, setEditingMsg] = useState<FeedMessage | null>(null);
  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Member info sheet
  const [memberSheet, setMemberSheet] = useState<FeedMember | null>(null);
  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Track IDs we've already added so the sender's own message isn't double-added
  const seenMessageIds = useRef<Set<string>>(new Set());
  // Scroll-to-bottom FAB state
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const isAtBottomRef = useRef(true);
  // Typing send throttle
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-member typing clear timers
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Fetch member info for THIS feed so isMe always works correctly
  const loadMemberInfo = useCallback(async () => {
    if (!token || !code) return;
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        store.setMyMemberId(data.id as string);
        // Also sync weekly count from server
        if (typeof data.weekly_message_count === 'number' && data.week_resets_at) {
          store.setWeeklyCount(data.weekly_message_count as number, data.week_resets_at as string);
        }
      }
    } catch {
      // silent — member info is best-effort
    }
  }, [token, code]);

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
        const mapped = data.map(mapMessage);
        // Seed seen IDs so WS doesn't re-add already-loaded messages
        mapped.forEach((m) => seenMessageIds.current.add(m.id));
        store.setMessages(mapped);
      } else if (res.status === 403) {
        Alert.alert('Access denied', 'You are not a member of this feed.', [
          { text: 'Join', onPress: () => router.replace('/feed/join') },
          { text: 'Back', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)/feed') },
        ]);
      } else if (res.status === 404) {
        Alert.alert('Not found', 'This feed does not exist.', [
          { text: 'Back', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)/feed') },
        ]);
      } else {
        if (!isRefresh) Alert.alert('Error', 'Could not load messages. Pull down to retry.');
      }
    } catch {
      if (!isRefresh) Alert.alert('Error', 'Network error. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, code]);

  const loadMembers = useCallback(async () => {
    if (!token || !code) return;
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>[];
        store.setMembers(data.map((m) => ({
          id: m.id as string,
          feedId: (m.feed_id as string) ?? '',
          userId: (m.user_id as string) ?? '',
          username: (m.username as string) ?? '',
          isAdmin: (m.is_admin as boolean) ?? false,
          weeklyMessageCount: (m.weekly_message_count as number) ?? 0,
        })));
      }
    } catch { /* silent */ }
  }, [token, code]);

  useEffect(() => {
    // Fetch member info first so isMe is correct, then load messages
    loadMemberInfo();
    loadMessages();
    loadMembers();
  }, []);

  // ── WebSocket for real-time new messages ──────────────────────────────────
  useEffect(() => {
    if (!token || !code) return;

    // Build WS URL: replace http(s) with ws(s) and pass token as query param
    const wsBase = API_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/feed/ws/${code}?token=${encodeURIComponent(token)}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        store.setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; data: Record<string, unknown> };
          if (msg.type === 'new_message') {
            const newMsg = mapMessage(msg.data);
            // Only add if we haven't seen it (avoids doubling sender's own message)
            if (!seenMessageIds.current.has(newMsg.id)) {
              seenMessageIds.current.add(newMsg.id);
              store.addMessage(newMsg);
              if (isAtBottomRef.current) {
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
              } else {
                setUnreadCount((n) => n + 1);
              }
            }
          } else if (msg.type === 'message_deleted') {
            store.removeMessage((msg.data as { id: string }).id);
          } else if (msg.type === 'message_edited') {
            const d = msg.data as { id: string; content: string; edited_at: string };
            store.editMessage(d.id, d.content, d.edited_at);
          } else if (msg.type === 'reaction_updated') {
            const d = msg.data as { message_id: string; reactions: Record<string, number> };
            store.updateReactions(d.message_id, d.reactions);
          } else if (msg.type === 'pin_updated') {
            const d = msg.data as { pinned_message_id: string | null };
            if (store.feed) store.setFeed({ ...store.feed, pinnedMessageId: d.pinned_message_id ?? null });
          } else if (msg.type === 'typing') {
            const d = msg.data as { member_id: string; username: string };
            // Add to typing users, auto-remove after 3s
            store.setTypingUsers([
              ...store.typingUsers.filter((u) => u.id !== d.member_id),
              { id: d.member_id, username: d.username },
            ]);
            // Clear existing timer for this member
            const prev = typingClearTimers.current.get(d.member_id);
            if (prev) clearTimeout(prev);
            const t = setTimeout(() => {
              store.setTypingUsers(store.typingUsers.filter((u) => u.id !== d.member_id));
              typingClearTimers.current.delete(d.member_id);
            }, 3000);
            typingClearTimers.current.set(d.member_id, t);
          } else if (msg.type === 'presence') {
            const d = msg.data as { member_id: string; online: boolean };
            if (d.online) store.addOnlineMember(d.member_id);
            else store.removeOnlineMember(d.member_id);
          }
        } catch {
          // malformed message — ignore
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        store.setConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 3 seconds if still mounted
        if (alive) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
      store.setConnected(false);
    };
  }, [token, code]);

  // Scroll to bottom when keyboard opens so messages don't go off screen
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => show.remove();
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !token || !code) return;
    // Weekly limit temporarily disabled
    // if (store.weeklyCount >= store.weeklyLimit) {
    //   setShowPaywall(true);
    //   return;
    // }
    setSending(true);
    const replyId = replyTo?.id ?? null;
    setText('');
    setReplyTo(null);
    Haptics.light();
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed, reply_to_id: replyId }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (res.ok) {
        const mapped = mapMessage(data);
        // Mark as seen so the WS broadcast doesn't add it a second time
        seenMessageIds.current.add(mapped.id);
        store.addMessage(mapped);
        store.incrementWeeklyCount();
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      } else if (res.status === 429) {
        setShowPaywall(true);
      } else if (res.status === 422) {
        Alert.alert('Message flagged', 'Your message was flagged by moderation. Keep it appropriate.');
      } else {
        // Show exact server error for debugging
        Alert.alert(`Error ${res.status}`, String(data.detail ?? JSON.stringify(data)));
      }
    } catch (err) {
      Alert.alert('Network Error', String(err));
    } finally {
      setSending(false);
    }
  }, [text, sending, token, code, replyTo, store]);

  const handleReact = useCallback((msgId: string, emoji: string) => {
    Haptics.light();
    store.addReaction(msgId, emoji);
    // Sync to backend
    fetch(`${API_URL}/feed/feeds/${code}/messages/${msgId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  }, [store, code, token]);

  const handlePickEmoji = useCallback((msgId: string) => {
    const msg = store.messages.find((m) => m.id === msgId);
    if (msg) { Haptics.medium(); setContextMsg(msg); }
  }, [store.messages]);

  const handleDelete = useCallback(async (msg: FeedMessage) => {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          store.removeMessage(msg.id);
          try {
            await fetch(`${API_URL}/feed/feeds/${code}/messages/${msg.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch { /* broadcast will sync other devices */ }
        },
      },
    ]);
  }, [code, token, store]);

  const handleEdit = useCallback((msg: FeedMessage) => {
    setEditingMsg(msg);
    setText(msg.content);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handlePin = useCallback(async (msg: FeedMessage) => {
    const isPinned = store.feed?.pinnedMessageId === msg.id;
    try {
      const url = isPinned
        ? `${API_URL}/feed/feeds/${code}/pin`
        : `${API_URL}/feed/feeds/${code}/pin?message_id=${msg.id}`;
      await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (store.feed) store.setFeed({ ...store.feed, pinnedMessageId: isPinned ? null : msg.id });
    } catch { /* silent */ }
  }, [code, token, store]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingMsg || !text.trim() || !token || !code) return;
    const newContent = text.trim();
    const oldMsg = editingMsg;
    setEditingMsg(null);
    setText('');
    store.editMessage(oldMsg.id, newContent, new Date().toISOString());
    try {
      await fetch(`${API_URL}/feed/feeds/${code}/messages/${oldMsg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: newContent }),
      });
    } catch { store.editMessage(oldMsg.id, oldMsg.content, oldMsg.editedAt ?? ''); }
  }, [editingMsg, text, code, token, store]);

  const isMuted = store.mutedFeedIds.includes(store.feed?.id ?? '');
  const isAdmin = !!store.members.find((m) => m.id === store.myMemberId)?.isAdmin;

  // @mention: filter members when user types @
  const mentionMatches = useMemo(() => {
    if (!mentionQuery) return [];
    return store.members.filter((m) => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5);
  }, [mentionQuery, store.members]);

  // Unread divider: find first message after lastReadId
  const lastReadId = store.lastReadIds[store.feed?.id ?? ''];
  const firstUnreadIndex = lastReadId
    ? store.messages.findIndex((m) => m.id === lastReadId) + 1
    : -1;

  const remainingMessages = Math.max(0, store.weeklyLimit - store.weeklyCount);
  const atLimit = remainingMessages === 0;

  const feed = store.feed;
  // Search filter
  const messages = showSearch && searchQuery.trim()
    ? store.messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : store.messages;

  // Track last read on unmount
  useEffect(() => {
    return () => {
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg && store.feed?.id) store.setLastRead(store.feed.id, lastMsg.id);
    };
  }, []);


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
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/feed')} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </Pressable>

        <Pressable
          style={{ flex: 1, gap: 1 }}
          onPress={() => router.push(`/feed/info/${code}`)}
        >
          <Text
            style={{ color: Colors.text.primary, fontSize: 16, fontFamily: 'Poppins_700Bold' }}
            numberOfLines={1}
          >
            {feed?.name ?? `Feed · ${code}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {store.isConnected && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
            )}
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
              {code} · {(feed as any)?.member_count ?? feed?.memberCount ?? '?'} members · Tap for info
            </Text>
          </View>
        </Pressable>

        <Pressable onPress={() => setShowSearch((v) => !v)} style={{ padding: 4 }}>
          <Ionicons name={showSearch ? 'close' : 'search'} size={18} color={showSearch ? Colors.cyan : Colors.text.muted} />
        </Pressable>
        <Pressable onPress={() => store.toggleMuteFeed(store.feed?.id ?? '')} style={{ padding: 4 }}>
          <Ionicons name={isMuted ? 'notifications-off' : 'notifications'} size={18} color={isMuted ? Colors.text.muted : Colors.cyan} />
        </Pressable>
        <Pressable onPress={() => loadMessages(true)} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={18} color={Colors.text.muted} />
        </Pressable>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
          <TextInput
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
              color: Colors.text.primary,
              fontSize: 14,
              fontFamily: 'Poppins_400Regular',
              borderWidth: 1,
              borderColor: 'rgba(6,182,212,0.3)',
            }}
            placeholder="Search messages..."
            placeholderTextColor={Colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.trim() && (
            <Text style={{ color: Colors.text.muted, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4, marginLeft: 4 }}>
              {messages.length} result{messages.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* Pinned message banner */}
      {feed?.pinnedMessageId && (() => {
        const pinned = store.messages.find((m) => m.id === feed.pinnedMessageId);
        if (!pinned) return null;
        return (
          <Pressable
            onPress={() => {
              const idx = store.messages.findIndex((m) => m.id === feed.pinnedMessageId);
              if (idx >= 0) scrollRef.current?.scrollTo({ y: idx * 80, animated: true });
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: 'rgba(6,182,212,0.08)',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(6,182,212,0.15)',
            }}
          >
            <Ionicons name="pin" size={14} color={Colors.cyan} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>Pinned message</Text>
              <Text numberOfLines={1} style={{ color: Colors.text.secondary, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>{pinned.content}</Text>
            </View>
            {isAdmin && (
              <Pressable onPress={() => handlePin(pinned)}>
                <Ionicons name="close" size={16} color={Colors.text.muted} />
              </Pressable>
            )}
          </Pressable>
        );
      })()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text style={{ color: Colors.text.muted, fontSize: 14, fontFamily: 'Poppins_400Regular' }}>
              Loading messages...
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              if (isAtBottomRef.current) scrollRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
              const atBottom = distFromBottom < 60;
              isAtBottomRef.current = atBottom;
              setIsAtBottom(atBottom);
              if (atBottom) setUnreadCount(0);
            }}
            scrollEventThrottle={100}
            keyboardShouldPersistTaps="handled"
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
                <Text style={{ color: Colors.text.primary, fontSize: 18, fontFamily: 'Poppins_700Bold', textAlign: 'center' }}>
                  No messages yet
                </Text>
                <Text style={{ color: Colors.text.muted, fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center' }}>
                  Be the first to say something. All anonymous.
                </Text>
              </View>
            ) : (
              messages.map((msg, index) => {
                const isMe = !!store.myMemberId && msg.senderId === store.myMemberId;
                const replySource = msg.replyToId
                  ? messages.find((m) => m.id === msg.replyToId)
                  : undefined;

                // Show date separator when day changes between messages
                const prevMsg = messages[index - 1];
                const showSeparator = !prevMsg || (
                  msg.createdAt &&
                  dateSeparatorLabel(msg.createdAt) !== dateSeparatorLabel(prevMsg.createdAt)
                );

                const showUnreadDivider = firstUnreadIndex === index && index > 0;

                return (
                  <View key={msg.id}>
                    {showSeparator && msg.createdAt && (
                      <DateSeparator label={dateSeparatorLabel(msg.createdAt)} />
                    )}
                    {showUnreadDivider && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(239,68,68,0.3)' }} />
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
                          <Text style={{ color: '#ef4444', fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>NEW MESSAGES</Text>
                        </View>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(239,68,68,0.3)' }} />
                      </View>
                    )}
                    <MessageBubble
                      message={msg}
                      isMe={isMe}
                      isOnline={store.onlineMemberIds.includes(msg.senderId)}
                      replySource={replySource}
                      onReply={setReplyTo}
                      onReact={handleReact}
                      onPickEmoji={handlePickEmoji}
                      onAvatarPress={() => {
                        const member = store.members.find((m) => m.id === msg.senderId);
                        if (member) setMemberSheet(member);
                      }}
                    />
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Scroll-to-bottom FAB */}
        {!isAtBottom && (
          <Pressable
            onPress={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
              setUnreadCount(0);
            }}
            style={{
              position: 'absolute',
              bottom: store.typingUsers.length > 0 ? 100 : 70,
              right: 16,
              zIndex: 10,
              backgroundColor: Colors.bg.card,
              borderRadius: 22,
              width: 42,
              height: 42,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(6,182,212,0.3)',
              shadowColor: '#06b6d4',
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <Ionicons name="arrow-down" size={18} color={Colors.cyan} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  backgroundColor: Colors.cyan,
                  borderRadius: 9,
                  minWidth: 18,
                  height: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Poppins_700Bold' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
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
          {/* Weekly limit bar — temporarily disabled */}
          {/* {store.weeklyCount > 0 && (
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
              <Text style={{ color: atLimit ? Colors.red : Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
                {atLimit ? 'Limit reached' : `${remainingMessages} left this week`}
              </Text>
            </View>
          )} */}

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
                <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
                  Replying to {replyTo.username || `anon·${replyTo.senderId.slice(-4)}`}
                </Text>
                <Text numberOfLines={1} style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
                  {replyTo.content}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)}>
                <Ionicons name="close" size={16} color={Colors.text.muted} />
              </Pressable>

            </View>
          )}

          {/* @mention autocomplete */}
          {mentionMatches.length > 0 && (
            <View style={{ backgroundColor: Colors.bg.card, borderRadius: 12, marginHorizontal: 4, marginBottom: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              {mentionMatches.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    const atIdx = text.lastIndexOf('@');
                    setText(text.slice(0, atIdx) + '@' + m.username + ' ');
                    setMentionQuery(null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                  android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colorForSender(m.id) + '22', borderWidth: 1.5, borderColor: colorForSender(m.id), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colorForSender(m.id), fontSize: 11, fontFamily: 'Poppins_700Bold' }}>{m.username[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={{ color: Colors.text.primary, fontSize: 14, fontFamily: 'Poppins_500Medium' }}>@{m.username}</Text>
                  {store.onlineMemberIds.includes(m.id) && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' }} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Edit mode banner */}
          {editingMsg && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderLeftWidth: 2, borderLeftColor: '#8b5cf6', gap: 10 }}>
              <Ionicons name="create-outline" size={14} color="#8b5cf6" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#8b5cf6', fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>Editing message</Text>
                <Text numberOfLines={1} style={{ color: Colors.text.muted, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>{editingMsg.content}</Text>
              </View>
              <Pressable onPress={() => { setEditingMsg(null); setText(''); }}>
                <Ionicons name="close" size={16} color={Colors.text.muted} />
              </Pressable>
            </View>
          )}

          {/* Input row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: Colors.bg.card,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: text ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.07)',
                color: Colors.text.primary,
                fontSize: 14,
                fontFamily: 'Poppins_400Regular',
                paddingHorizontal: 16,
                paddingVertical: 10,
                maxHeight: 120,
              }}
              placeholder="Type a message..."
              placeholderTextColor={Colors.text.muted}
              value={text}
              onChangeText={(v) => {
                setText(v.slice(0, 1000));
                // Throttle: send typing event at most every 2s
                if (!typingTimerRef.current && wsRef.current?.readyState === 1) {
                  wsRef.current.send(JSON.stringify({ type: 'typing' }));
                  typingTimerRef.current = setTimeout(() => {
                    typingTimerRef.current = null;
                  }, 2000);
                }
              }}
              multiline
              numberOfLines={4}
              maxLength={1000}
              ref={inputRef}
              returnKeyType="send"
              blurOnSubmit={true}
              onSubmitEditing={() => {
                if (editingMsg) handleSaveEdit();
                else if (text.trim()) sendMessage();
              }}
            />
            <Pressable
              onPress={editingMsg ? handleSaveEdit : sendMessage}
              disabled={!text.trim() || sending}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: text.trim() ? (editingMsg ? '#8b5cf6' : Colors.cyan) : 'rgba(255,255,255,0.07)',
                opacity: sending ? 0.6 : 1,
              }}
            >
              <Ionicons
                name={sending ? 'hourglass-outline' : editingMsg ? 'checkmark' : 'send'}
                size={18}
                color={text.trim() ? '#fff' : Colors.text.muted}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Context menu */}
      <ContextMenu
        visible={!!contextMsg}
        message={contextMsg}
        isMe={!!contextMsg && !!store.myMemberId && contextMsg.senderId === store.myMemberId}
        isAdmin={isAdmin}
        isPinned={!!contextMsg && store.feed?.pinnedMessageId === contextMsg.id}
        onClose={() => setContextMsg(null)}
        onReply={() => {
          if (contextMsg) setReplyTo(contextMsg);
          setContextMsg(null);
        }}
        onReact={(emoji) => {
          if (contextMsg) handleReact(contextMsg.id, emoji);
          setContextMsg(null);
        }}
        onCopy={() => {
          if (contextMsg) copyToClipboard(contextMsg.content);
          setContextMsg(null);
        }}
        onEdit={() => {
          if (contextMsg) handleEdit(contextMsg);
          setContextMsg(null);
        }}
        onDelete={() => {
          if (contextMsg) handleDelete(contextMsg);
          setContextMsg(null);
        }}
        onPin={() => {
          if (contextMsg) handlePin(contextMsg);
          setContextMsg(null);
        }}
      />

      {/* Member info sheet */}
      <MemberInfoSheet
        member={memberSheet}
        isOnline={!!memberSheet && store.onlineMemberIds.includes(memberSheet.id)}
        onClose={() => setMemberSheet(null)}
      />

      {/* Paywall */}
      {showPaywall && <FeedPaywall visible={showPaywall} onClose={() => setShowPaywall(false)} onUpgrade={() => setShowPaywall(false)} />}
    </SafeAreaView>
  );
}
