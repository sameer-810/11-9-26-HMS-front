/**
 * Whose queued write this is. Pure, so the rule can be tested without a device.
 *
 * A queued observation is a clinical statement made by one person in one
 * hospital. It is filed only with that person's own session — never under
 * whoever happens to be signed in on the shared tablet when the WiFi returns.
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

export function ownerOf(user: { id?: string | null; hospitalId?: string | null } | null | undefined): OutboxOwner | null {
  if (!user?.id || !user.hospitalId) return null;
  return { userId: user.id, hospitalId: user.hospitalId };
}

export function belongsTo(op: OwnedOp, owner: OutboxOwner | null): boolean {
  if (!owner || !op.userId || op.userId !== owner.userId) return false;
  // A user id already identifies one account in one hospital; the hospital is
  // checked too so that holds even if accounts are ever shared across tenants.
  // Ops from before it was recorded are matched on the user alone rather than
  // stranded.
  return op.hospitalId === undefined || op.hospitalId === owner.hospitalId;
}

export function sameOwner(a: OutboxOwner | null, b: OutboxOwner | null): boolean {
  return Boolean(a && b && a.userId === b.userId && a.hospitalId === b.hospitalId);
}
