import type { AnonPlayer } from '@/types';

export function mapAnyPlayer(p: Record<string, unknown>): AnonPlayer {
  return {
    id: p.id as string,
    userId: ((p.user_id ?? p.userId) as string) ?? '',
    username: ((p.username ?? p.un) as string) ?? '?',
    color: (p.color as string) ?? '#3b82f6',
    points: ((p.points ?? p.pts) as number) ?? 0,
    lives: (p.lives as number) ?? 1,
    skipsUsed: ((p.skips_used ?? p.skips) as number) ?? 0,
    isBlackedOut: ((p.is_blacked_out ?? p.blacked_out) as boolean) ?? false,
    blackoutEndsAt: ((p.blackout_ends_at ?? p.blackoutEndsAt) as string | null) ?? null,
    turnCount: ((p.turn_count ?? p.turnCount) as number) ?? 0,
    lastTurnAt: ((p.last_turn_at ?? p.lastTurnAt) as string | null) ?? null,
    joinOrder: ((p.join_order ?? p.joinOrder) as number) ?? 0,
  };
}
