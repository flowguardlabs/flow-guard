/**
 * Liveness tracking for the in-process background workers.
 *
 * The public status page used to hardcode these to `unknown`, on the reasoning that
 * claiming health without evidence is worse than admitting ignorance. That was the
 * right call, but it left the page unable to distinguish a healthy deploy from one
 * where every monitor had silently died — and after the move to the VPS, with the
 * indexer in its own container, that blind spot covered most of the moving parts.
 *
 * Each worker records a tick when a cycle completes. Health is then derived from how
 * long ago that was, relative to the cadence the worker itself declared at start.
 * A worker that has never registered stays `unknown`; nothing here invents health.
 */

export type WorkerId =
  | 'blockchain_monitor'
  | 'transaction_monitor'
  | 'cycle_unlock_scheduler';

export type WorkerHealth = 'operational' | 'degraded' | 'outage' | 'unknown';

/**
 * How many cycles a worker may miss before it is considered degraded.
 *
 * Three rather than one: these cycles do network and database work whose duration
 * varies, and a single slow pass is normal operation, not a fault.
 */
const MISSED_CYCLES_BEFORE_DEGRADED = 3;

interface WorkerRecord {
  intervalMs: number;
  startedAt: number;
  lastTickAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  running: boolean;
}

const workers = new Map<WorkerId, WorkerRecord>();

/** Called when a worker's interval is installed. Declares its expected cadence. */
export function registerWorker(id: WorkerId, intervalMs: number): void {
  workers.set(id, {
    intervalMs,
    startedAt: Date.now(),
    lastTickAt: null,
    lastErrorAt: null,
    lastError: null,
    running: true,
  });
}

/** Called after a cycle completes without throwing. */
export function recordWorkerTick(id: WorkerId): void {
  const record = workers.get(id);
  if (!record) return;
  record.lastTickAt = Date.now();
  record.lastError = null;
}

/** Called when a cycle throws. The worker is still alive; its last pass was not. */
export function recordWorkerError(id: WorkerId, error: unknown): void {
  const record = workers.get(id);
  if (!record) return;
  record.lastErrorAt = Date.now();
  record.lastError = error instanceof Error ? error.message : String(error);
}

/** Called on deliberate shutdown, so a stopped worker is not reported as failed. */
export function deregisterWorker(id: WorkerId): void {
  const record = workers.get(id);
  if (!record) return;
  record.running = false;
}

export function getWorkerHealth(id: WorkerId, now: number = Date.now()): WorkerHealth {
  const record = workers.get(id);
  if (!record) return 'unknown';
  if (!record.running) return 'unknown';

  const staleAfterMs = record.intervalMs * MISSED_CYCLES_BEFORE_DEGRADED;

  if (record.lastTickAt === null) {
    // Started but no cycle has finished yet. Only a fault once it has had ample
    // time to produce one; before that it is genuinely unknown, not healthy.
    return now - record.startedAt > staleAfterMs ? 'outage' : 'unknown';
  }

  if (now - record.lastTickAt > staleAfterMs) return 'degraded';
  if (record.lastError !== null) return 'degraded';

  return 'operational';
}

/** Milliseconds since this worker's last completed cycle, for status detail lines. */
export function getWorkerAgeMs(id: WorkerId, now: number = Date.now()): number | null {
  const record = workers.get(id);
  if (!record?.lastTickAt) return null;
  return now - record.lastTickAt;
}

/** Test seam — drops all registrations. */
export function resetWorkerHeartbeats(): void {
  workers.clear();
}
