import { useEffect, useState } from "react";
import { getPingRecords } from "@/api/connect";

type PingSummaryItem = {
  name: string;
  current: number | null;
  avg: number | null;
  loss: number | null;
  samples: Array<number | null>;
};

type PingSummary = {
  items: PingSummaryItem[];
  loading: boolean;
};

type CachedPingSummary = PingSummary & {
  cachedAt: number;
};

type PingRecord = {
  task_id: number;
  time: string;
  value: number;
};

type PingTask = {
  id?: number;
  name?: string;
  loss?: number;
};

type PingApiResp = {
  data?: {
    records?: PingRecord[];
    tasks?: PingTask[];
  };
};

const emptySummary: PingSummary = {
  items: [],
  loading: true,
};

const summaryCache = new Map<string, CachedPingSummary>();
const CACHE_TTL_MS = 60_000;

export function usePingSummary(uuid?: string, hours = 1) {
  const [summary, setSummary] = useState<PingSummary>(emptySummary);

  useEffect(() => {
    if (!uuid) {
      const frame = window.requestAnimationFrame(() => {
        setSummary({ items: [], loading: false });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let active = true;
    const cacheKey = `${uuid}:${hours}`;
    const cached = summaryCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      const frame = window.requestAnimationFrame(() => {
        if (active) {
          setSummary({ items: cached.items, loading: false });
        }
      });

      return () => {
        active = false;
        window.cancelAnimationFrame(frame);
      };
    }

    const frame = window.requestAnimationFrame(() => {
      if (active) {
        setSummary((prev) => ({ ...prev, loading: true }));
      }
    });
    const controller = new AbortController();

    getPingRecords([uuid], hours, [], controller.signal)
      .then((resp) => {
        if (!active) return;
        const records = resp.records;
        const tasks = resp.tasks;
        const sorted = [...records].sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        const taskList = tasks.length
          ? tasks.map((task, index) => ({
              id: typeof task.id === "number" ? task.id : index + 1,
              name: task.name || `Task ${index + 1}`,
              loss: typeof task.loss === "number" && Number.isFinite(task.loss) ? task.loss : null,
            }))
          : [];

        const fallbackTaskIds = Array.from(new Set(sorted.map((rec) => rec.task_id)));
        const resolvedTasks = taskList.length
          ? taskList
          : fallbackTaskIds.map((taskId, index) => ({
              id: taskId,
              name: `Task ${index + 1}`,
              loss: null,
            }));

        const nextSummary = {
          items: resolvedTasks.map((task) => {
            const rawRecords = sorted.filter((rec) => rec.task_id === task.id);
            const taskRecords = rawRecords
              .map((rec) => (rec.value === -1 ? null : rec.value))
              .filter((val): val is number => typeof val === "number" && Number.isFinite(val));
            const samples = rawRecords
              .slice(-24)
              .map((rec) =>
                rec.value === -1 || !Number.isFinite(rec.value)
                  ? null
                  : rec.value
              );

            const current = taskRecords.length ? taskRecords[taskRecords.length - 1] : null;
            const avg = taskRecords.length
              ? taskRecords.reduce((acc, val) => acc + val, 0) / taskRecords.length
              : null;

            return {
              name: task.name,
              current,
              avg,
              loss: task.loss,
              samples,
            };
          }),
          loading: false,
        };
        summaryCache.set(cacheKey, { ...nextSummary, cachedAt: Date.now() });
        setSummary(nextSummary);
      })
      .catch(() => {
        if (!active) return;
        setSummary({ items: [], loading: false });
      });

    return () => {
      active = false;
      controller.abort();
      window.cancelAnimationFrame(frame);
    };
  }, [uuid, hours]);

  return summary;
}
