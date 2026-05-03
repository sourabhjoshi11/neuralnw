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
  joinOrder: number;
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
  currentTurn: string | null;
  createdAt: string;
};

export type GamePhase =
  | 'lobby'
  | 'spinning'
  | 'choice'
  | 'truth_question'
  | 'truth_answer'
  | 'truth_revealed'
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
  | { type: 'state_sync'; data: Record<string, unknown> }
  | { type: 'player_join'; data: Record<string, unknown> }
  | { type: 'player_leave'; data: { playerId: string } }
  | { type: 'game_start'; data: Record<string, unknown> }
  | { type: 'spin_start'; data: Record<string, unknown> }
  | { type: 'spin_result'; data: Record<string, unknown> }
  | { type: 'choice_made'; data: { choice: 'truth' | 'dare' } }
  | { type: 'content_shown'; data: Record<string, unknown> }
  | { type: 'answer_submitted'; data: Record<string, unknown> }
  | { type: 'vote_update'; data: { votes: Vote[]; total: number } }
  | { type: 'reaction'; data: Record<string, unknown> }
  | { type: 'comment'; data: Record<string, unknown> }
  | { type: 'phase_change'; data: Record<string, unknown> }
  | { type: 'points_update'; data: Record<string, unknown> }
  | { type: 'blackout_start'; data: Record<string, unknown> }
  | { type: 'punishment_vote_result'; data: { result: 'ban' | 'reveal'; targetId: string } }
  | { type: 'identity_reveal'; data: { playerId: string; realName: string; phoneLast4: string } }
  | { type: 'game_end'; data: Record<string, unknown> }
  | { type: 'player_colors_shuffle'; data: { color_map: Record<string, string> } }
  | { type: 'dare_result'; data: Record<string, unknown> }
  | { type: 'skip_life_used'; data: Record<string, unknown> }
  | { type: 'error'; data: { message: string } }
  | { type: 'ping'; data: Record<string, never> }
  | { type: 'pong'; data: Record<string, never> };
