import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Room, AnonPlayer, GamePhase, TruthOrDare, Vote, Reaction, Comment } from '@/types';

type GameState = {
  room: Room | null;
  players: AnonPlayer[];
  myPlayer: AnonPlayer | null;
  phase: GamePhase;
  currentTurnPlayerId: string | null;
  currentContent: TruthOrDare | null;
  currentAnswer: string | null;
  votes: Vote[];
  reactions: Reaction[];
  comments: Comment[];
  phaseEndsAt: string | null;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;

  setRoom: (room: Room) => void;
  setPlayers: (players: AnonPlayer[]) => void;
  addPlayer: (player: AnonPlayer) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerId: string, updates: Partial<AnonPlayer>) => void;
  setMyPlayer: (player: AnonPlayer) => void;
  setPhase: (phase: GamePhase, endsAt?: string) => void;
  setCurrentTurn: (playerId: string | null) => void;
  setCurrentContent: (content: TruthOrDare | null) => void;
  setCurrentAnswer: (answer: string | null) => void;
  setVotes: (votes: Vote[]) => void;
  addReaction: (reaction: Reaction) => void;
  addComment: (comment: Comment) => void;
  updateColorMap: (colorMap: Record<string, string>) => void;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  clearGame: () => void;
};

const initialState = {
  room: null,
  players: [],
  myPlayer: null,
  phase: 'lobby' as GamePhase,
  currentTurnPlayerId: null,
  currentContent: null,
  currentAnswer: null,
  votes: [],
  reactions: [],
  comments: [],
  phaseEndsAt: null,
  isConnected: false,
  isReconnecting: false,
  reconnectAttempts: 0,
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...initialState,

      setRoom: (room) => set({ room }),

      setPlayers: (players) => set({ players }),

      addPlayer: (player) =>
        set((state) => ({
          players: [...state.players.filter((p) => p.id !== player.id), player],
        })),

      removePlayer: (playerId) =>
        set((state) => ({
          players: state.players.filter((p) => p.id !== playerId),
        })),

      updatePlayer: (playerId, updates) =>
        set((state) => ({
          players: state.players.map((p) =>
            p.id === playerId ? { ...p, ...updates } : p
          ),
          myPlayer:
            state.myPlayer?.id === playerId
              ? { ...state.myPlayer, ...updates }
              : state.myPlayer,
        })),

      setMyPlayer: (player) => set({ myPlayer: player }),

      setPhase: (phase, endsAt) => set({ phase, phaseEndsAt: endsAt ?? null }),

      setCurrentTurn: (currentTurnPlayerId) => set({ currentTurnPlayerId }),

      setCurrentContent: (currentContent) =>
        set({ currentContent, votes: [], reactions: [], comments: [] }),

      setCurrentAnswer: (currentAnswer) => set({ currentAnswer }),

      setVotes: (votes) => set({ votes }),

      addReaction: (reaction) =>
        set((state) => ({ reactions: [...state.reactions, reaction] })),

      addComment: (comment) =>
        set((state) => ({ comments: [...state.comments, comment] })),

      updateColorMap: (colorMap) =>
        set((state) => ({
          players: state.players.map((p) =>
            colorMap[p.id] ? { ...p, color: colorMap[p.id] } : p
          ),
          myPlayer:
            state.myPlayer && colorMap[state.myPlayer.id]
              ? { ...state.myPlayer, color: colorMap[state.myPlayer.id] }
              : state.myPlayer,
        })),

      setConnected: (isConnected) => set({ isConnected }),

      setReconnecting: (isReconnecting) => set({ isReconnecting }),

      incrementReconnectAttempts: () =>
        set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),

      resetReconnectAttempts: () => set({ reconnectAttempts: 0, isReconnecting: false }),

      clearGame: () => set(initialState),
    }),
    {
      name: 'classchaos-game',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        room: state.room,
        myPlayer: state.myPlayer,
        players: state.players,
        phase: state.phase,
        phaseEndsAt: state.phaseEndsAt,
        currentTurnPlayerId: state.currentTurnPlayerId,
      }),
    }
  )
);
