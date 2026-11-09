import React, { useState } from "react";
import { Card, Flex, Text, Badge, SegmentedControl } from "@radix-ui/themes";
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
  Microchip,
  Zap,
  Wifi,
  Database,
  MemoryStick,
  Layers,
  Calendar,
} from "lucide-react";
import UsageBar from "./UsageBar";
import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { Record } from "@/types/LiveData";

interface MobileDetailsCardProps {
  node: NodeBasicInfo;
  liveData?: Record;
  isOnline?: boolean;
}

export const MobileDetailsCard: React.FC<MobileDetailsCardProps> = ({
  node,
  liveData,
  isOnline = false,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"overview" | "hardware" | "network" | "runtime">("overview");

  const cpuUsage = liveData?.cpu?.usage ?? 0;
  const memoryUsagePercent = node.mem_total && liveData ? (liveData.ram.used / node.mem_total) * 100 : 0;
  const diskUsagePercent = node.disk_total && liveData ? (liveData.disk.used / node.disk_total) * 100 : 0;
  const swapUsagePercent = node.swap_total && liveData ? (liveData.swap.used / node.swap_total) * 100 : 0;

  // GPU
  const hasGpu = Boolean(
    liveData?.gpu && (liveData.gpu.count > 0 || liveData.gpu.average_usage !== undefined)
  );
  const gpuUsage = liveData?.gpu?.average_usage ?? 0;
  const gpuMemTotal = liveData?.gpu?.detailed_info?.reduce((acc, g) => acc + (g.memory_total || 0), 0) || node.gpu_mem_total || 0;
  const gpuMemUsed = liveData?.gpu?.detailed_info?.reduce((acc, g) => acc + (g.memory_used || 0), 0) || 0;
  const gpuMemPercent = gpuMemTotal > 0 ? (gpuMemUsed / gpuMemTotal) * 100 : 0;
  const gpuName = node.gpu_name || liveData?.gpu?.detailed_info?.[0]?.name;

  // Traffic
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

  const formatLoad = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";

  const loadLine = `1m: ${formatLoad(liveData?.load?.load1)} / 5m: ${formatLoad(liveData?.load?.load5)} / 15m: ${formatLoad(liveData?.load?.load15)}`;
  const uptimeLabel = liveData?.uptime ? formatUptime(liveData.uptime, t) : "-";
  const updatedLabel = liveData?.updated_at ? new Date(liveData.updated_at).toLocaleString() : "-";

  return (
    <div className="w-full flex flex-col gap-3">
      {/* 选项卡切换 */}
      <SegmentedControl.Root
        radius="full"
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as any)}
        size="1"
        className="w-full"
      >
        <SegmentedControl.Item value="overview" className="flex-1">
          {t("nodeCard.overview")}
        </SegmentedControl.Item>
        <SegmentedControl.Item value="hardware" className="flex-1">
          {t("nodeCard.hardware")}
        </SegmentedControl.Item>
        <SegmentedControl.Item value="network" className="flex-1">
          {t("nodeCard.network")}
        </SegmentedControl.Item>
        <SegmentedControl.Item value="runtime" className="flex-1">
          {t("nodeCard.runtime")}
        </SegmentedControl.Item>
      </SegmentedControl.Root>

      {/* Overview */}
      {activeTab === "overview" && (
        <Card style={{ borderRadius: "12px" }}>
          <Flex direction="column" gap="3">
            <Flex justify="between" align="center">
              <Text size="2" weight="bold">{t("nodeCard.resource_usage")}</Text>
              <Badge color={isOnline ? "green" : "red"} variant="soft" size="1">
                {isOnline ? t("nodeCard.online") : t("nodeCard.offline")}
              </Badge>
            </Flex>

            <div>
              <Flex justify="between" align="center" mb="1">
                <Text size="1">{t("nodeCard.cpu")}</Text>
                <Text size="1" color="gray">{cpuUsage.toFixed(1)}%</Text>
              </Flex>
              <UsageBar label="" value={cpuUsage} />
            </div>

            <div>
              <Flex justify="between" align="center" mb="1">
                <Text size="1">{t("nodeCard.ram")}</Text>
                <Text size="1" color="gray">
                  {liveData ? `${formatBytes(liveData.ram.used || 0)} / ${formatBytes(node.mem_total)}` : formatBytes(node.mem_total)}
                </Text>
              </Flex>
              <UsageBar label="" value={memoryUsagePercent} />
            </div>

            <div>
              <Flex justify="between" align="center" mb="1">
                <Text size="1">{t("nodeCard.disk")}</Text>
                <Text size="1" color="gray">
                  {liveData ? `${formatBytes(liveData.disk.used || 0)} / ${formatBytes(node.disk_total)}` : formatBytes(node.disk_total)}
                </Text>
              </Flex>
              <UsageBar label="" value={diskUsagePercent} />
            </div>

            {node.swap_total > 0 && (
              <div>
                <Flex justify="between" align="center" mb="1">
                  <Text size="1">{t("nodeCard.swap")}</Text>
                  <Text size="1" color="gray">
                    {liveData ? `${formatBytes(liveData.swap.used || 0)} / ${formatBytes(node.swap_total)}` : formatBytes(node.swap_total)}
                  </Text>
                </Flex>
                <UsageBar label="" value={swapUsagePercent} />
              </div>
            )}

            {hasTrafficLimit && (
              <div>
                <Flex justify="between" align="center" mb="1">
                  <Flex align="center" gap="1">
                    <Text size="1">{t("nodeCard.trafficLimit")}</Text>
                    <Badge variant="surface" size="1">{getTrafficTypeDisplay(node.traffic_limit_type)}</Badge>
                  </Flex>
                  <Flex align="center" gap="1">
                    {trafficResetCountdown && (
                      <Text size="1" color="gray" className="text-accent-9">
                        {trafficResetCountdown}
                      </Text>
                    )}
                    <Text size="1" color="gray">
                      {formatTrafficGB(trafficStats.usage)} / {formatTrafficGB(node.traffic_limit || 0)}
                    </Text>
                  </Flex>
                </Flex>
                <UsageBar label="" value={trafficStats.percentage} />
              </div>
            )}

            {hasGpu && (
              <>
                <div>
                  <Flex justify="between" align="center" mb="1">
                    <Text size="1">GPU ({gpuName || "GPU"})</Text>
                    <Text size="1" color="gray">{gpuUsage.toFixed(1)}%</Text>
                  </Flex>
                  <UsageBar label="" value={gpuUsage} />
                </div>
                {gpuMemTotal > 0 && (
                  <div>
                    <Flex justify="between" align="center" mb="1">
                      <Text size="1">GPU VRAM</Text>
                      <Text size="1" color="gray">
                        {formatBytes(gpuMemUsed)} / {formatBytes(gpuMemTotal)}
                      </Text>
                    </Flex>
                    <UsageBar label="" value={gpuMemPercent} />
                  </div>
                )}
              </>
            )}
          </Flex>
        </Card>
      )}

      {/* Hardware */}
      {activeTab === "hardware" && (
        <Card style={{ borderRadius: "12px" }}>
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">{t("nodeCard.hardware_info")}</Text>
            <MobileInfoRow icon={<Cpu size={14} />} label={t("nodeCard.cpu")} value={`${node.cpu_name} (x${node.cpu_cores})`} />
            {Boolean(gpuName || hasGpu) && (
              <MobileInfoRow
                icon={<Microchip size={14} />}
                label="GPU"
                value={hasGpu ? `${gpuName || "GPU"} (${gpuUsage.toFixed(1)}%)` : (gpuName || "None")}
              />
            )}
            {hasGpu && gpuMemTotal > 0 && (
              <MobileInfoRow
                icon={<MemoryStick size={14} />}
                label="GPU VRAM"
                value={`${formatBytes(gpuMemUsed)} / ${formatBytes(gpuMemTotal)}`}
              />
            )}
            <MobileInfoRow icon={<MemoryStick size={14} />} label={t("nodeCard.ram")} value={formatBytes(node.mem_total)} />
            <MobileInfoRow icon={<HardDrive size={14} />} label={t("nodeCard.disk")} value={formatBytes(node.disk_total)} />
            {node.swap_total > 0 && (
              <MobileInfoRow icon={<Database size={14} />} label={t("nodeCard.swap")} value={formatBytes(node.swap_total)} />
            )}
            <MobileInfoRow icon={<Server size={14} />} label={t("nodeCard.arch")} value={node.arch} />
            <MobileInfoRow icon={<Layers size={14} />} label={t("nodeCard.virtualization")} value={node.virtualization || "Unknown"} />
          </Flex>
        </Card>
      )}

      {/* Network */}
      {activeTab === "network" && (
        <Card style={{ borderRadius: "12px" }}>
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">{t("nodeCard.network_info")}</Text>
            <MobileInfoRow
              icon={<Wifi size={14} />}
              label={t("nodeCard.networkSpeed")}
              value={`↑ ${formatBytes(liveData?.network.up || 0)}/s ↓ ${formatBytes(liveData?.network.down || 0)}/s`}
            />
            <MobileInfoRow
              icon={<Network size={14} />}
              label={t("nodeCard.totalTraffic")}
              value={`↑ ${formatTrafficGB(liveData?.network.totalUp || 0)} ↓ ${formatTrafficGB(liveData?.network.totalDown || 0)}`}
            />
            {hasTrafficLimit && (
              <MobileInfoRow
                icon={<Activity size={14} />}
                label={t("nodeCard.trafficLimit")}
                value={`${getTrafficTypeDisplay(node.traffic_limit_type)} ${formatTrafficGB(trafficStats.usage)} / ${formatTrafficGB(node.traffic_limit || 0)} (${trafficStats.percentage.toFixed(1)}%)`}
              />
            )}
            {hasTrafficLimit && trafficResetCountdown && (
              <MobileInfoRow
                icon={<Calendar size={14} />}
                label={t("nodeCard.trafficNextReset", { defaultValue: "重置周期" })}
                value={trafficResetCountdown}
              />
            )}
            <MobileInfoRow
              icon={<Server size={14} />}
              label={t("nodeCard.connections")}
              value={liveData ? `TCP: ${liveData.connections.tcp}, UDP: ${liveData.connections.udp}` : "-"}
            />
          </Flex>
        </Card>
      )}

      {/* Runtime */}
      {activeTab === "runtime" && (
        <Card style={{ borderRadius: "12px" }}>
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">{t("nodeCard.runtime_info")}</Text>
            <MobileInfoRow icon={<Clock size={14} />} label={t("nodeCard.uptime")} value={uptimeLabel} />
            <MobileInfoRow icon={<Zap size={14} />} label={t("nodeCard.load")} value={loadLine} />
            <MobileInfoRow icon={<Activity size={14} />} label={t("nodeCard.process")} value={liveData?.process?.toString() || "-"} />
            <MobileInfoRow icon={<Server size={14} />} label={t("nodeCard.os")} value={node.os} />
            <MobileInfoRow icon={<Layers size={14} />} label={t("nodeCard.kernelVersion")} value={node.kernel_version || "Unknown"} />
            <MobileInfoRow icon={<Clock size={14} />} label={t("nodeCard.last_updated")} value={updatedLabel} />
          </Flex>
        </Card>
      )}
    </div>
  );
};

const MobileInfoRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 12px",
      backgroundColor: "var(--gray-a2)",
      borderRadius: "8px",
      border: "1px solid var(--gray-a4)",
    }}
  >
    <Flex align="center" gap="2" className="min-w-0">
      <div style={{ color: "var(--accent-9)", flexShrink: 0 }}>{icon}</div>
      <Text size="1" color="gray">
        {label}
      </Text>
    </Flex>
    <div style={{ maxWidth: "60%", display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
      <Text size="1" weight="medium" className="text-right truncate font-mono">
        {value}
      </Text>
    </div>
  </div>
);
