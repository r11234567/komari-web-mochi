import { getPingRecords, type PingRecord, type PingRecordsResult } from "@/api/connect";

export interface PingSummaryItem {
  name: string;
  current: number | null;
  avg: number | null;
  loss: number | null;
  samples: Array<number | null>;
}

/** Sparkline width, in probes. */
const SAMPLE_COUNT = 24;
/**
 * Cards mount in a burst as the grid renders. Collecting for one frame lets a
 * whole screen of them leave as a single multi-agent query.
 */
const FLUSH_DELAY_MS = 32;

interface Waiter {
  uuid: string;
  resolve: (items: PingSummaryItem[]) => void;
  reject: (error: unknown) => void;
}

interface PendingBatch {
  uuids: Set<string>;
  waiters: Waiter[];
}

const pending = new Map<number, PendingBatch>();

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A latency of -1 is the server's "probe failed" sentinel, not a measurement. */
const latency = (record: PingRecord) => (record.value === -1 || !Number.isFinite(record.value) ? null : record.value);

function summarise(uuid: string, result: PingRecordsResult): PingSummaryItem[] {
  const byTask = new Map<number, PingRecord[]>();
  for (const record of result.records) {
    if (record.client !== uuid) continue;
    const bucket = byTask.get(record.task_id);
    if (bucket) bucket.push(record);
    else byTask.set(record.task_id, [record]);
  }
  for (const bucket of byTask.values()) {
    bucket.sort((left, right) => left.time.localeCompare(right.time));
  }

  const tasks = result.tasks.length
    ? result.tasks.map((task, index) => ({ id: task.id, name: task.name || `Task ${index + 1}` }))
    : [...byTask.keys()].map((id, index) => ({ id, name: `Task ${index + 1}` }));

  return tasks.map((task) => {
    const records = byTask.get(task.id) ?? [];
    const values = records.map(latency).filter(finite);
    // Loss comes from this agent's own statistics; a task another node probes
    // has no entry here and reads as "no data" rather than as a healthy 0%.
    const stat = result.stats.get(`${uuid}:${task.id}`);
    return {
      name: task.name,
      current: values.length ? values[values.length - 1] : null,
      avg: values.length ? values.reduce((total, value) => total + value, 0) / values.length : null,
      loss: stat && finite(stat.lossPercent) ? stat.lossPercent : null,
      samples: records.slice(-SAMPLE_COUNT).map(latency),
    };
  });
}

function flush(hours: number) {
  const batch = pending.get(hours);
  if (!batch) return;
  pending.delete(hours);
  getPingRecords([...batch.uuids], hours).then(
    (result) => {
      for (const waiter of batch.waiters) waiter.resolve(summarise(waiter.uuid, result));
    },
    (error) => {
      for (const waiter of batch.waiters) waiter.reject(error);
    },
  );
}

/**
 * Ask for one node's probe summary. Requests raised in the same frame are
 * answered by a single query covering every node that asked, so a grid of N
 * cards costs one round trip rather than N.
 */
export function requestPingSummary(uuid: string, hours: number): Promise<PingSummaryItem[]> {
  return new Promise<PingSummaryItem[]>((resolve, reject) => {
    let batch = pending.get(hours);
    if (!batch) {
      batch = { uuids: new Set(), waiters: [] };
      pending.set(hours, batch);
      window.setTimeout(() => flush(hours), FLUSH_DELAY_MS);
    }
    batch.uuids.add(uuid);
    batch.waiters.push({ uuid, resolve, reject });
  });
}
