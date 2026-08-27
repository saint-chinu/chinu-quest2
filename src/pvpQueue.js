/**
 * Tracks the highest event id that has been processed without a gap.
 *
 * Firestore may coalesce snapshots and future implementations may process a
 * high-priority event early.  Acknowledging that event's id as a simple
 * "maximum" would make the host discard older, still-unplayed events.  This
 * tracker advances only through the received order's contiguous processed
 * prefix, so reconnect/replay remains safe even if execution order changes.
 */
export class PvpContiguousAckTracker {
  constructor(ackedThrough = 0) {
    this.ackedThrough = Number(ackedThrough) || 0;
    this.pendingOrder = [];
    this.received = new Set();
    this.processed = new Set();
  }

  advanceBase(ackedThrough) {
    const nextBase = Number(ackedThrough) || 0;
    if (nextBase <= this.ackedThrough) return this.ackedThrough;
    this.ackedThrough = nextBase;
    this.pendingOrder = this.pendingOrder.filter((id) => id > nextBase);
    for (const id of this.received) if (id <= nextBase) this.received.delete(id);
    for (const id of this.processed) if (id <= nextBase) this.processed.delete(id);
    return this.ackedThrough;
  }

  noteReceived(id) {
    const eventId = Number(id) || 0;
    if (eventId <= this.ackedThrough || this.received.has(eventId)) return false;
    this.received.add(eventId);
    this.pendingOrder.push(eventId);
    return true;
  }

  markProcessed(id) {
    const eventId = Number(id) || 0;
    if (eventId <= this.ackedThrough) return this.ackedThrough;
    this.processed.add(eventId);
    while (this.pendingOrder.length > 0 && this.processed.has(this.pendingOrder[0])) {
      const next = this.pendingOrder.shift();
      this.processed.delete(next);
      this.received.delete(next);
      this.ackedThrough = next;
    }
    return this.ackedThrough;
  }
}

/**
 * Keep event order intact and shorten only guest-side movement animation when
 * the relay queue is falling behind.  The normal path remains visually
 * unchanged; deep backlogs catch up without moving prompts ahead of pieces.
 */
export function pvpQueueAnimationScale(queueDepth) {
  const depth = Math.max(0, Number(queueDepth) || 0);
  if (depth >= 16) return 0.4;
  if (depth >= 10) return 0.55;
  if (depth >= 6) return 0.75;
  return 1;
}

/**
 * Reserve 1,000 sequence numbers per millisecond.  Date.now() alone can move
 * behind the previous browser instance when that instance emitted many events
 * and was reloaded quickly; the new instance's first id would then look stale
 * to an already-connected peer.  The scaled value is still below JavaScript's
 * safe-integer ceiling for centuries and remains a valid Firestore integer.
 */
export function pvpSequenceBase(now = Date.now()) {
  return Math.max(0, Math.trunc(Number(now) || 0)) * 1000;
}
