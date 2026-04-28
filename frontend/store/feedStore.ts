import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Feed, FeedMessage } from '@/types';

type FeedState = {
  feed: Feed | null;
  messages: FeedMessage[];
  weeklyCount: number;
  weeklyLimit: number;
  resetAt: string | null;
  isConnected: boolean;
  typingUsers: { id: string; username: string }[];

  setFeed: (feed: Feed) => void;
  setMessages: (messages: FeedMessage[]) => void;
  prependMessages: (messages: FeedMessage[]) => void;
  addMessage: (message: FeedMessage) => void;
  removeMessage: (messageId: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  setWeeklyCount: (count: number, resetAt: string) => void;
  incrementWeeklyCount: () => void;
  setConnected: (connected: boolean) => void;
  setTypingUsers: (users: { id: string; username: string }[]) => void;
  clearFeed: () => void;
};

export const useFeedStore = create<FeedState>()(
  persist(
    (set) => ({
      feed: null,
      messages: [],
      weeklyCount: 0,
      weeklyLimit: 5,
      resetAt: null,
      isConnected: false,
      typingUsers: [],

      setFeed: (feed) => set({ feed }),

      setMessages: (messages) => set({ messages }),

      prependMessages: (messages) =>
        set((state) => ({ messages: [...messages, ...state.messages] })),

      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),

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

      clearFeed: () =>
        set({
          feed: null,
          messages: [],
          weeklyCount: 0,
          resetAt: null,
          isConnected: false,
          typingUsers: [],
        }),
    }),
    {
      name: 'classchaos-feed',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        feed: state.feed,
        weeklyCount: state.weeklyCount,
        resetAt: state.resetAt,
      }),
    }
  )
);
