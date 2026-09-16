/**
 * Outbox ownership rules (pure, testable): a queued write is only sent under its author's session,
 * never whoever is signed in on a shared device when it reconnects.
 */

export interface OutboxOwner {
  userId: string;
  hospitalId: string;
}

export interface OwnedOp {
  userId: string;
  /** Absent on ops queued before the hospital was recorded. */
  hospitalId?: string;
}

export function ownerOf(
  user: { id?: string | null; hospitalId?: string | null } | null | undefined,
): OutboxOwner | null {
  if (!user?.id || !user.hospitalId) return null;
  return { userId: user.id, hospitalId: user.hospitalId };
}

export function belongsTo(op: OwnedOp, owner: OutboxOwner | null): boolean {
  if (!owner || !op.userId || op.userId !== owner.userId) return false;
  // Hospital is checked as a defensive extra; legacy ops without it match on user alone.
  return op.hospitalId === undefined || op.hospitalId === owner.hospitalId;
}

export function sameOwner(
  a: OutboxOwner | null,
  b: OutboxOwner | null,
): boolean {
  return Boolean(
    a && b && a.userId === b.userId && a.hospitalId === b.hospitalId,
  );
}
