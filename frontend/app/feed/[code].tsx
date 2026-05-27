import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  StatusBar,
  Modal,
  Keyboard,
  PanResponder,
  Animated as RNAnimated,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, {
  FadeIn,
  SlideInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Haptics, copyToClipboard } from "@/utils/compat";
import { apiFetch } from "@/utils/apiFetch";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { analytics } from "@/utils/analytics";
import { Audio, Recording, Sound } from '@/utils/audioCompat';
import { Video, ResizeMode } from 'expo-video';
import { useLinkPreview } from "@/hooks/useLinkPreview";
import { TypingIndicator } from "@/components/feed/TypingIndicator";
import { VoiceBubble } from "@/components/feed/VoiceBubble";
import { VoicePreviewModal } from "@/components/feed/VoicePreviewModal";
import { MediaGalleryModal } from "@/components/feed/MediaGalleryModal";
import { ForwardModal } from "@/components/feed/ForwardModal";
import { cacheMessages, getCachedMessages } from "@/utils/messageCache";

import { Platform as RNPlatform } from "react-native";
// expo-screen-capture not available on web
const usePreventScreenCapture: () => void =
  RNPlatform.OS === "web"
    ? () => {}
    : require("expo-screen-capture").usePreventScreenCapture;
import { Colors, BorderRadius } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { useFeedStore } from "@/store/feedStore";
import { FeedPaywall } from "@/components/feed/FeedPaywall";
import type { FeedMessage, FeedMember } from "@/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.classchaos.app";

const SENDER_COLORS = [
  "#3b82f6",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
];

function colorForSender(senderId: string) {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++)
    hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function messageTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
}

function dateSeparatorLabel(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function DateSeparator({ label }: { label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginVertical: 8,
      }}
    >
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.07)",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            color: Colors.text.muted,
            fontSize: 11,
            fontFamily: "Poppins_500Medium",
          }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.07)",
        }}
      />
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
    feedId: ((m.feed_id ?? m.feedId) as string) ?? "",
    senderId: ((m.sender_id ?? m.senderId) as string) ?? "",
    username: (m.username as string) ?? "",
    content: m.content as string,
    replyToId: ((m.reply_to_id ?? m.replyToId) as string | null) ?? null,
    reactions: (m.reactions ?? {}) as Record<string, number>,
    isPinned: (m.is_pinned ?? m.isPinned ?? false) as boolean,
    editedAt: ((m.edited_at ?? m.editedAt) as string | null) ?? null,
    msgType: (m.msg_type ?? m.msgType ?? "text") as FeedMessage["msgType"],
    pollOptions: (m.poll_options ?? m.pollOptions ?? null) as string[] | null,
    pollVotes: (m.poll_votes ?? m.pollVotes ?? null) as Record<
      string,
      string[]
    > | null,
    mediaUrl: (m.media_url ?? m.mediaUrl ?? null) as string | null,
    seenBy: (m.seen_by ?? m.seenBy ?? []) as string[],
    createdAt: ((m.created_at ?? m.createdAt) as string) ?? "",
    expiresAt: ((m.expires_at ?? m.expiresAt) as string) ?? "",
  };
}

const REACT_EMOJIS = ["😂", "🔥", "💀", "❤️", "😱", "👀"];

// ─── MessageBubble ────────────────────────────────────────────────────────────

// ─── VoiceBubble ─────────────────────────────────────────────────────────────

