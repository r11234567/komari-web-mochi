import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { BrowserService, AgentStatus } from "@komari/proto/komari/browser/v1/browser_pb";
import { MetricsService } from "@komari/proto/komari/metrics/v1/metrics_pb";
import type { AgentReport } from "@komari/proto/komari/report/v1/report_pb";
import type { PublicInfo } from "@/contexts/PublicInfoContext";
import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { LiveDataResponse, Record as LiveRecord } from "@/types/LiveData";
import type { RecordFormat } from "@/utils/RecordHelper";

const transport = createConnectTransport({
  baseUrl: window.location.origin,
  useBinaryFormat: true,
  defaultTimeoutMs: 30_000,
  fetch: (input, init) => fetch(input, { ...init, credentials: "same-origin" }),
});

const browser = createClient(BrowserService, transport);
const metrics = createClient(MetricsService, transport);
const options = (signal?: AbortSignal, timeoutMs = 30_000) => ({ signal, timeoutMs });
const number = (value: bigint | undefined) => Number(value ?? 0n);
const iso = (value: Parameters<typeof timestampDate>[0] | undefined) =>
  value ? timestampDate(value).toISOString() : "";

export async function getPublicInfo(signal?: AbortSignal): Promise<PublicInfo> {
  const response = await browser.getPublicInfo({}, options(signal));
  const retentionHours = response.metricRetentionDays * 24;
  return {
    allow_cors: response.corsOriginCheckEnabled,
    custom_body: response.customBody,
    custom_head: response.customHead,
    description: response.siteDescription,
    disable_password_login: response.disablePasswordLogin,
    oauth_provider: response.oauthProvider,
    oauth_enable: response.oauthEnabled,
    ping_record_preserve_time: retentionHours,
    record_enabled: retentionHours > 0,
    record_preserve_time: retentionHours,
    sitename: response.siteName,
    private_site: response.privateSite,
    theme_settings: response.themeSettings ?? {},
  };
}

export async function listNodes(signal?: AbortSignal): Promise<NodeBasicInfo[]> {
  const response = await browser.listAgents({}, options(signal));
  return response.agents.map((agent) => {
    const basic = agent.basicInfo;
    return {
      uuid: agent.agentId,
      name: agent.name,
      cpu_name: basic?.cpuName ?? "",
      virtualization: basic?.virtualization ?? "",
      arch: basic?.architecture ?? "",
      cpu_cores: basic?.cpuCores ?? 0,
      os: basic?.os ?? "",
      kernel_version: basic?.kernelVersion ?? "",
      gpu_name: basic?.gpuName ?? "",
      region: basic?.region ?? "",
      mem_total: number(basic?.memoryTotalBytes),
      swap_total: number(basic?.swapTotalBytes),
      disk_total: number(basic?.diskTotalBytes),
      version: basic?.agentVersion ?? "",
      weight: basic?.weight ?? 0,
      price: basic?.price ?? 0,
      tags: basic?.tags ?? "",
      billing_cycle: basic?.billingCycleDays ?? 0,
      currency: basic?.currency ?? "",
      group: basic?.group ?? "",
      traffic_limit: number(basic?.trafficLimitBytes),
      traffic_limit_type: basic?.trafficLimitType as NodeBasicInfo["traffic_limit_type"],
      expired_at: iso(basic?.expiresAt),
      created_at: iso(basic?.createdAt),
      updated_at: iso(basic?.updatedAt),
    };
  });
}

function reportToLive(report?: AgentReport): LiveRecord {
  const resources = report?.resources;
  const network = report?.networkInterfaces.find((item) => item.name === "aggregate")
    ?? report?.networkInterfaces[0];
  const disk = report?.disks.find((item) => item.mountPoint === "aggregate")
    ?? report?.disks[0];
  return {
    cpu: { usage: resources?.cpuPercent ?? 0 },
    ram: { used: number(resources?.memoryUsedBytes) },
    swap: { used: number(resources?.swapUsedBytes) },
    load: {
      load1: resources?.loadAverage[0] ?? 0,
      load5: resources?.loadAverage[1] ?? 0,
      load15: resources?.loadAverage[2] ?? 0,
    },
    disk: { used: number(disk?.usedBytes) },
    network: {
      up: number(network?.bytesSentPerSecond),
      down: number(network?.bytesReceivedPerSecond),
      totalUp: number(network?.bytesSent),
      totalDown: number(network?.bytesReceived),
    },
    connections: {
      tcp: number(resources?.tcpConnectionCount),
      udp: number(resources?.udpConnectionCount),
    },
    uptime: report?.system?.uptime ? Number(report.system.uptime.seconds) : 0,
    process: number(resources?.processCount),
    message: report?.diagnosticMessage ?? "",
    updated_at: iso(report?.observedAt) || new Date().toISOString(),
  };
}

export function watchLiveData(
  onData: (data: LiveDataResponse) => void,
  onStatus: (connected: boolean) => void,
) {
  const controller = new AbortController();
  const live: LiveDataResponse = { data: { online: [], data: {} }, status: "ok" };
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        for await (const event of browser.watchAgentStatus({}, options(controller.signal, 0))) {
          if (!event.agent) continue;
          const uuid = event.agent.agentId;
          live.data.data[uuid] = reportToLive(event.latestReport);
          const online = new Set(live.data.online);
          if (event.agent.status === AgentStatus.ONLINE) online.add(uuid);
          else online.delete(uuid);
          live.data.online = [...online];
          onStatus(true);
          onData({ data: { online: [...live.data.online], data: { ...live.data.data } }, status: "ok" });
        }
      } catch (error) {
        if (controller.signal.aborted) break;
        console.warn("[mochi] Connect status stream failed", error);
        onStatus(false);
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
    }
  })();
  return () => controller.abort(new DOMException("Theme unmounted", "AbortError"));
}

