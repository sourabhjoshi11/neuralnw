import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feed, FeedMessage } from '@/types';

type FeedState = {
  myFeeds: Feed[];
  feed: Feed | null;
  myMemberId: string | null;
  messages: FeedMessage[];
  weeklyCount: number;
  weeklyLimit: number;
  resetAt: string | null;
  isConnected: boolean;
  typingUsers: { id: string; username: string }[];
  onlineMemberIds: string[];
  mutedFeedIds: string[];
  lastReadIds: Record<string, string>; // feedId -> last read messageId
  members: import('@/types').FeedMember[];

  setMyFeeds: (feeds: Feed[]) => void;
  addMyFeed: (feed: Feed) => void;
  setFeed: (feed: Feed) => void;
  setMyMemberId: (id: string) => void;
  setMessages: (messages: FeedMessage[]) => void;
  prependMessages: (messages: FeedMessage[]) => void;
  addMessage: (message: FeedMessage) => void;
  removeMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  setWeeklyCount: (count: number, resetAt: string) => void;
  incrementWeeklyCount: () => void;
  setConnected: (connected: boolean) => void;
  setTypingUsers: (users: { id: string; username: string }[]) => void;
  addOnlineMember: (id: string) => void;
  removeOnlineMember: (id: string) => void;
  editMessage: (messageId: string, content: string, editedAt: string) => void;
  updateMessage: (message: FeedMessage) => void;
  updateReactions: (messageId: string, reactions: Record<string, number>) => void;
  updatePoll: (messageId: string, pollVotes: Record<string, string[]> | null) => void;
  updateSeenBy: (messageId: string, seenBy: string[]) => void;
  toggleMuteFeed: (feedId: string) => void;
  setLastRead: (feedId: string, messageId: string) => void;
  setMembers: (members: import('@/types').FeedMember[]) => void;
  clearFeed: () => void;
};

export const useFeedStore = create<FeedState>()(
  persist(
    (set) => ({
      myFeeds: [],
      feed: null,
      myMemberId: null,
      messages: [],
      weeklyCount: 0,
      weeklyLimit: 5,
      resetAt: null,
      isConnected: false,
      typingUsers: [],
      onlineMemberIds: [],
      mutedFeedIds: [],
      lastReadIds: {},
      members: [],

      setMyFeeds: (myFeeds) => set({ myFeeds }),
      addMyFeed: (feed) => set((state) => ({
        myFeeds: [feed, ...state.myFeeds.filter((f) => f.id !== feed.id)],
      })),
      setFeed: (feed) => set({ feed }),

      setMyMemberId: (myMemberId) => set({ myMemberId }),

      // Deduplicate on set — safety net against double-loads
      setMessages: (messages) =>
        set({ messages: messages.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i) }),

      prependMessages: (messages) =>
        set((state) => {
          const existingIds = new Set(state.messages.map((m) => m.id));
          return { messages: [...messages.filter((m) => !existingIds.has(m.id)), ...state.messages] };
        }),

      // Idempotent: silently skip if ID already present
      addMessage: (message) =>
        set((state) =>
          state.messages.some((m) => m.id === message.id)
            ? state
            : { messages: [...state.messages, message] }
        ),

      removeMessage: (messageId) =>
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== messageId),
        })),

      addReaction: (messageId, emoji) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  reactions: {
                    ...m.reactions,
                    [emoji]: (m.reactions[emoji] ?? 0) + 1,
                  },
                }
              : m
          ),
        })),

      setWeeklyCount: (weeklyCount, resetAt) => set({ weeklyCount, resetAt }),

      incrementWeeklyCount: () =>
        set((state) => ({ weeklyCount: state.weeklyCount + 1 })),

      setConnected: (isConnected) => set({ isConnected }),

      setTypingUsers: (typingUsers) => set({ typingUsers }),

      editMessage: (messageId, content, editedAt) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, content, editedAt } : m
          ),
        })),

      updateMessage: (message: FeedMessage) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === message.id ? message : m
          ),
        })),

      updateReactions: (messageId, reactions) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        })),

      updatePoll: (messageId, pollVotes) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, pollVotes } : m
          ),
        })),

      updateSeenBy: (messageId, seenBy) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, seenBy } : m
          ),
        })),

      toggleMuteFeed: (feedId) =>
        set((state) => ({
          mutedFeedIds: state.mutedFeedIds.includes(feedId)
            ? state.mutedFeedIds.filter((id) => id !== feedId)
            : [...state.mutedFeedIds, feedId],
        })),

      setLastRead: (feedId, messageId) =>
        set((state) => ({
          lastReadIds: { ...state.lastReadIds, [feedId]: messageId },
        })),

      setMembers: (members) => set({ members }),

      addOnlineMember: (id) =>
        set((state) => ({
          onlineMemberIds: state.onlineMemberIds.includes(id)
            ? state.onlineMemberIds
            : [...state.onlineMemberIds, id],
        })),

      removeOnlineMember: (id) =>
        set((state) => ({
          onlineMemberIds: state.onlineMemberIds.filter((mid) => mid !== id),
        })),

      clearFeed: () =>
        set({
          feed: null,
          myMemberId: null,
          messages: [],
          weeklyCount: 0,
          resetAt: null,
          isConnected: false,
          typingUsers: [],
          onlineMemberIds: [],
          members: [],
          mutedFeedIds: [],
          lastReadIds: {},
        }),
    }),
    {
      name: 'classchaos-feed',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        myFeeds: state.myFeeds,
        feed: state.feed,
        myMemberId: state.myMemberId,
        weeklyCount: state.weeklyCount,
        resetAt: state.resetAt,
        mutedFeedIds: state.mutedFeedIds,
        lastReadIds: state.lastReadIds,
      }),
    }
  )
);