// ─── LinkPreviewCard ─────────────────────────────────────────────────────────
function LinkPreviewCard({ text }: { text: string }) {
  const preview = useLinkPreview(text);
  if (!preview) return null;

  return (
    <Pressable
      onPress={() => {
        const { Linking } = require("react-native");
        Linking.openURL(preview.url);
      }}
      style={{
        marginTop: 6,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: Colors.bg.primary,
      }}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={{ width: "100%", height: 120 }}
          resizeMode="cover"
        />
      ) : null}
      <View style={{ padding: 10, gap: 2 }}>
        <Text
          style={{
            color: Colors.text.muted,
            fontSize: 10,
            fontFamily: "Poppins_400Regular",
          }}
        >
          {preview.domain}
        </Text>
        {preview.title ? (
          <Text
            numberOfLines={2}
            style={{
              color: Colors.text.primary,
              fontSize: 13,
              fontFamily: "Poppins_600SemiBold",
              lineHeight: 18,
            }}
          >
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text
            numberOfLines={2}
            style={{
              color: Colors.text.secondary,
              fontSize: 11,
              fontFamily: "Poppins_400Regular",
              lineHeight: 16,
            }}
          >
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── PollMessage ─────────────────────────────────────────────────────────────
function PollMessage({
  message,
  myMemberId,
  onVote,
}: {
  message: FeedMessage;
  myMemberId: string | null;
  onVote: (msgId: string, idx: number) => void;
}) {
  const color = colorForSender(message.senderId);
  const displayName = message.username || `anon·${message.senderId.slice(-4)}`;
  const opts = message.pollOptions ?? [];
  const votes = message.pollVotes ?? {};
  const totalVotes = Object.values(votes).reduce((s, arr) => s + arr.length, 0);
  const myVote = myMemberId
    ? Object.entries(votes).find(([, arr]) => arr.includes(myMemberId))?.[0]
    : null;

  return (
    <View
      style={{
        backgroundColor: Colors.bg.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        padding: 14,
        gap: 10,
        marginVertical: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="stats-chart-outline" size={13} color={color} />
        <Text
          style={{ color, fontSize: 12, fontFamily: "Poppins_600SemiBold" }}
        >
          {displayName}
        </Text>
        <Text
          style={{
            color: Colors.text.muted,
            fontSize: 11,
            fontFamily: "Poppins_400Regular",
          }}
        >
          · Poll
        </Text>
      </View>
      <Text
        style={{
          color: Colors.text.primary,
          fontSize: 14,
          fontFamily: "Poppins_600SemiBold",
          lineHeight: 20,
        }}
      >
        {message.content}
      </Text>
      <View style={{ gap: 8 }}>
        {opts.map((opt, idx) => {
          const count = (votes[String(idx)] ?? []).length;
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const isMyVote = myVote === String(idx);
          return (
            <Pressable key={idx} onPress={() => onVote(message.id, idx)}>
              <View
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: isMyVote ? Colors.cyan : "rgba(255,255,255,0.1)",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${pct}%`,
                    backgroundColor: isMyVote
                      ? "rgba(6,182,212,0.2)"
                      : "rgba(255,255,255,0.05)",
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {isMyVote && (
                      <Ionicons
                        name="checkmark-circle"
                        size={13}
                        color={Colors.cyan}
                      />
                    )}
                    <Text
                      style={{
                        color: Colors.text.primary,
                        fontSize: 13,
                        fontFamily: isMyVote
                          ? "Poppins_600SemiBold"
                          : "Poppins_400Regular",
                      }}
                    >
                      {opt}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: Colors.text.muted,
                      fontSize: 11,
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    {count} {count === 1 ? "vote" : "votes"}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text
        style={{
          color: Colors.text.muted,
          fontSize: 11,
          fontFamily: "Poppins_400Regular",
        }}
      >
        {totalVotes} total vote{totalVotes !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

function MessageBubble({
  message,
  isMe,
  isOnline,
  replySource,
  onReply,
  onReact,
  onPickEmoji,
  onAvatarPress,
  searchQuery,
}: {
  message: FeedMessage;
  isMe: boolean;
  isOnline: boolean;
  replySource: FeedMessage | undefined;
  onReply: (msg: FeedMessage) => void;
  onReact: (msgId: string, emoji: string) => void;
  onPickEmoji: (msgId: string) => void;
  onAvatarPress?: () => void;
  searchQuery?: string;
}) {
  const color = colorForSender(message.senderId);
  const displayName = message.username || `anon·${message.senderId.slice(-4)}`;
  const expiry = expiresIn(message.expiresAt);
  const hasReactions = Object.keys(message.reactions ?? {}).some(
    (k) => (message.reactions ?? {})[k] > 0,
  );

  // Highlight search matches
  const renderContent = (content: string) => {
    if (!searchQuery?.trim()) {
      return <Text style={{ color: isMe ? Colors.text.primary : Colors.text.primary, fontSize: 14, fontFamily: "Poppins_400Regular" }}>{content}</Text>;
    }
    const query = searchQuery.trim().toLowerCase();
    const parts = content.split(new RegExp(`(${query})`, 'gi'));
    return (
      <Text style={{ color: isMe ? Colors.text.primary : Colors.text.primary, fontSize: 14, fontFamily: "Poppins_400Regular" }}>
        {parts.map((part, i) => 
          part.toLowerCase() === query ? (
            <Text key={i} style={{ backgroundColor: '#fbbf24', color: '#000' }}>{part}</Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  };

  // Swipe-to-reply gesture
  const swipeX = useRef(new RNAnimated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) swipeX.setValue(Math.min(g.dx, 60));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) {
          onReply(message);
        }
        RNAnimated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 6,
        }).start();
      },
      onPanResponderTerminate: () => {
        RNAnimated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  return (
    <RNAnimated.View
      style={{ transform: [{ translateX: swipeX }] }}
      {...panResponder.panHandlers}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={{
          flexDirection: "row",
          alignSelf: isMe ? "flex-end" : "flex-start",
          maxWidth: "85%",
          gap: 8,
          marginBottom: 2,
        }}
      >
        {!isMe && (
          <Pressable
            style={{ width: 30, height: 30, marginTop: 4 }}
            onPress={onAvatarPress}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: color + "22",
                borderWidth: 1.5,
                borderColor: color,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color, fontSize: 12, fontFamily: "Poppins_700Bold" }}
              >
                {displayName[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            {isOnline && (
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: "#22c55e",
                  borderWidth: 1.5,
                  borderColor: Colors.bg.primary,
                }}
              />
            )}
          </Pressable>
        )}

        <View style={{ gap: 4, maxWidth: "100%" }}>
          {!isMe && (
            <Text
              style={{
                color,
                fontSize: 11,
                fontFamily: "Poppins_600SemiBold",
                marginLeft: 2,
              }}
            >
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
                colors={["rgba(6,182,212,0.25)", "rgba(139,92,246,0.2)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 18,
                  borderTopRightRadius: 4, // tail top-right
                  borderBottomRightRadius: 4, // tail bottom-right
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: "rgba(6,182,212,0.25)",
                  gap: 6,
                }}
              >
                {replySource && (
                  <View
                    style={{
                      borderLeftWidth: 2,
                      borderLeftColor: "rgba(6,182,212,0.5)",
                      paddingLeft: 8,
                      marginBottom: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: Colors.cyan,
                        fontSize: 10,
                        fontFamily: "Poppins_600SemiBold",
                      }}
                    >
                      {replySource.username ||
                        `anon·${replySource.senderId.slice(-4)}`}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: Colors.text.muted,
                        fontSize: 11,
                        fontFamily: "Poppins_400Regular",
                      }}
                    >
                      {replySource.content}
                    </Text>
                  </View>
                )}
                {message.msgType === "voice" && message.mediaUrl ? (
                  <VoiceBubble url={message.mediaUrl} color={Colors.cyan} />
                ) : message.msgType === "video" && message.mediaUrl ? (
                  <View style={{ width: 220, height: 160, borderRadius: 10, overflow: 'hidden' }}>
                    <Video
                      source={{ uri: message.mediaUrl }}
                      style={{ width: 220, height: 160 }}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      isLooping={false}
                    />
                  </View>
                ) : message.mediaUrl ? (
                  <Pressable
                    onPress={() => {
                      const { Linking } = require("react-native");
                      Linking.openURL(message.mediaUrl!);
                    }}
                  >
                    <Image
                      source={{ uri: message.mediaUrl }}
                      style={{ width: 220, height: 160, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ) : (
                  <>
                    {renderContent(message.content)}
                    {message.editedAt && (
                      <Text style={{ color: Colors.text.muted, fontSize: 9, fontFamily: "Poppins_400Regular", marginTop: 2 }}>
                        (edited)
                      </Text>
                    )}
                  </>
                )}
              </LinearGradient>
            ) : (
              <View
                style={{
                  backgroundColor: Colors.bg.card,
                  borderRadius: 18,
                  borderTopLeftRadius: 4, // tail top-left
                  borderBottomLeftRadius: 4, // tail bottom-left
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.06)",
                  gap: 6,
                }}
              >
                {replySource && (
                  <View
                    style={{
                      borderLeftWidth: 2,
                      borderLeftColor: color + "80",
                      paddingLeft: 8,
                      marginBottom: 2,
                    }}
                  >
                    <Text
                      style={{
                        color,
                        fontSize: 10,
                        fontFamily: "Poppins_600SemiBold",
                      }}
                    >
                      {replySource.username ||
                        `anon·${replySource.senderId.slice(-4)}`}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: Colors.text.muted,
                        fontSize: 11,
                        fontFamily: "Poppins_400Regular",
                      }}
                    >
                      {replySource.content}
                    </Text>
                  </View>
                )}
                {message.msgType === "voice" && message.mediaUrl ? (
                  <VoiceBubble url={message.mediaUrl} color={color} />
                ) : message.msgType === "video" && message.mediaUrl ? (
                  <View style={{ width: 220, height: 160, borderRadius: 10, overflow: 'hidden' }}>
                    <Video
                      source={{ uri: message.mediaUrl }}
                      style={{ width: 220, height: 160 }}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      isLooping={false}
                    />
                  </View>
                ) : message.mediaUrl ? (
                  <Pressable
                    onPress={() => {
                      const { Linking } = require("react-native");
                      Linking.openURL(message.mediaUrl!);
                    }}
                  >
                    <Image
                      source={{ uri: message.mediaUrl }}
                      style={{ width: 220, height: 160, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  </Pressable>
                ) : (
                  <>
                    {renderContent(message.content)}
                    {message.editedAt && (
                      <Text style={{ color: Colors.text.muted, fontSize: 9, fontFamily: "Poppins_400Regular", marginTop: 2 }}>
                        (edited)
                      </Text>
                    )}
                    <LinkPreviewCard text={message.content} />
                  </>
                )}
              </View>
            )}
          </Pressable>

          {/* Reaction counts */}
          {hasReactions && (
            <View
              style={{
                flexDirection: "row",
                gap: 5,
                flexWrap: "wrap",
                alignSelf: isMe ? "flex-end" : "flex-start",
              }}
            >
              {Object.entries(message.reactions)
                .filter(([, count]) => count > 0)
                .map(([emoji, count]) => (
                  <Pressable
                    key={emoji}
                    onPress={() => onReact(message.id, emoji)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                      backgroundColor: Colors.bg.card,
                      borderRadius: 10,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.07)",
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{emoji}</Text>
                    <Text
                      style={{
                        color: Colors.text.muted,
                        fontSize: 10,
                        fontFamily: "Poppins_700Bold",
                      }}
                    >
                      {count}
                    </Text>
                  </Pressable>
                ))}
            </View>
          )}

          {/* Meta row: time + ticks for sent messages */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              alignSelf: isMe ? "flex-end" : "flex-start",
              marginLeft: isMe ? 0 : 2,
            }}
          >
            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 10,
                fontFamily: "Poppins_400Regular",
              }}
            >
              {messageTime(message.createdAt)}
            </Text>
            {message.editedAt && (
              <Text
                style={{
                  color: Colors.text.muted,
                  fontSize: 10,
                  fontFamily: "Poppins_400Regular",
                }}
              >
                · edited
              </Text>
            )}
            {expiry && (
              <Text
                style={{
                  color: Colors.yellow,
                  fontSize: 10,
                  fontFamily: "Poppins_600SemiBold",
                }}
              >
                · ⏳ {expiry}
              </Text>
            )}
            {/* Double tick — grey = sent, cyan = seen by someone */}
            {isMe && (
              <View style={{ flexDirection: "row", marginLeft: 1 }}>
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={
                    (message.seenBy?.length ?? 0) > 0
                      ? Colors.cyan
                      : "rgba(255,255,255,0.25)"
                  }
                />
                <Ionicons
                  name="checkmark"
                  size={12}
                  color={
                    (message.seenBy?.length ?? 0) > 0
                      ? Colors.cyan
                      : "rgba(255,255,255,0.25)"
                  }
                  style={{ marginLeft: -5 }}
                />
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </RNAnimated.View>
  );
}

// ─── ContextMenu ─────────────────────────────────────────────────────────────

// ─── MemberInfoSheet ──────────────────────────────────────────────────────────

function MemberInfoSheet({
  member,
  isOnline,
  isAdmin,
  onClose,
  onKick,
}: {
  member: FeedMember | null;
  isOnline: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onKick?: (memberId: string) => void;
}) {
  if (!member) return null;
  const color = colorForSender(member.id);
  return (
    <Modal
      visible={!!member}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 40,
              paddingTop: 8,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignSelf: "center",
                marginBottom: 20,
              }}
            />
            <View
              style={{ alignItems: "center", gap: 12, paddingHorizontal: 24 }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: color + "22",
                  borderWidth: 2.5,
                  borderColor: color,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color, fontSize: 26, fontFamily: "Poppins_700Bold" }}
                >
                  {member.username[0]?.toUpperCase()}
                </Text>
                {isOnline && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: "#22c55e",
                      borderWidth: 2,
                      borderColor: Colors.bg.card,
                    }}
                  />
                )}
              </View>
              <View style={{ alignItems: "center", gap: 4 }}>
                <Text
                  style={{
                    color: Colors.text.primary,
                    fontSize: 18,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  {member.username}
                </Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {isOnline && (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: "#22c55e",
                      }}
                    />
                  )}
                  <Text
                    style={{
                      color: isOnline ? "#22c55e" : Colors.text.muted,
                      fontSize: 12,
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    {isOnline ? "Online now" : "Offline"}
                  </Text>
                  {member.isAdmin && (
                    <View
                      style={{
                        backgroundColor: "rgba(6,182,212,0.15)",
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: Colors.cyan,
                          fontSize: 10,
                          fontFamily: "Poppins_700Bold",
                        }}
                      >
                        ADMIN
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 24, marginTop: 8 }}>
                <View style={{ alignItems: "center", gap: 2 }}>
                  <Text
                    style={{
                      color: Colors.text.primary,
                      fontSize: 20,
                      fontFamily: "Poppins_700Bold",
                    }}
                  >
                    {member.weeklyMessageCount}
                  </Text>
                  <Text
                    style={{
                      color: Colors.text.muted,
                      fontSize: 11,
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    this week
                  </Text>
                </View>
              </View>
              
              {/* Admin controls */}
              {isAdmin && !member.isAdmin && onKick && (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Remove member?",
                      `Remove ${member.username} from this feed?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => {
                            onKick(member.id);
                            onClose();
                          },
                        },
                      ]
                    );
                  }}
                  style={{
                    marginTop: 20,
                    backgroundColor: "rgba(239,68,68,0.1)",
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.3)",
                  }}
                >
                  <Text
                    style={{
                      color: "#ef4444",
                      fontSize: 14,
                      fontFamily: "Poppins_600SemiBold",
                      textAlign: "center",
                    }}
                  >
                    Remove from Feed
                  </Text>
                </Pressable>
              )}
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
  onForward: () => void;
};

function ContextMenu({
  visible,
  message,
  isMe,
  isAdmin,
  isPinned,
  onClose,
  onReply,
  onReact,
  onCopy,
  onEdit,
  onDelete,
  onPin,
  onForward,
}: ContextMenuProps) {
  if (!message) return null;
  const actions = [
    { icon: "arrow-undo", label: "Reply", onPress: onReply },
    { icon: "copy-outline", label: "Copy", onPress: onCopy },
    { icon: "arrow-redo-outline", label: "Forward", onPress: onForward },
    ...(isMe
      ? [{ icon: "create-outline", label: "Edit", onPress: onEdit }]
      : []),
    ...(isAdmin
      ? [
          {
            icon: isPinned ? "pin" : "pin-outline",
            label: isPinned ? "Unpin" : "Pin",
            onPress: onPin,
          },
        ]
      : []),
    ...(isMe || isAdmin
      ? [
          {
            icon: "trash-outline",
            label: "Delete",
            onPress: onDelete,
            danger: true,
          },
        ]
      : []),
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}}>
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 32,
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignSelf: "center",
                marginBottom: 12,
              }}
            />

            {/* Message preview */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingBottom: 16,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Text
                numberOfLines={2}
                style={{
                  color: Colors.text.secondary,
                  fontSize: 13,
                  fontFamily: "Poppins_400Regular",
                }}
              >
                {message.content}
              </Text>
            </View>

            {/* Emoji row */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-around",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.06)",
              }}
            >
              {REACT_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    onReact(emoji);
                    onClose();
                  }}
                  style={({ pressed }) => ({
                    transform: [{ scale: pressed ? 1.3 : 1 }],
                    padding: 6,
                  })}
                >
                  <Text style={{ fontSize: 28 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Action buttons */}
            {actions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => {
                  action.onPress();
                  onClose();
                }}
                android_ripple={{ color: "rgba(255,255,255,0.07)" }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  paddingHorizontal: 24,
                  paddingVertical: 16,
                }}
              >
                <Ionicons
                  name={action.icon as any}
                  size={22}
                  color={action.danger ? "#ef4444" : Colors.text.secondary}
                />
                <Text
                  style={{
                    color: action.danger ? "#ef4444" : Colors.text.primary,
                    fontSize: 16,
                    fontFamily: "Poppins_500Medium",
                  }}
                >
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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedMessage | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showMediaOptions, setShowMediaOptions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [forwardMsg, setForwardMsg] = useState<FeedMessage | null>(null);
  const [myFeeds, setMyFeeds] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [contextMsg, setContextMsg] = useState<FeedMessage | null>(null);
  // Edit mode
  const [editingMsg, setEditingMsg] = useState<FeedMessage | null>(null);
  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Member info sheet
  const [memberSheet, setMemberSheet] = useState<FeedMember | null>(null);
  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [voicePreview, setVoicePreview] = useState<string | null>(null);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const inputRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Track IDs we've already added so the sender's own message isn't double-added
  const seenMessageIds = useRef<Set<string>>(new Set());
  // Scroll-to-bottom FAB state
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const isAtBottomRef = useRef(true);
  // Pagination
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Offline
  const isOnline = useNetworkStatus();
  // Typing send throttle
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-member typing clear timers
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const handleForward = async (targetCode: string) => {
    if (!forwardMsg || !token) return;
    try {
      await apiFetch(`${API_URL}/feed/feeds/${targetCode}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: `↩ Forwarded: ${forwardMsg.content}` }),
      });
      setForwardMsg(null);
      Alert.alert("Forwarded", "Message forwarded successfully.");
    } catch {
      Alert.alert("Error", "Could not forward message.");
    }
  };

  const loadMyFeeds = async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API_URL}/feed/feeds`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          id: string;
          code: string;
          name: string;
        }[];
        setMyFeeds(data.filter((f) => f.code !== code));
      }
    } catch {
      /* silent */
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow microphone access to send voice messages.",
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordTimerRef.current = setInterval(
        () => setRecordingDuration((d) => d + 1),
        1000,
      );
    } catch {
      Alert.alert("Error", "Could not start recording.");
    }
  };

  const stopAndSendRecording = async () => {
    if (!recordingRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) return;
      // Show preview instead of sending immediately
      setVoicePreview(uri);
    } catch {
      Alert.alert("Error", "Could not save recording.");
    }
  };

  const sendVoiceMessage = async (uri: string) => {
    const formData = new FormData();
    if (Platform.OS === "web") {
      const blob = await fetch(uri).then((r) => r.blob());
      formData.append(
        "file",
        blob,
        blob.type.includes("webm") ? "voice.webm" : "voice.m4a",
      );
    } else {
      formData.append("file", {
        uri,
        name: "voice.m4a",
        type: "audio/m4a",
      } as any);
    }
    setSending(true);
    try {
      const uploadRes = await apiFetch(
        `${API_URL}/feed/feeds/${code}/upload-image`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      if (!uploadRes.ok) {
        Alert.alert("Upload failed", "Could not upload voice message.");
        return;
      }
      const { url } = (await uploadRes.json()) as { url: string };
      const msgRes = await apiFetch(`${API_URL}/feed/feeds/${code}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "🎤 Voice message",
          media_url: url,
          msg_type: "voice",
        }),
      });
      if (msgRes.ok) {
        const data = (await msgRes.json()) as Record<string, unknown>;
        const newMsg = mapMessage(data);
        seenMessageIds.current.add(newMsg.id);
        store.addMessage(newMsg);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          80,
        );
      }
    } catch {
      Alert.alert("Error", "Could not send voice message.");
    } finally {
      setSending(false);
      setVoicePreview(null);
    }
  };

  const cancelRecording = async () => {
    if (!recordingRef.current) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      /* ignore */
    }
    recordingRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
  };

  const handlePickImage = async () => {
    let ImagePicker: typeof import("expo-image-picker");
    try {
      ImagePicker = await import("expo-image-picker");
    } catch {
      Alert.alert(
        "Media picker unavailable",
        "Rebuild the development app after installing expo-image-picker.",
      );
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow media access to send files.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"] as any,
      quality: 0.7,
      allowsEditing: false,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const isVideo = asset.type === "video" || asset.mimeType?.startsWith("video/");
    // Size limit: 10MB images, 50MB videos
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (asset.fileSize && asset.fileSize > maxSize) {
      Alert.alert("File too large", `Max size is ${isVideo ? "50MB" : "10MB"}. Please choose a smaller file.`);
      return;
    }
    const formData = new FormData();
    if (Platform.OS === "web") {
      const blob = await fetch(asset.uri).then((r) => r.blob());
      formData.append("file", blob, asset.fileName || (isVideo ? "video.mp4" : "image.jpg"));
    } else {
      formData.append("file", {
        uri: asset.uri,
        name: asset.fileName || (isVideo ? "video.mp4" : "image.jpg"),
        type: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
      } as any);
    }
    setSending(true);
    setIsUploading(true);
    setUploadProgress(0);
    
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    try {
      const uploadRes = await apiFetch(
        `${API_URL}/feed/feeds/${code}/upload-image`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      clearInterval(progressInterval);
      if (!uploadRes.ok) {
        setUploadProgress(0);
        setIsUploading(false);
        Alert.alert("Upload failed", "Could not upload media.");
        return;
      }
      setUploadProgress(100);
      const { url } = (await uploadRes.json()) as { url: string };
      const msgRes = await apiFetch(`${API_URL}/feed/feeds/${code}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          content: isVideo ? "🎥 Video" : "📷 Image", 
          media_url: url,
          msg_type: isVideo ? "video" : "image"
        }),
      });
      if (msgRes.ok) {
        Haptics.messageSent();
        const data = (await msgRes.json()) as Record<string, unknown>;
        const newMsg = mapMessage(data);
        seenMessageIds.current.add(newMsg.id);
        store.addMessage(newMsg);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          80,
        );
      }
    } catch {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setIsUploading(false);
      Haptics.error();
      Alert.alert("Error", "Could not send media.");
    } finally {
      setSending(false);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handlePickDocument = async () => {
    let DocumentPicker: typeof import("expo-document-picker");
    try {
      DocumentPicker = await import("expo-document-picker");
    } catch {
      Alert.alert(
        "Document picker unavailable",
        "Install expo-document-picker to share files.",
      );
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const formData = new FormData();
      if (Platform.OS === "web") {
        const blob = await fetch(asset.uri).then((r) => r.blob());
        formData.append("file", blob, asset.name);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream",
        } as any);
      }
      setSending(true);
      setIsUploading(true);
      setUploadProgress(0);
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      try {
        const uploadRes = await apiFetch(
          `${API_URL}/feed/feeds/${code}/upload-image`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );
        clearInterval(progressInterval);
        if (!uploadRes.ok) {
          setUploadProgress(0);
          setIsUploading(false);
          Alert.alert("Upload failed", "Could not upload document.");
          return;
        }
        setUploadProgress(100);
        const { url } = (await uploadRes.json()) as { url: string };
        const msgRes = await apiFetch(`${API_URL}/feed/feeds/${code}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            content: `📄 ${asset.name}`, 
            media_url: url,
            msg_type: "file"
          }),
        });
        if (msgRes.ok) {
          Haptics.messageSent();
          const data = (await msgRes.json()) as Record<string, unknown>;
          const newMsg = mapMessage(data);
          seenMessageIds.current.add(newMsg.id);
          store.addMessage(newMsg);
          setTimeout(
            () => scrollRef.current?.scrollToEnd({ animated: true }),
            80,
          );
        }
      } catch {
        clearInterval(progressInterval);
        setUploadProgress(0);
        setIsUploading(false);
        Haptics.error();
        Alert.alert("Error", "Could not send document.");
      } finally {
        setSending(false);
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      }
    } catch {
      Alert.alert("Error", "Could not pick document.");
    }
  };

  const handleVote = async (msgId: string, optionIndex: number) => {
    if (!token || !code) return;
    try {
      await apiFetch(
        `${API_URL}/feed/feeds/${code}/messages/${msgId}/poll_vote`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ option_index: optionIndex }),
        },
      );
    } catch {
      /* silent */
    }
  };

  const handleCreatePoll = async () => {
    const q = pollQuestion.trim();
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    if (!token || !code) return;
    try {
      const res = await apiFetch(`${API_URL}/feed/feeds/${code}/polls`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: q, options: opts }),
      });
      if (res.ok) {
        setShowPollModal(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
      }
    } catch {
      /* silent */
    }
  };

  // Fetch member info for THIS feed so isMe always works correctly
  const loadMemberInfo = useCallback(async () => {
    if (!token || !code) return;
    try {
      const res = await apiFetch(`${API_URL}/feed/feeds/${code}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        store.setMyMemberId(data.id as string);
        // Also sync weekly count from server
        if (
          typeof data.weekly_message_count === "number" &&
          data.week_resets_at
        ) {
          store.setWeeklyCount(
            data.weekly_message_count as number,
            data.week_resets_at as string,
          );
        }
      }
    } catch {
      // silent — member info is best-effort
    }
  }, [token, code]);

  const loadMessages = useCallback(
    async (isRefresh = false) => {
      if (!token || !code) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      // Load from cache first if offline
      if (!isOnline) {
        const cached = await getCachedMessages(code);
        if (cached.length > 0) {
          cached.forEach((m) => seenMessageIds.current.add(m.id));
          store.setMessages(cached);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }

      try {
        const res = await apiFetch(
          `${API_URL}/feed/feeds/${code}/messages?limit=40`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>[];
          const mapped = data.map(mapMessage);
          mapped.forEach((m) => seenMessageIds.current.add(m.id));
          store.setMessages(mapped);
          setHasMore(data.length >= 40);
          // Cache messages for offline use
          await cacheMessages(code, mapped);
        } else if (res.status === 403) {
          Alert.alert("Access denied", "You are not a member of this feed.", [
            { text: "Join", onPress: () => router.replace("/feed/join") },
            {
              text: "Back",
              onPress: () =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/(tabs)/feed"),
            },
          ]);
        } else if (res.status === 404) {
          Alert.alert("Not found", "This feed does not exist.", [
            {
              text: "Back",
              onPress: () =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/(tabs)/feed"),
            },
          ]);
        } else {
          if (!isRefresh)
            Alert.alert(
              "Error",
              "Could not load messages. Pull down to retry.",
            );
        }
      } catch {
        // Load from cache on network error
        const cached = await getCachedMessages(code);
        if (cached.length > 0) {
          cached.forEach((m) => seenMessageIds.current.add(m.id));
          store.setMessages(cached);
        } else if (!isRefresh) {
          Alert.alert("Error", "Network error. Pull down to retry.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, code, isOnline],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!token || !code || loadingMore || !hasMore) return;
    const oldest = store.messages[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(
        `${API_URL}/feed/feeds/${code}/messages?limit=40&before_id=${oldest.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>[];
        const mapped = data.map(mapMessage);
        mapped.forEach((m) => seenMessageIds.current.add(m.id));
        store.prependMessages(mapped);
        setHasMore(data.length >= 40);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false);
    }
  }, [token, code, loadingMore, hasMore, store.messages]);

  const loadMembers = useCallback(async () => {
    if (!token || !code) return;
    try {
      const res = await apiFetch(`${API_URL}/feed/feeds/${code}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>[];
        store.setMembers(
          data.map((m) => ({
            id: m.id as string,
            feedId: (m.feed_id as string) ?? "",
            userId: (m.user_id as string) ?? "",
            username: (m.username as string) ?? "",
            isAdmin: (m.is_admin as boolean) ?? false,
            weeklyMessageCount: (m.weekly_message_count as number) ?? 0,
          })),
        );
      }
    } catch {
      /* silent */
    }
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
    const wsBase = API_URL.replace(/^https/, "wss").replace(/^http/, "ws");
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
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data: Record<string, unknown>;
          };
          if (msg.type === "new_message") {
            const newMsg = mapMessage(msg.data);
            // Only add if we haven't seen it (avoids doubling sender's own message)
            if (!seenMessageIds.current.has(newMsg.id)) {
              seenMessageIds.current.add(newMsg.id);
              store.addMessage(newMsg);
              if (isAtBottomRef.current) {
                setTimeout(
                  () => scrollRef.current?.scrollToEnd({ animated: true }),
                  80,
                );
              } else {
                setUnreadCount((n) => n + 1);
              }
            }
          } else if (msg.type === "message_deleted") {
            store.removeMessage((msg.data as { id: string }).id);
          } else if (msg.type === "message_edited") {
            const d = msg.data as {
              id: string;
              content: string;
              edited_at: string;
            };
            store.editMessage(d.id, d.content, d.edited_at);
          } else if (msg.type === "reaction_updated") {
            const d = msg.data as {
              message_id: string;
              reactions: Record<string, number>;
            };
            store.updateReactions(d.message_id, d.reactions);
          } else if (msg.type === "pin_updated") {
            const d = msg.data as { pinned_message_id: string | null };
            if (store.feed)
              store.setFeed({
                ...store.feed,
                pinnedMessageId: d.pinned_message_id ?? null,
              });
          } else if (msg.type === "message_seen") {
            const d = msg.data as { message_id: string; seen_by: string[] };
            store.updateSeenBy(d.message_id, d.seen_by);
          } else if (msg.type === "poll_updated") {
            const d = mapMessage(msg.data as Record<string, unknown>);
            store.updatePoll(d.id, d.pollVotes);
          } else if (msg.type === "typing") {
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
              store.setTypingUsers(
                store.typingUsers.filter((u) => u.id !== d.member_id),
              );
              typingClearTimers.current.delete(d.member_id);
            }, 3000);
            typingClearTimers.current.set(d.member_id, t);
          } else if (msg.type === "presence") {
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
    const show = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => show.remove();
  }, []);

  const markSeen = useCallback(
    async (msgId: string) => {
      if (!token || !code) return;
      apiFetch(`${API_URL}/feed/feeds/${code}/messages/${msgId}/seen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    },
    [token, code],
  );

  const sendMessage = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !token || !code) return;
    setSending(true);
    
    // Edit mode
    if (editingMsg) {
      try {
        const res = await fetch(`${API_URL}/feed/feeds/${code}/messages/${editingMsg.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: trimmed }),
        });
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          store.updateMessage(mapMessage(data));
          setText("");
          setEditingMsg(null);
          Haptics.messageSent();
        } else {
          Alert.alert("Error", "Could not edit message.");
        }
      } catch {
        Alert.alert("Error", "Network error.");
      } finally {
        setSending(false);
      }
      return;
    }

    const replyId = replyTo?.id ?? null;
    setText("");
    setReplyTo(null);
    try {
      const res = await fetch(`${API_URL}/feed/feeds/${code}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: trimmed, reply_to_id: replyId }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (res.ok) {
        Haptics.messageSent();
        analytics.track('message_sent', { feed_code: code });
        const mapped = mapMessage(data);
        seenMessageIds.current.add(mapped.id);
        store.addMessage(mapped);
        store.incrementWeeklyCount();
        cacheMessages(code, [...store.messages, mapped]);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          100,
        );
      } else if (res.status === 429) {
        Haptics.error();
        setShowPaywall(true);
      } else if (res.status === 422) {
        Haptics.error();
        Alert.alert(
          "Message flagged",
          "Your message was flagged by moderation. Keep it appropriate.",
        );
      } else {
        Haptics.error();
        Alert.alert(
          `Error ${res.status}`,
          String(data.detail ?? JSON.stringify(data)),
        );
      }
    } catch (err) {
      Haptics.error();
      Alert.alert("Network Error", String(err));
    } finally {
      setSending(false);
    }
  }, [text, sending, token, code, replyTo, editingMsg, store]);

  const handleReact = useCallback(
    (msgId: string, emoji: string) => {
      Haptics.reaction();
      store.addReaction(msgId, emoji);
      // Sync to backend
      fetch(`${API_URL}/feed/feeds/${code}/messages/${msgId}/react`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      }).catch(() => {});
    },
    [store, code, token],
  );

  const handlePickEmoji = useCallback(
    (msgId: string) => {
      const msg = store.messages.find((m) => m.id === msgId);
      if (msg) {
        Haptics.longPress();
        setContextMsg(msg);
      }
    },
    [store.messages],
  );

  const handleDelete = useCallback(
    async (msg: FeedMessage) => {
      Alert.alert("Delete message?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            store.removeMessage(msg.id);
            try {
              await fetch(`${API_URL}/feed/feeds/${code}/messages/${msg.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
            } catch {
              /* broadcast will sync other devices */
            }
          },
        },
      ]);
    },
    [code, token, store],
  );

  const handleEdit = useCallback((msg: FeedMessage) => {
    setEditingMsg(msg);
    setText(msg.content);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handlePin = useCallback(
    async (msg: FeedMessage) => {
      const isPinned = store.feed?.pinnedMessageId === msg.id;
      try {
        const url = isPinned
          ? `${API_URL}/feed/feeds/${code}/pin`
          : `${API_URL}/feed/feeds/${code}/pin?message_id=${msg.id}`;
        await fetch(url, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (store.feed)
          store.setFeed({
            ...store.feed,
            pinnedMessageId: isPinned ? null : msg.id,
          });
      } catch {
        /* silent */
      }
    },
    [code, token, store],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingMsg || !text.trim() || !token || !code) return;
    const newContent = text.trim();
    const oldMsg = editingMsg;
    setEditingMsg(null);
    setText("");
    store.editMessage(oldMsg.id, newContent, new Date().toISOString());
    try {
      await fetch(`${API_URL}/feed/feeds/${code}/messages/${oldMsg.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: newContent }),
      });
    } catch {
      store.editMessage(oldMsg.id, oldMsg.content, oldMsg.editedAt ?? "");
    }
  }, [editingMsg, text, code, token, store]);

  const isMuted = store.mutedFeedIds.includes(store.feed?.id ?? "");
  const isAdmin = !!store.members.find((m) => m.id === store.myMemberId)
    ?.isAdmin;

  // @mention: filter members when user types @
  const mentionMatches = useMemo(() => {
    if (!mentionQuery) return [];
    return store.members
      .filter((m) =>
        m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
      )
      .slice(0, 5);
  }, [mentionQuery, store.members]);

  // Unread divider: find first message after lastReadId
  const lastReadId = store.lastReadIds[store.feed?.id ?? ""];
  const firstUnreadIndex = lastReadId
    ? store.messages.findIndex((m) => m.id === lastReadId) + 1
    : -1;

  const remainingMessages = Math.max(0, store.weeklyLimit - store.weeklyCount);
  const atLimit = remainingMessages === 0;

  const feed = store.feed;
  // Search filter
  const messages =
    showSearch && searchQuery.trim()
      ? store.messages.filter((m) =>
          m.content.toLowerCase().includes(searchQuery.toLowerCase().trim()),
        )
      : store.messages;

  // Track last read on unmount
  useEffect(() => {
    return () => {
      const lastMsg = store.messages[store.messages.length - 1];
      if (lastMsg && store.feed?.id)
        store.setLastRead(store.feed.id, lastMsg.id);
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)/feed")
          }
          style={{ padding: 4 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
        </Pressable>

        <Pressable
          style={{ flex: 1, gap: 1 }}
          onPress={() => router.push(`/feed/info/${code}`)}
        >
          <Text
            style={{
              color: Colors.text.primary,
              fontSize: 16,
              fontFamily: "Poppins_700Bold",
            }}
            numberOfLines={1}
          >
            {feed?.name ?? `Feed · ${code}`}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {store.isConnected && (
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#22c55e",
                }}
              />
            )}
            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 11,
                fontFamily: "Poppins_400Regular",
              }}
            >
              {code} · {(feed as any)?.member_count ?? feed?.memberCount ?? "?"}{" "}
              members · Tap for info
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setShowSearch((v) => !v)}
          style={{ padding: 4 }}
        >
          <Ionicons
            name={showSearch ? "close" : "search"}
            size={18}
            color={showSearch ? Colors.cyan : Colors.text.muted}
          />
        </Pressable>
        <Pressable
          onPress={() => setShowMediaGallery(true)}
          style={{ padding: 4 }}
        >
          <Ionicons
            name="images-outline"
            size={18}
            color={Colors.text.muted}
          />
        </Pressable>
        <Pressable
          onPress={() => store.toggleMuteFeed(store.feed?.id ?? "")}
          style={{ padding: 4 }}
        >
          <Ionicons
            name={isMuted ? "notifications-off" : "notifications"}
            size={18}
            color={isMuted ? Colors.text.muted : Colors.cyan}
          />
        </Pressable>
        <Pressable onPress={() => loadMessages(true)} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={18} color={Colors.text.muted} />
        </Pressable>
        <Pressable onPress={() => router.push(`/feed/confessions?code=${code}`)} style={{ padding: 4 }}>
          <Ionicons name="eye-off" size={18} color={Colors.text.muted} />
        </Pressable>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
          }}
        >
          <TextInput
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
              color: Colors.text.primary,
              fontSize: 14,
              fontFamily: "Poppins_400Regular",
              borderWidth: 1,
              borderColor: "rgba(6,182,212,0.3)",
            }}
            placeholder="Search messages..."
            placeholderTextColor={Colors.text.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.trim() && (
            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 11,
                fontFamily: "Poppins_400Regular",
                marginTop: 4,
                marginLeft: 4,
              }}
            >
              {messages.length} result{messages.length !== 1 ? "s" : ""}
            </Text>
          )}
        </View>
      )}

      {/* Pinned message banner */}
      {feed?.pinnedMessageId &&
        (() => {
          const pinned = store.messages.find(
            (m) => m.id === feed.pinnedMessageId,
          );
          if (!pinned) return null;
          return (
            <Pressable
              onPress={() => {
                const idx = store.messages.findIndex(
                  (m) => m.id === feed.pinnedMessageId,
                );
                if (idx >= 0)
                  scrollRef.current?.scrollTo({ y: idx * 80, animated: true });
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: "rgba(6,182,212,0.08)",
                borderBottomWidth: 1,
                borderBottomColor: "rgba(6,182,212,0.15)",
              }}
            >
              <Ionicons name="pin" size={14} color={Colors.cyan} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: Colors.cyan,
                    fontSize: 10,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  Pinned message
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: Colors.text.secondary,
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {pinned.content}
                </Text>
              </View>
              {isAdmin && (
                <Pressable onPress={() => handlePin(pinned)}>
                  <Ionicons name="close" size={16} color={Colors.text.muted} />
                </Pressable>
              )}
            </Pressable>
          );
        })()}

      {/* Offline banner */}
      {!isOnline && (
        <View
          style={{
            backgroundColor: "#ef4444",
            paddingVertical: 6,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text
            style={{
              color: "#fff",
              fontSize: 12,
              fontFamily: "Poppins_600SemiBold",
            }}
          >
            No internet connection
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Messages */}
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 32 }}>💬</Text>
            <Text
              style={{
                color: Colors.text.muted,
                fontSize: 14,
                fontFamily: "Poppins_400Regular",
              }}
            >
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
              if (isAtBottomRef.current)
                scrollRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                e.nativeEvent;
              const distFromBottom =
                contentSize.height - contentOffset.y - layoutMeasurement.height;
              const atBottom = distFromBottom < 60;
              isAtBottomRef.current = atBottom;
              setIsAtBottom(atBottom);
              if (atBottom) {
                setUnreadCount(0);
                // Mark last 5 visible messages as seen
                const visible = store.messages.slice(-5);
                visible.forEach((m) => {
                  if (
                    m.senderId !== store.myMemberId &&
                    !m.seenBy?.includes(store.myMemberId ?? "")
                  ) {
                    markSeen(m.id);
                  }
                });
              }
              // Load more when scrolled near top
              if (contentOffset.y < 80 && hasMore && !loadingMore) {
                loadMoreMessages();
              }
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
            {/* Load more spinner */}
            {loadingMore && (
              <View style={{ alignItems: "center", paddingBottom: 12 }}>
                <Text
                  style={{
                    color: Colors.text.muted,
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  Loading older messages...
                </Text>
              </View>
            )}
            {messages.length === 0 ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingTop: 60,
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 40 }}>🔇</Text>
                <Text
                  style={{
                    color: Colors.text.primary,
                    fontSize: 18,
                    fontFamily: "Poppins_700Bold",
                    textAlign: "center",
                  }}
                >
                  No messages yet
                </Text>
                <Text
                  style={{
                    color: Colors.text.muted,
                    fontSize: 13,
                    fontFamily: "Poppins_400Regular",
                    textAlign: "center",
                  }}
                >
                  Be the first to say something. All anonymous.
                </Text>
              </View>
            ) : (
              messages.map((msg, index) => {
                const isMe =
                  !!store.myMemberId && msg.senderId === store.myMemberId;
                const replySource = msg.replyToId
                  ? messages.find((m) => m.id === msg.replyToId)
                  : undefined;

                // Show date separator when day changes between messages
                const prevMsg = messages[index - 1];
                const showSeparator =
                  !prevMsg ||
                  (msg.createdAt &&
                    dateSeparatorLabel(msg.createdAt) !==
                      dateSeparatorLabel(prevMsg.createdAt));

                const showUnreadDivider =
                  firstUnreadIndex === index && index > 0;

                return (
                  <View key={msg.id}>
                    {showSeparator && msg.createdAt && (
                      <DateSeparator
                        label={dateSeparatorLabel(msg.createdAt)}
                      />
                    )}
                    {showUnreadDivider && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          marginVertical: 6,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            height: 1,
                            backgroundColor: "rgba(239,68,68,0.3)",
                          }}
                        />
                        <View
                          style={{
                            backgroundColor: "rgba(239,68,68,0.12)",
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 3,
                            borderWidth: 1,
                            borderColor: "rgba(239,68,68,0.2)",
                          }}
                        >
                          <Text
                            style={{
                              color: "#ef4444",
                              fontSize: 10,
                              fontFamily: "Poppins_600SemiBold",
                            }}
                          >
                            NEW MESSAGES
                          </Text>
                        </View>
                        <View
                          style={{
                            flex: 1,
                            height: 1,
                            backgroundColor: "rgba(239,68,68,0.3)",
                          }}
                        />
                      </View>
                    )}
                    {msg.msgType === "poll" ? (
                      <PollMessage
                        message={msg}
                        myMemberId={store.myMemberId}
                        onVote={handleVote}
                      />
                    ) : (
                      <MessageBubble
                        message={msg}
                        isMe={isMe}
                        isOnline={store.onlineMemberIds.includes(msg.senderId)}
                        replySource={replySource}
                        onReply={setReplyTo}
                        onReact={handleReact}
                        onPickEmoji={handlePickEmoji}
                        searchQuery={searchQuery}
                        onAvatarPress={() => {
                          const member = store.members.find(
                            (m) => m.id === msg.senderId,
                          );
                          if (member) setMemberSheet(member);
                        }}
                      />
                    )}
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
              position: "absolute",
              bottom: store.typingUsers.length > 0 ? 100 : 70,
              right: 16,
              zIndex: 10,
              backgroundColor: Colors.bg.card,
              borderRadius: 22,
              width: 42,
              height: 42,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(6,182,212,0.3)",
              ...(Platform.OS === "web"
                ? { boxShadow: "0px 2px 8px rgba(6,182,212,0.25)" }
                : {
                    shadowColor: "#06b6d4",
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 4,
                  }),
            }}
          >
            <Ionicons name="arrow-down" size={18} color={Colors.cyan} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  backgroundColor: Colors.cyan,
                  borderRadius: 9,
                  minWidth: 18,
                  height: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 10,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        {/* Typing indicator */}
        {store.typingUsers.length > 0 && (
          <TypingIndicator users={store.typingUsers} />
        )}

        {/* Bottom bar — WhatsApp-style tray */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.05)",
            backgroundColor: "#0d1117",
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: Platform.OS === "ios" ? 20 : 10,
            gap: 6,
          }}
        >
          {/* Weekly limit bar */}
          {store.weeklyCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (store.weeklyCount / store.weeklyLimit) * 100)}%`,
                    backgroundColor: atLimit ? Colors.red : remainingMessages === 1 ? Colors.yellow : Colors.cyan,
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text style={{ color: atLimit ? Colors.red : Colors.text.muted, fontSize: 10, fontFamily: 'Poppins_600SemiBold' }}>
                {atLimit ? 'Limit reached' : `${remainingMessages} left this week`}
              </Text>
            </View>
          )}

          {/* Reply preview */}
          {replyTo && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
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
                <Text
                  style={{
                    color: Colors.cyan,
                    fontSize: 10,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  Replying to{" "}
                  {replyTo.username || `anon·${replyTo.senderId.slice(-4)}`}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: Colors.text.muted,
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
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
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderRadius: 12,
                marginHorizontal: 4,
                marginBottom: 6,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              {mentionMatches.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    const atIdx = text.lastIndexOf("@");
                    setText(text.slice(0, atIdx) + "@" + m.username + " ");
                    setMentionQuery(null);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }}
                  android_ripple={{ color: "rgba(255,255,255,0.06)" }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colorForSender(m.id) + "22",
                      borderWidth: 1.5,
                      borderColor: colorForSender(m.id),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: colorForSender(m.id),
                        fontSize: 11,
                        fontFamily: "Poppins_700Bold",
                      }}
                    >
                      {m.username[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: Colors.text.primary,
                      fontSize: 14,
                      fontFamily: "Poppins_500Medium",
                    }}
                  >
                    @{m.username}
                  </Text>
                  {store.onlineMemberIds.includes(m.id) && (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: "#22c55e",
                      }}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* Edit mode banner */}
          {/* Recording banner */}
          {isRecording && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: "rgba(239,68,68,0.1)",
                borderTopWidth: 1,
                borderTopColor: "rgba(239,68,68,0.2)",
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: "#ef4444",
                }}
              />
              <Text
                style={{
                  color: "#ef4444",
                  fontSize: 13,
                  fontFamily: "Poppins_600SemiBold",
                  flex: 1,
                }}
              >
                Recording... {Math.floor(recordingDuration / 60)}:
                {String(recordingDuration % 60).padStart(2, "0")}
              </Text>
              <Pressable onPress={cancelRecording}>
                <Ionicons name="close" size={18} color={Colors.text.muted} />
              </Pressable>
            </View>
          )}

          {editingMsg && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(139,92,246,0.12)",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderLeftWidth: 2,
                borderLeftColor: "#8b5cf6",
                gap: 10,
              }}
            >
              <Ionicons name="create-outline" size={14} color="#8b5cf6" />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#8b5cf6",
                    fontSize: 10,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  Editing message
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: Colors.text.muted,
                    fontSize: 12,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {editingMsg.content}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setEditingMsg(null);
                  setText("");
                }}
              >
                <Ionicons name="close" size={16} color={Colors.text.muted} />
              </Pressable>
            </View>
          )}

          {/* Upload progress */}
          {isUploading && (
            <Animated.View entering={SlideInUp.springify()} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg.card, borderRadius: 12, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text.primary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 }}>
                    Uploading... {uploadProgress}%
                  </Text>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                    <Animated.View style={{ width: `${uploadProgress}%`, height: '100%', backgroundColor: Colors.cyan, borderRadius: 2 }} />
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Input row — WhatsApp style */}
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
          >
            {/* Pill input with icons tucked inside */}
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "flex-end",
                backgroundColor: "rgba(255,255,255,0.08)",
                borderRadius: 26,
                paddingHorizontal: 4,
                paddingVertical: 4,
                minHeight: 48,
              }}
            >
              {/* Left toggle icon */}
              {!editingMsg && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-end",
                    paddingBottom: 2,
                    paddingLeft: 2,
                  }}
                >
                  <Pressable
                    onPress={() => setShowMediaOptions(!showMediaOptions)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={showMediaOptions ? "close" : "add"}
                      size={22}
                      color={showMediaOptions ? Colors.cyan : Colors.text.muted}
                    />
                  </Pressable>
                  {showMediaOptions && (
                    <>
                      <Pressable
                        onPress={() => { handlePickImage(); setShowMediaOptions(false); }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="image-outline"
                          size={20}
                          color={Colors.text.muted}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => { handlePickDocument(); setShowMediaOptions(false); }}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="document-outline"
                          size={20}
                          color={Colors.text.muted}
                        />
                      </Pressable>
                    </>
                  )}
                </View>
              )}

              {/* Text input */}
              <TextInput
                style={{
                  flex: 1,
                  color: Colors.text.primary,
                  fontSize: 15,
                  fontFamily: "Poppins_400Regular",
                  paddingHorizontal: 6,
                  paddingVertical: 10,
                  maxHeight: 120,
                  alignSelf: "center",
                }}
                placeholder="Message"
                placeholderTextColor={Colors.text.muted}
                value={text}
                onChangeText={(v) => {
                  setText(v.slice(0, 1000));
                  // Throttle: send typing event at most every 2s
                  if (
                    !typingTimerRef.current &&
                    wsRef.current?.readyState === 1
                  ) {
                    wsRef.current.send(JSON.stringify({ type: "typing" }));
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

              {/* Right padding so text doesn't crowd the edge */}
              <View style={{ width: 4 }} />
            </View>

            {/* Send / mic / stop button — green circle like WhatsApp */}
            <Pressable
              onPress={
                isRecording
                  ? stopAndSendRecording
                  : editingMsg
                    ? handleSaveEdit
                    : text.trim()
                      ? sendMessage
                      : startRecording
              }
              disabled={sending}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isRecording
                  ? "#ef4444"
                  : text.trim() || editingMsg
                    ? "#25D366"
                    : "#25D366",
                opacity: sending ? 0.6 : 1,
                ...(Platform.OS === "web"
                  ? { boxShadow: "0px 2px 4px rgba(0,0,0,0.25)" }
                  : {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 4,
                      elevation: 4,
                    }),
              }}
            >
              <Ionicons
                name={
                  sending
                    ? "hourglass-outline"
                    : isRecording
                      ? "stop"
                      : editingMsg
                        ? "checkmark"
                        : text.trim()
                          ? "send"
                          : "mic"
                }
                size={20}
                color="#fff"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Poll creation modal */}
      <Modal
        visible={showPollModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPollModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
          onPress={() => setShowPollModal(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                gap: 16,
                borderTopWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons
                  name="stats-chart-outline"
                  size={18}
                  color={Colors.cyan}
                />
                <Text
                  style={{
                    color: Colors.text.primary,
                    fontSize: 16,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  Create Poll
                </Text>
              </View>
              <TextInput
                style={{
                  backgroundColor: Colors.bg.primary,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  color: Colors.text.primary,
                  fontSize: 14,
                  fontFamily: "Poppins_400Regular",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
                placeholder="Ask a question..."
                placeholderTextColor={Colors.text.muted}
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={200}
              />
              <View style={{ gap: 8 }}>
                {pollOptions.map((opt, idx) => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <TextInput
                      style={{
                        flex: 1,
                        backgroundColor: Colors.bg.primary,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        color: Colors.text.primary,
                        fontSize: 13,
                        fontFamily: "Poppins_400Regular",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                      placeholder={`Option ${idx + 1}`}
                      placeholderTextColor={Colors.text.muted}
                      value={opt}
                      onChangeText={(v) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = v;
                        setPollOptions(newOpts);
                      }}
                      maxLength={80}
                    />
                    {pollOptions.length > 2 && (
                      <Pressable
                        onPress={() =>
                          setPollOptions(
                            pollOptions.filter((_, i) => i !== idx),
                          )
                        }
                      >
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color={Colors.text.muted}
                        />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pollOptions.length < 4 && (
                  <Pressable
                    onPress={() => setPollOptions([...pollOptions, ""])}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingVertical: 4,
                    }}
                  >
                    <Ionicons
                      name="add-circle-outline"
                      size={16}
                      color={Colors.cyan}
                    />
                    <Text
                      style={{
                        color: Colors.cyan,
                        fontSize: 13,
                        fontFamily: "Poppins_500Medium",
                      }}
                    >
                      Add option
                    </Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={handleCreatePoll}
                disabled={
                  !pollQuestion.trim() || pollOptions.filter(Boolean).length < 2
                }
                style={{
                  backgroundColor: Colors.cyan,
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: "center",
                  opacity:
                    !pollQuestion.trim() ||
                    pollOptions.filter(Boolean).length < 2
                      ? 0.4
                      : 1,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  Post Poll
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Context menu */}
      <ContextMenu
        visible={!!contextMsg}
        message={contextMsg}
        isMe={
          !!contextMsg &&
          !!store.myMemberId &&
          contextMsg.senderId === store.myMemberId
        }
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
        onForward={() => {
          setForwardMsg(contextMsg);
          setContextMsg(null);
          loadMyFeeds();
        }}
      />

      {/* Member info sheet */}
      <MemberInfoSheet
        member={memberSheet}
        isOnline={
          !!memberSheet && store.onlineMemberIds.includes(memberSheet.id)
        }
        isAdmin={isAdmin}
        onClose={() => setMemberSheet(null)}
        onKick={async (memberId) => {
          try {
            await apiFetch(`${API_URL}/feed/feeds/${code}/members/${memberId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            store.setMembers(store.members.filter(m => m.id !== memberId));
            Haptics.success();
          } catch {
            Alert.alert("Error", "Could not remove member.");
          }
        }}
      />

      {/* Forward modal */}
      <Modal
        visible={!!forwardMsg}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardMsg(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
          onPress={() => setForwardMsg(null)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: Colors.bg.card,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 24,
                gap: 14,
                borderTopWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                maxHeight: 420,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons
                  name="arrow-redo-outline"
                  size={18}
                  color={Colors.cyan}
                />
                <Text
                  style={{
                    color: Colors.text.primary,
                    fontSize: 16,
                    fontFamily: "Poppins_700Bold",
                  }}
                >
                  Forward to Feed
                </Text>
              </View>
              {forwardMsg && (
                <View
                  style={{
                    backgroundColor: Colors.bg.primary,
                    borderRadius: 10,
                    padding: 10,
                    borderLeftWidth: 3,
                    borderLeftColor: Colors.cyan,
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      color: Colors.text.secondary,
                      fontSize: 12,
                      fontFamily: "Poppins_400Regular",
                    }}
                  >
                    {forwardMsg.content}
                  </Text>
                </View>
              )}
              <ScrollView
                style={{ maxHeight: 260 }}
                showsVerticalScrollIndicator={false}
              >
                {myFeeds.length === 0 ? (
                  <Text
                    style={{
                      color: Colors.text.muted,
                      fontSize: 13,
                      fontFamily: "Poppins_400Regular",
                      textAlign: "center",
                      paddingVertical: 20,
                    }}
                  >
                    No other feeds to forward to.
                  </Text>
                ) : (
                  myFeeds.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => handleForward(f.code)}
                      style={{
                        paddingVertical: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: "rgba(255,255,255,0.05)",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            color: Colors.text.primary,
                            fontSize: 14,
                            fontFamily: "Poppins_600SemiBold",
                          }}
                        >
                          {f.name}
                        </Text>
                        <Text
                          style={{
                            color: Colors.text.muted,
                            fontSize: 11,
                            fontFamily: "Poppins_400Regular",
                          }}
                        >
                          {f.code}
                        </Text>
                      </View>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color={Colors.cyan}
                      />
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Voice preview modal */}
      <Modal
        visible={!!voicePreview}
        transparent
        animationType="fade"
        onRequestClose={() => setVoicePreview(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.8)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: Colors.bg.card,
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 320,
              gap: 16,
            }}
          >
            <Text
              style={{
                color: Colors.text.primary,
                fontSize: 18,
                fontFamily: "Poppins_600SemiBold",
                textAlign: "center",
              }}
            >
              Voice Message Preview
            </Text>
            {voicePreview && <VoiceBubble url={voicePreview} color={Colors.cyan} />}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                onPress={() => setVoicePreview(null)}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: Colors.text.secondary,
                    fontSize: 15,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => voicePreview && sendVoiceMessage(voicePreview)}
                disabled={sending}
                style={{
                  flex: 1,
                  backgroundColor: Colors.cyan,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                  opacity: sending ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontFamily: "Poppins_600SemiBold",
                  }}
                >
                  {sending ? "Sending..." : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Media gallery */}
      <Modal
        visible={showMediaGallery}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMediaGallery(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.bg.primary }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.06)",
              }}
            >
              <Pressable onPress={() => setShowMediaGallery(false)}>
                <Ionicons name="close" size={24} color={Colors.text.primary} />
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  color: Colors.text.primary,
                  fontSize: 18,
                  fontFamily: "Poppins_600SemiBold",
                  marginLeft: 16,
                }}
              >
                Media Gallery
              </Text>
            </View>
            <ScrollView
              contentContainerStyle={{
                flexDirection: "row",
                flexWrap: "wrap",
                padding: 4,
              }}
            >
              {store.messages
                .filter((m) => m.mediaUrl && (m.msgType === "image" || m.msgType === "video"))
                .reverse()
                .map((msg) => (
                  <Pressable
                    key={msg.id}
                    onPress={() => {
                      const { Linking } = require("react-native");
                      Linking.openURL(msg.mediaUrl!);
                    }}
                    style={{
                      width: "33.33%",
                      aspectRatio: 1,
                      padding: 2,
                    }}
                  >
                    <Image
                      source={{ uri: msg.mediaUrl! }}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 4,
                      }}
                      resizeMode="cover"
                    />
                    {msg.msgType === "video" && (
                      <View
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          backgroundColor: "rgba(0,0,0,0.6)",
                          borderRadius: 12,
                          padding: 4,
                        }}
                      >
                        <Ionicons name="play" size={16} color="#fff" />
                      </View>
                    )}
                  </Pressable>
                ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Voice preview, media gallery, forward modals */}
      <VoicePreviewModal
        visible={!!voicePreview}
        voiceUri={voicePreview}
        sending={sending}
        onCancel={() => setVoicePreview(null)}
        onSend={sendVoiceMessage}
      />

      <MediaGalleryModal
        visible={showMediaGallery}
        messages={store.messages}
        onClose={() => setShowMediaGallery(false)}
      />

      <ForwardModal
        visible={!!forwardMsg}
        message={forwardMsg}
        feeds={myFeeds}
        onClose={() => setForwardMsg(null)}
        onForward={handleForward}
      />

      {/* Paywall */}
      {showPaywall && (
        <FeedPaywall
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          onUpgrade={() => setShowPaywall(false)}
        />
      )}
    </SafeAreaView>
  );
}
