export type User = {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
  isPremium: boolean;
  isBanned: boolean;
};

export type AnonPlayer = {
  id: string;
  userId: string;
  username: string;
  color: string;
  points: number;
  lives: number;
  skipsUsed: number;
  isBlackedOut: boolean;
  blackoutEndsAt: string | null;
  turnCount: number;
  lastTurnAt: string | null;
};

export type Room = {
  id: string;
  code: string;
  hostId: string;
  status: 'waiting' | 'active' | 'ended';
  durationMinutes: number;
  startsAt: string | null;
  endsAt: string | null;
  playerCount: number;
  maxPlayers: number;
  currentTurn: string | null;
  createdAt: string;
};

export type GamePhase =
  | 'lobby'
  | 'spinning'
  | 'choice'
  | 'truth_question'
  | 'truth_answer'
  | 'dare_show'
  | 'dare_vote'
  | 'reaction'
  | 'skip_blackout'
  | 'punishment_vote'
  | 'identity_reveal'
  | 'ended';

export type TruthOrDare = {
  id: string;
  type: 'truth' | 'dare';
  content: string;
  points: number;
};

export type Vote = {
  playerId: string;
  value: 'yes' | 'no' | 'a' | 'b';
};

export type Reaction = {
  id: string;
  playerId: string;
  emoji: '😂' | '😱' | '🔥' | '❤️' | '💀';
  createdAt: string;
};

export type Comment = {
  id: string;
  playerId: string;
  username: string;
  color: string;
  text: string;
  createdAt: string;
};

export type Feed = {
  id: string;
  code: string;
  adminId: string;
  name: string;
  memberCount: number;
  createdAt: string;
};

export type FeedMessage = {
  id: string;
  feedId: string;
  senderId: string;
  username: string;
  content: string;
  replyToId: string | null;
  reactions: Record<string, number>;
  createdAt: string;
  expiresAt: string;
};

export type WSMessage =
  | { type: 'player_join'; data: { player: AnonPlayer } }
  | { type: 'player_leave'; data: { playerId: string } }
  | { type: 'game_start'; data: { startsAt: string; endsAt: string } }
  | { type: 'spin_start'; data: { serverTime: string } }
  | { type: 'spin_result'; data: { targetPlayerId: string; targetColor: string } }
  | { type: 'choice_made'; data: { choice: 'truth' | 'dare' } }
  | { type: 'content_shown'; data: { content: TruthOrDare } }
  | { type: 'answer_submitted'; data: { answer: string } }
  | { type: 'vote_update'; data: { votes: Vote[]; total: number } }
  | { type: 'reaction'; data: Reaction }
  | { type: 'comment'; data: Comment }
  | { type: 'phase_change'; data: { phase: GamePhase; endsAt?: string } }
  | { type: 'points_update'; data: { playerId: string; points: number; delta: number } }
  | { type: 'blackout_start'; data: { playerId: string; duration: number; message: string } }
  | { type: 'punishment_vote_result'; data: { result: 'ban' | 'reveal'; targetId: string } }
  | { type: 'identity_reveal'; data: { playerId: string; realName: string; phoneLast4: string } }
  | { type: 'game_end'; data: { leaderboard: AnonPlayer[]; lastPlaceReveal: { name: string; phoneLast4: string } | null } }
  | { type: 'player_colors_shuffle'; data: { colorMap: Record<string, string> } }
  | { type: 'error'; data: { message: string } }
  | { type: 'ping'; data: Record<string, never> }
  | { type: 'pong'; data: Record<string, never> };