const loadMetrics = [
  "cpu.usage", "memory.used", "memory.total", "swap.used", "swap.total",
  "load.average", "disk.used", "disk.total", "net.in.rate", "net.out.rate",
  "net.total.up", "net.total.down", "process.count", "connections.tcp", "connections.udp",
];

export async function getLoadRecords(
  agentIds: string[],
  hours: number,
  signal?: AbortSignal,
): Promise<Record<string, RecordFormat[]>> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3_600_000);
  const response = await metrics.queryMetrics({
    agentIds,
    metrics: loadMetrics,
    startTime: timestampFromDate(start),
    endTime: timestampFromDate(end),
    maxPoints: 1_000,
    fillEmpty: false,
  }, options(signal));
  const rows = new Map<string, Map<string, RecordFormat>>();
  for (const series of response.series) {
    const agentRows = rows.get(series.agentId) ?? new Map<string, RecordFormat>();
    rows.set(series.agentId, agentRows);
    for (const point of series.queryPoints) {
      if (!point.observedAt) continue;
      const time = timestampDate(point.observedAt).toISOString();
      const row = agentRows.get(time) ?? {
        client: series.agentId, time, cpu: null, gpu: null, ram: null, ram_total: null,
        swap: null, swap_total: null, load: null, temp: null, disk: null, disk_total: null,
        net_in: null, net_out: null, net_total_up: null, net_total_down: null,
        process: null, connections: null, connections_udp: null,
      };
      agentRows.set(time, row);
      const value = point.value ?? null;
      if (series.metric === "cpu.usage") row.cpu = value;
      if (series.metric === "memory.used") row.ram = value;
      if (series.metric === "memory.total") row.ram_total = value;
      if (series.metric === "swap.used") row.swap = value;
      if (series.metric === "swap.total") row.swap_total = value;
      if (series.metric === "load.average") row.load = value;
      if (series.metric === "disk.used") row.disk = value;
      if (series.metric === "disk.total") row.disk_total = value;
      if (series.metric === "net.in.rate") row.net_in = value;
      if (series.metric === "net.out.rate") row.net_out = value;
      if (series.metric === "net.total.up") row.net_total_up = value;
      if (series.metric === "net.total.down") row.net_total_down = value;
      if (series.metric === "process.count") row.process = value;
      if (series.metric === "connections.tcp") row.connections = value;
      if (series.metric === "connections.udp") row.connections_udp = value;
    }
  }
  return Object.fromEntries([...rows].map(([agentId, values]) => [
    agentId,
    [...values.values()].sort((left, right) => left.time.localeCompare(right.time)),
  ]));
}

export interface PingRecord { client: string; task_id: number; time: string; value: number }
export interface PingTaskInfo {
  id: number; name: string; interval: number; loss: number; min?: number; max?: number;
  avg?: number; latest?: number; total?: number; p50?: number; p99?: number; p99_p50_ratio?: number; type?: string;
}

export async function getPingRecords(
  agentIds: string[],
  hours: number,
  taskIds: number[] = [],
  signal?: AbortSignal,
) {
  const end = new Date(); const start = new Date(end.getTime() - hours * 3_600_000);
  const [seriesResponse, taskResponse, statsResponse] = await Promise.all([
    metrics.queryMetrics({
      agentIds, metrics: ["ping.latency_ms"], startTime: timestampFromDate(start),
      endTime: timestampFromDate(end), maxPoints: 1_000,
      tags: taskIds.length === 1 ? { task_id: String(taskIds[0]) } : {}, fillEmpty: true,
    }, options(signal)),
    metrics.listPingTasks({}, options(signal)),
    metrics.getPingStats({
      agentIds, taskIds: taskIds.map(BigInt), startTime: timestampFromDate(start),
      endTime: timestampFromDate(end), maxPoints: 1_000,
    }, options(signal)),
  ]);
  const records: PingRecord[] = [];
  for (const series of seriesResponse.series) {
    const taskId = Number(series.labels.task_id);
    if (!Number.isFinite(taskId) || (taskIds.length && !taskIds.includes(taskId))) continue;
    for (const point of series.queryPoints) {
      if (!point.observedAt) continue;
      records.push({
        client: series.agentId, task_id: taskId,
        time: timestampDate(point.observedAt).toISOString(), value: point.value ?? -1,
      });
    }
  }
  records.sort((left, right) => left.time.localeCompare(right.time));
  const stats = new Map(statsResponse.stats.map((stat) => [`${stat.agentId}:${Number(stat.taskId)}`, stat]));
  const aggregateStats = new Map<number, typeof statsResponse.stats[number]>();
  for (const stat of statsResponse.stats) if (!aggregateStats.has(Number(stat.taskId))) aggregateStats.set(Number(stat.taskId), stat);
  const tasks: PingTaskInfo[] = taskResponse.tasks
    .filter((task) => !taskIds.length || taskIds.includes(Number(task.taskId)))
    .map((task) => {
      const stat = aggregateStats.get(Number(task.taskId));
      return {
        id: Number(task.taskId), name: task.name, type: task.type,
        interval: task.interval ? Number(task.interval.seconds) + task.interval.nanos / 1e9 : 0,
        loss: stat?.lossPercent ?? 0, min: stat?.minimum, max: stat?.maximum,
        avg: stat?.average, latest: stat?.latest, total: stat?.total,
        p50: stat?.p50, p99: stat?.p99, p99_p50_ratio: stat?.p99P50Ratio,
      };
    });
  return { records, tasks, stats };
}
