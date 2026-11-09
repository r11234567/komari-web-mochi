import React, { useState } from "react";
import { Card, Flex, Text, Badge, SegmentedControl, Tooltip } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { formatBytes, formatUptime } from "./Node";
import { formatTrafficGB } from "@/utils/trafficDisplay";
import { formatTrafficResetTime } from "@/utils/trafficDisplay";
import { getTrafficStats } from "@/utils";
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Server,
  Clock,
  Monitor,
  Microchip,
  Zap,
  Wifi,
  Database,
  MemoryStick,
  Layers,
  Calendar,
  Radio,
  BarChart3,
} from "lucide-react";
import UsageBar from "./UsageBar";
import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { Record } from "@/types/LiveData";
import { usePingSummary } from "@/hooks/use-ping-summary";
import { useIsMobile } from "@/hooks/use-mobile";

interface DesktopDetailsCardProps {
  node: NodeBasicInfo;
  liveData?: Record;
  isOnline?: boolean;
}

export const DesktopDetailsCard: React.FC<DesktopDetailsCardProps> = ({
  node,
  liveData,
  isOnline = false,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"overview" | "hardware" | "network" | "runtime" | "all">("overview");

  const cpuUsage = liveData?.cpu?.usage ?? 0;
  const memoryUsagePercent = node.mem_total && liveData ? (liveData.ram.used / node.mem_total) * 100 : 0;
  const diskUsagePercent = node.disk_total && liveData ? (liveData.disk.used / node.disk_total) * 100 : 0;
  const swapUsagePercent = node.swap_total && liveData ? (liveData.swap.used / node.swap_total) * 100 : 0;

  // GPU 数据处理
  const hasGpu = Boolean(
    liveData?.gpu && (liveData.gpu.count > 0 || liveData.gpu.average_usage !== undefined)
  );
  const gpuUsage = liveData?.gpu?.average_usage ?? 0;
  const gpuMemTotal = liveData?.gpu?.detailed_info?.reduce((acc, g) => acc + (g.memory_total || 0), 0) || node.gpu_mem_total || 0;
  const gpuMemUsed = liveData?.gpu?.detailed_info?.reduce((acc, g) => acc + (g.memory_used || 0), 0) || 0;
  const gpuMemPercent = gpuMemTotal > 0 ? (gpuMemUsed / gpuMemTotal) * 100 : 0;
  const gpuName = node.gpu_name || liveData?.gpu?.detailed_info?.[0]?.name;

  // 流量限制相关计算
  const trafficStats = liveData
    ? getTrafficStats(
        liveData.network.totalUp,
        liveData.network.totalDown,
        node.traffic_limit,
        node.traffic_limit_type
      )
    : { percentage: 0, usage: 0 };
  const hasTrafficLimit = Number(node.traffic_limit) > 0 && Boolean(node.traffic_limit_type);
  const trafficResetCountdown = formatTrafficResetTime(node.traffic_next_reset, t);

  const pingSummary = usePingSummary(node.uuid);

  const getTrafficTypeDisplay = (type?: string) => {
    switch (type) {
      case "max": return "MAX";
      case "min": return "MIN";
      case "sum": return "SUM";
      case "up": return "UP";
      case "down": return "DOWN";
      default: return "";
    }
  };

  const formatLatency = (value: number | null) =>
    value == null ? "-" : `${Math.round(value)} ms`;
  const formatLoss = (value: number | null) =>
    value == null ? "-" : `${value.toFixed(1)}%`;
  const formatLoad = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";

  const loadLine = `1m: ${formatLoad(liveData?.load?.load1)} / 5m: ${formatLoad(liveData?.load?.load5)} / 15m: ${formatLoad(liveData?.load?.load15)}`;
  const uptimeLabel = liveData?.uptime ? formatUptime(liveData.uptime, t) : "-";
  const updatedLabel = liveData?.updated_at ? new Date(liveData.updated_at).toLocaleString() : "-";

  const latencyRows = pingSummary.items.map((item) => ({
    name: item.name,
    current: formatLatency(item.current),
    avg: formatLatency(item.avg),
    loss: formatLoss(item.loss),
  }));

  // Resource Usage Card Component
  const renderResourceUsageCard = () => (
    <Card style={{ borderRadius: "12px", height: "100%" }}>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <Activity size={18} className="text-accent-9" />
            <Text size="3" weight="bold">{t("nodeCard.resource_usage")}</Text>
          </Flex>
          {isOnline && (
            <Badge color="green" variant="soft" size="1">
              {t("nodeCard.online")}
            </Badge>
          )}
        </Flex>

        {/* CPU */}
        <div>
          <Flex justify="between" align="center" mb="1">
            <Flex align="center" gap="2">
              <Cpu size={14} className="text-accent-9" />
              <Text size="2">{t("nodeCard.cpu")}</Text>
            </Flex>
            <Text size="2" color="gray">
              {cpuUsage.toFixed(1)}%
            </Text>
          </Flex>
          <UsageBar label="" value={cpuUsage} />
        </div>

        {/* 内存 */}
        <div>
          <Flex justify="between" align="center" mb="1">
            <Flex align="center" gap="2">
              <MemoryStick size={14} className="text-accent-9" />
              <Text size="2">{t("nodeCard.ram")}</Text>
            </Flex>
            <Text size="2" color="gray">
              {liveData ? `${formatBytes(liveData.ram.used || 0)} / ${formatBytes(node.mem_total)}` : formatBytes(node.mem_total)} ({memoryUsagePercent.toFixed(1)}%)
            </Text>
          </Flex>
          <UsageBar label="" value={memoryUsagePercent} />
        </div>

        {/* 磁盘 */}
        <div>
          <Flex justify="between" align="center" mb="1">
            <Flex align="center" gap="2">
              <HardDrive size={14} className="text-accent-9" />
              <Text size="2">{t("nodeCard.disk")}</Text>
            </Flex>
            <Text size="2" color="gray">
              {liveData ? `${formatBytes(liveData.disk.used || 0)} / ${formatBytes(node.disk_total)}` : formatBytes(node.disk_total)} ({diskUsagePercent.toFixed(1)}%)
            </Text>
          </Flex>
          <UsageBar label="" value={diskUsagePercent} />
        </div>

        {/* 交换空间 (Swap) */}
        {node.swap_total > 0 && (
          <div>
            <Flex justify="between" align="center" mb="1">
              <Flex align="center" gap="2">
                <Database size={14} className="text-accent-9" />
                <Text size="2">{t("nodeCard.swap")}</Text>
              </Flex>
              <Text size="2" color="gray">
                {liveData ? `${formatBytes(liveData.swap.used || 0)} / ${formatBytes(node.swap_total)}` : formatBytes(node.swap_total)} ({swapUsagePercent.toFixed(1)}%)
              </Text>
            </Flex>
            <UsageBar label="" value={swapUsagePercent} />
          </div>
        )}

        {/* 流量限制 */}
        {hasTrafficLimit && (
          <div>
            <Flex justify="between" align="center" mb="1">
              <Flex align="center" gap="2">
                <Activity size={14} className="text-accent-9" />
                <Text size="2">{t("nodeCard.trafficLimit")}</Text>
                <Badge variant="surface" size="1">{getTrafficTypeDisplay(node.traffic_limit_type)}</Badge>
              </Flex>
              <Flex align="center" gap="2">
                {trafficResetCountdown && (
                  <Text size="1" color="gray" className="text-accent-9 font-medium">
                    {trafficResetCountdown}
                  </Text>
                )}
                <Text size="2" color="gray">
                  {formatTrafficGB(trafficStats.usage)} / {formatTrafficGB(node.traffic_limit || 0)} ({trafficStats.percentage.toFixed(1)}%)
                </Text>
              </Flex>
            </Flex>
            <UsageBar label="" value={trafficStats.percentage} />
          </div>
        )}

        {/* GPU (自动判断，不传不显示) */}
        {hasGpu && (
          <>
            <div>
              <Flex justify="between" align="center" mb="1">
                <Flex align="center" gap="2">
                  <Microchip size={14} className="text-accent-9" />
                  <Text size="2">GPU</Text>
                  {gpuName && <Text size="1" color="gray" className="truncate max-w-[180px]">({gpuName})</Text>}
                </Flex>
                <Text size="2" color="gray">
                  {gpuUsage.toFixed(1)}%
                </Text>
              </Flex>
              <UsageBar label="" value={gpuUsage} />
            </div>

            {gpuMemTotal > 0 && (
              <div>
                <Flex justify="between" align="center" mb="1">
                  <Flex align="center" gap="2">
                    <MemoryStick size={14} className="text-accent-9" />
                    <Text size="2">GPU VRAM</Text>
                  </Flex>
                  <Text size="2" color="gray">
                    {formatBytes(gpuMemUsed)} / {formatBytes(gpuMemTotal)} ({gpuMemPercent.toFixed(1)}%)
                  </Text>
                </Flex>
                <UsageBar label="" value={gpuMemPercent} />
              </div>
            )}
          </>
        )}
      </Flex>
    </Card>
  );

  // Overview Summary Card
  const renderOverviewSummaryCard = () => (
    <Card style={{ borderRadius: "12px", height: "100%" }}>
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Monitor size={18} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.overview")}</Text>
        </Flex>

        <div className="grid gap-2">
          <InfoRow
            icon={<Cpu size={14} />}
            label="CPU"
            value={`${node.cpu_name} (x${node.cpu_cores})`}
          />
          {gpuName && (
            <InfoRow
              icon={<Microchip size={14} />}
              label="GPU"
              value={hasGpu ? `${gpuName} (${gpuUsage.toFixed(1)}%)` : gpuName}
            />
          )}
          <InfoRow
            icon={<Server size={14} />}
            label={t("nodeCard.os")}
            value={`${node.os} / ${node.arch}`}
          />
          <InfoRow
            icon={<Wifi size={14} />}
            label={t("nodeCard.networkSpeed")}
            value={`↑ ${formatBytes(liveData?.network.up || 0)}/s ↓ ${formatBytes(liveData?.network.down || 0)}/s`}
          />
          <InfoRow
            icon={<Network size={14} />}
            label={t("nodeCard.totalTraffic")}
            value={`↑ ${formatTrafficGB(liveData?.network.totalUp || 0)} ↓ ${formatTrafficGB(liveData?.network.totalDown || 0)}`}
          />
          {hasTrafficLimit && trafficResetCountdown && (
            <InfoRow
              icon={<Calendar size={14} />}
              label={t("nodeCard.trafficNextReset", { defaultValue: "重置周期" })}
              value={trafficResetCountdown}
            />
          )}
          <InfoRow
            icon={<Clock size={14} />}
            label={t("nodeCard.uptime")}
            value={uptimeLabel}
          />
          <InfoRow
            icon={<Zap size={14} />}
            label={t("nodeCard.load")}
            value={loadLine}
          />
        </div>
      </Flex>
    </Card>
  );

  // Hardware Card
  const renderHardwareCard = () => (
    <Card style={{ borderRadius: "12px" }}>
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Microchip size={18} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.hardware_info")}</Text>
        </Flex>
        <div className="grid md:grid-cols-2 gap-3">
          <InfoRow icon={<Cpu size={14} />} label={t("nodeCard.cpu")} value={`${node.cpu_name} (x${node.cpu_cores})`} />
          {Boolean(gpuName || hasGpu) && (
            <InfoRow
              icon={<Microchip size={14} />}
              label="GPU"
              value={hasGpu ? `${gpuName || "GPU"} (${gpuUsage.toFixed(1)}%)` : (gpuName || "None")}
            />
          )}
          {hasGpu && gpuMemTotal > 0 && (
            <InfoRow
              icon={<MemoryStick size={14} />}
              label="GPU VRAM"
              value={`${formatBytes(gpuMemUsed)} / ${formatBytes(gpuMemTotal)} (${gpuMemPercent.toFixed(1)}%)`}
            />
          )}
          <InfoRow icon={<MemoryStick size={14} />} label={t("nodeCard.ram")} value={formatBytes(node.mem_total)} />
          <InfoRow icon={<HardDrive size={14} />} label={t("nodeCard.disk")} value={formatBytes(node.disk_total)} />
          {node.swap_total > 0 && (
            <InfoRow icon={<Database size={14} />} label={t("nodeCard.swap")} value={formatBytes(node.swap_total)} />
          )}
          <InfoRow icon={<Server size={14} />} label={t("nodeCard.arch")} value={node.arch} />
          <InfoRow icon={<Layers size={14} />} label={t("nodeCard.virtualization")} value={node.virtualization || "Unknown"} />
        </div>
      </Flex>
    </Card>
  );

  // Network Card
  const renderNetworkCard = () => (
    <Card style={{ borderRadius: "12px" }}>
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Network size={18} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.network_info")}</Text>
        </Flex>
        <div className="grid md:grid-cols-2 gap-3">
          <InfoRow
            icon={<Wifi size={14} />}
            label={t("nodeCard.networkSpeed")}
            value={`↑ ${formatBytes(liveData?.network.up || 0)}/s ↓ ${formatBytes(liveData?.network.down || 0)}/s`}
          />
          <InfoRow
            icon={<Network size={14} />}
            label={t("nodeCard.totalTraffic")}
            value={`↑ ${formatTrafficGB(liveData?.network.totalUp || 0)} ↓ ${formatTrafficGB(liveData?.network.totalDown || 0)}`}
          />
          {hasTrafficLimit && (
            <InfoRow
              icon={<Activity size={14} />}
              label={t("nodeCard.trafficLimit")}
              value={`${getTrafficTypeDisplay(node.traffic_limit_type)} ${formatTrafficGB(trafficStats.usage)} / ${formatTrafficGB(node.traffic_limit || 0)} (${trafficStats.percentage.toFixed(1)}%)`}
            />
          )}
          {hasTrafficLimit && trafficResetCountdown && (
            <InfoRow
              icon={<Calendar size={14} />}
              label={t("nodeCard.trafficNextReset", { defaultValue: "重置周期" })}
              value={trafficResetCountdown}
            />
          )}
          <InfoRow
            icon={<Server size={14} />}
            label={t("nodeCard.connections")}
            value={liveData ? `TCP: ${liveData.connections.tcp}, UDP: ${liveData.connections.udp}` : "-"}
          />
        </div>
      </Flex>
    </Card>
  );

  // Runtime Card
  const renderRuntimeCard = () => (
    <Card style={{ borderRadius: "12px" }}>
      <Flex direction="column" gap="4">
        <Flex align="center" gap="2">
          <Zap size={18} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.runtime_info")}</Text>
        </Flex>
        <div className="grid md:grid-cols-2 gap-3">
          <InfoRow icon={<Clock size={14} />} label={t("nodeCard.uptime")} value={uptimeLabel} />
          <InfoRow icon={<Zap size={14} />} label={t("nodeCard.load")} value={loadLine} />
          <InfoRow icon={<Activity size={14} />} label={t("nodeCard.process")} value={liveData?.process?.toString() || "-"} />
          <InfoRow icon={<Server size={14} />} label={t("nodeCard.os")} value={node.os} />
          <InfoRow icon={<Layers size={14} />} label={t("nodeCard.kernelVersion")} value={node.kernel_version || "Unknown"} />
          <InfoRow icon={<Clock size={14} />} label={t("nodeCard.last_updated")} value={updatedLabel} />
        </div>
      </Flex>
    </Card>
  );

  // Latency Card
  const renderLatencyCard = () => (
    <Card style={{ borderRadius: "12px" }}>
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <Radio size={18} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.ping", { defaultValue: "延迟监测" })}</Text>
        </Flex>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" style={{ borderCollapse: "separate", borderSpacing: "0 6px" }}>
            <thead>
              <tr className="text-gray-10 text-xs">
                <th className="py-1 px-3">{t("Task Name", { defaultValue: "任务名" })}</th>
                <th className="py-1 px-3 text-right">{t("Current", { defaultValue: "当前" })}</th>
                <th className="py-1 px-3 text-right">{t("Avg", { defaultValue: "平均" })}</th>
                <th className="py-1 px-3 text-right">{t("Loss", { defaultValue: "丢包" })}</th>
              </tr>
            </thead>
            <tbody>
              {latencyRows.length ? (
                latencyRows.map((row) => (
                  <tr key={row.name} style={{ backgroundColor: "var(--gray-a2)", borderRadius: "6px" }}>
                    <td className="py-2 px-3 font-medium rounded-l-md">{row.name}</td>
                    <td className="py-2 px-3 text-right font-mono">{row.current}</td>
                    <td className="py-2 px-3 text-right font-mono">{row.avg}</td>
                    <td className="py-2 px-3 text-right font-mono rounded-r-md">
                      <Badge color={row.loss === "0.0%" ? "green" : "red"} variant="soft" size="1">
                        {row.loss}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-3 px-3 text-center text-gray-9">
                    -
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Flex>
    </Card>
  );

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4">
      {/* 标签切换导航 */}
      <Flex justify="between" align="center" wrap="wrap" gap="3" className="mb-1">
        <Flex align="center" gap="3">
          <Activity size={20} className="text-accent-9" />
          <Text size="3" weight="bold">{t("nodeCard.details")}</Text>
          <Badge color={isOnline ? "green" : "red"} variant="soft" size="2">
            {isOnline ? t("nodeCard.online") : t("nodeCard.offline")}
          </Badge>
        </Flex>

        <SegmentedControl.Root
          radius="full"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as any)}
          size="2"
        >
          <SegmentedControl.Item value="overview">
            <Flex align="center" gap="1">
              <Monitor size={15} />
              {t("nodeCard.overview")}
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="hardware">
            <Flex align="center" gap="1">
              <Microchip size={15} />
              {t("nodeCard.hardware")}
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="network">
            <Flex align="center" gap="1">
              <Network size={15} />
              {t("nodeCard.network")}
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="runtime">
            <Flex align="center" gap="1">
              <Zap size={15} />
              {t("nodeCard.runtime")}
            </Flex>
          </SegmentedControl.Item>
          <SegmentedControl.Item value="all">
            <Flex align="center" gap="1">
              <BarChart3 size={15} />
              {t("common.all", { defaultValue: "全部" })}
            </Flex>
          </SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>

      {/* 选项卡内容区域 */}
      <div className="grid gap-4">
        {activeTab === "overview" && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              {renderResourceUsageCard()}
              {renderOverviewSummaryCard()}
            </div>
            {latencyRows.length > 0 && renderLatencyCard()}
          </>
        )}

        {activeTab === "hardware" && renderHardwareCard()}

        {activeTab === "network" && renderNetworkCard()}

        {activeTab === "runtime" && (
          <>
            {renderRuntimeCard()}
            {renderLatencyCard()}
          </>
        )}

        {activeTab === "all" && (
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              {renderResourceUsageCard()}
              {renderOverviewSummaryCard()}
            </div>
            {renderHardwareCard()}
            {renderNetworkCard()}
            {renderRuntimeCard()}
            {renderLatencyCard()}
          </div>
        )}
      </div>
    </div>
  );
};

const InfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => {
  const isMobile = useIsMobile();
  const textValue = typeof value === "string" ? value : "";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 14px",
        backgroundColor: "var(--gray-a2)",
        borderRadius: "8px",
        border: "1px solid var(--gray-a4)",
        transition: "all 0.2s ease",
      }}
    >
      <Flex align="center" gap="2" className="min-w-0">
        <div style={{ color: "var(--accent-9)", flexShrink: 0 }}>{icon}</div>
        <Text size="2" color="gray">
          {label}
        </Text>
      </Flex>
      <div
        style={{
          maxWidth: "65%",
          display: "flex",
          justifyContent: "flex-end",
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        {isMobile || !textValue ? (
          <Text size="2" weight="medium" className="text-right truncate">
            {value}
          </Text>
        ) : (
          <Tooltip content={textValue}>
            <Text size="2" weight="medium" className="text-right truncate cursor-default">
              {value}
            </Text>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
