import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, Flex, Text, SegmentedControl } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { formatBytes } from "./Node";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import fillMissingTimePoints, { type RecordFormat } from "@/utils/RecordHelper";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import Loading from "@/components/loading";
import "./MobileChart.css";
import { getLoadRecords } from "@/api/connect";
import { buildTimeRanges } from "@/utils/timeRanges";

interface MobileLoadChartProps {
  data: RecordFormat[];
  liveData?: any;
  node?: any;
  uuid?: string;
}

export const MobileLoadChart: React.FC<MobileLoadChartProps> = ({
  data,
  liveData,
  node,
  uuid,
}) => {
  const { t } = useTranslation();
  const { publicInfo } = usePublicInfo();
  const max_record_preserve_time = publicInfo?.record_preserve_time || 0;
  
  // 状态管理
  const [hoursView, setHoursView] = useState<string>(t("common.real_time"));
  const [remoteData, setRemoteData] = useState<RecordFormat[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memoizedAvailableView = useMemo(() => {
    return buildTimeRanges(max_record_preserve_time, t, true);
  }, [max_record_preserve_time, t]);

  // 使用 ref 来存储请求控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  // 根据 hoursView 拉取数据
  useEffect(() => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 跳过实时视图的数据请求
    if (hoursView === t("common.real_time") || hoursView === "real-time") {
      const frame = requestAnimationFrame(() => {
        setRemoteData(null);
        setLoading(false);
        setError(null);
      });
      return () => cancelAnimationFrame(frame);
    }

    const selected = memoizedAvailableView.find((v) => v.label === hoursView);
    if (!uuid || !selected || !selected.hours) {
      const frame = requestAnimationFrame(() => {
        setRemoteData(null);
        setError(null);
        setLoading(false);
      });
      return () => cancelAnimationFrame(frame);
    }
    const selectedHours = selected.hours;
    
    // 创建新的请求控制器
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setError(null);
    });
    
    // 添加延迟以避免频繁请求
    const timeoutId = setTimeout(() => {
      getLoadRecords([uuid], selectedHours, controller.signal)
        .then((result) => {
          const records = result[uuid] || [];
          records.sort(
            (a: RecordFormat, b: RecordFormat) =>
              new Date(a.time).getTime() - new Date(b.time).getTime()
          );
          setRemoteData(records);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            setError(err.message || "Error");
            setLoading(false);
          }
        });
    }, 300); // 300ms 延迟

    // 清理函数
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [hoursView, memoizedAvailableView, uuid, t]);

  // 处理图表数据
  const chartData = useMemo(() => {
    if (hoursView === t("common.real_time") || hoursView === "real-time") {
      return data;
    }
    
    if (!remoteData || remoteData.length === 0) {
      return [];
    }
    
    const selectedHours = memoizedAvailableView.find((v) => v.label === hoursView)?.hours || 1;
    const minute = 60;
    const hour = minute * 60;
    
    // 根据时间跨度选择合适的间隔
    let interval, maxGap;
    
    // 4小时以内：1分钟间隔，1分钟容差
    // 4小时以上：原有间隔逻辑，容差 = interval * 1
    if (selectedHours <= 4) {
      interval = minute;  // 1分钟间隔
      maxGap = minute;    // 1分钟容差
    } else if (selectedHours <= 6) {
      // 4-6小时，显示间隔15分钟
      interval = minute * 15;
      maxGap = interval;  // 容差 = interval * 1
    } else if (selectedHours <= 24) {
      // 6-24小时，显示间隔30分钟
      interval = minute * 30;
      maxGap = interval;  // 容差 = interval * 1
    } else {
      // 超过24小时，显示间隔60分钟
      interval = hour;
      maxGap = interval;  // 容差 = interval * 1
    }
    
    return fillMissingTimePoints(
      remoteData,
      interval,
      hour * selectedHours,
      maxGap
    );
  }, [hoursView, remoteData, data, memoizedAvailableView, t]);

  // 简化的图表配置
  const chartConfig = {
    margin: { top: 5, right: 5, bottom: 5, left: 5 },
    strokeWidth: 2,
  };

  // 自定义Tooltip
  const CustomTooltip = ({ active, payload, label, chartTitle }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="mobile-chart-tooltip">
        <Text size="1" className="block mb-1">
          {new Date(label).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
        {payload.map((entry: any, index: number) => {
          let displayName = entry.name;
          let displayValue = entry.value.toFixed(1);
          
          // 处理网络速度的特殊情况
          if (entry.name === "net_in") {
            displayName = `↓ ${t("nodeCard.networkDownloadSpeed")}`;
            displayValue = formatBytes(entry.value) + "/s";
          } else if (entry.name === "net_out") {
            displayName = `↑ ${t("nodeCard.networkUploadSpeed")}`;
            displayValue = formatBytes(entry.value) + "/s";
          } else if (chartTitle === t("nodeCard.disk")) {
            displayValue = formatBytes(entry.value);
          } else if (entry.name === "CPU" || entry.name === "ram") {
            displayValue = entry.value.toFixed(1) + "%";
          }
          
          return (
            <Text key={index} size="1" style={{ color: entry.color }}>
              {chartTitle && !entry.name.includes("net") ? chartTitle : displayName}: {displayValue}
            </Text>
          );
        })}
      </div>
    );
  };

  const charts = [
    {
      title: "CPU",
      value: liveData?.cpu?.usage ? `${liveData.cpu.usage.toFixed(1)}%` : "-",
      data: chartData,
      dataKey: "cpu",
      color: "var(--red-9)",
      formatter: (value: number) => `${value.toFixed(1)}%`,
      domain: [0, 100],
    },
    {
      title: t("nodeCard.ram"),
      value: liveData?.ram?.used
        ? `${formatBytes(liveData.ram.used)} / ${formatBytes(node?.mem_total || 0)}`
        : "-",
      data: chartData.map((item) => ({
        ...item,
        ram: ((item.ram ?? 0) / (node?.mem_total ?? 1)) * 100,
      })),
      dataKey: "ram",
      color: "var(--amber-9)",
      formatter: (value: number) => `${value.toFixed(1)}%`,
      domain: [0, 100],
    },
    {
      title: t("nodeCard.disk"),
      value: liveData?.disk?.used
        ? `${formatBytes(liveData.disk.used)} / ${formatBytes(node?.disk_total || 0)}`
        : "-",
      data: chartData,
      dataKey: "disk",
      color: "var(--jade-9)",
      formatter: (value: number) => formatBytes(value),
      domain: [0, node?.disk_total || 100],
    },
    {
      title: t("nodeCard.networkSpeed"),
      value: (
        <Flex direction="column" align="end" gap="0">
          <Text size="1">↑ {formatBytes(liveData?.network.up || 0)}/s</Text>
          <Text size="1">↓ {formatBytes(liveData?.network.down || 0)}/s</Text>
        </Flex>
      ),
      data: chartData,
      dataKey: ["net_in", "net_out"],
      color: ["var(--red-9)", "var(--jade-9)"],
      formatter: (value: number) => `${formatBytes(value)}/s`,
      isMultiLine: true,
    },
  ];

  return (
    <div className="mobile-chart-wrapper">
      {/* 时间周期选择器 */}
      {memoizedAvailableView.length > 1 && (
        <div className="w-full px-3 md:px-0 mb-2">
          <div 
            className="w-full overflow-x-auto md:overflow-x-visible pb-2 md:pb-0"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "var(--gray-a6) var(--gray-a3)",
              WebkitOverflowScrolling: "touch",
              maxWidth: "100%",
            }}
          >
            <Flex justify="center" className="w-full min-w-max md:min-w-0">
              <SegmentedControl.Root
                radius="full"
                value={hoursView}
                onValueChange={setHoursView}
                className="flex-shrink-0"
                style={{ 
                  transform: "scale(0.95)",
                  transformOrigin: "center",
                  height: "38px",
                  minWidth: "fit-content"
                }}
              >
                {memoizedAvailableView.map((view) => (
                  <SegmentedControl.Item
                    key={view.label}
                    value={view.label}
                    className="whitespace-nowrap px-3 py-1"
                    style={{ 
                      fontSize: "13px",
                      minWidth: "70px",
                      height: "100%"
                    }}
                  >
                    {view.label === "real-time" ? t("common.real_time") : view.label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            </Flex>
          </div>
        </div>
      )}
      
      {/* Loading 和 Error 状态 */}
      {loading && (
        <div className="w-full h-40 flex items-center justify-center">
          <Loading />
        </div>
      )}
      
      {error && (
        <div className="w-full h-40 flex items-center justify-center" style={{ color: "var(--red-11)" }}>
          {error}
        </div>
      )}
      
      {/* 图表网格 */}
      {!loading && !error && (
        <div className="mobile-chart-grid">
        {charts.map((chart, index) => (
          <Card key={index} className="mobile-chart-card" style={{ 
            borderRadius: "12px",
            backgroundColor: "var(--color-panel-solid)"
          }}>
            <div className="mobile-chart-header">
              <Text size="2" weight="medium" className="mobile-chart-title">{chart.title}</Text>
              <div className="mobile-chart-value">{chart.value}</div>
            </div>
            <div className="mobile-chart">
              <ResponsiveContainer width="100%" height="100%">
                {chart.isMultiLine ? (
                  <LineChart data={chart.data} margin={chartConfig.margin}>
                    <XAxis
                      dataKey="time"
                      hide
                    />
                    <YAxis hide />
                    <Tooltip
                      content={(props) => <CustomTooltip {...props} chartTitle={chart.title} />}
                      wrapperStyle={{ outline: "none" }}
                    />
                    {Array.isArray(chart.dataKey) &&
                      chart.dataKey.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={Array.isArray(chart.color) ? chart.color[i] : chart.color}
                          strokeWidth={chartConfig.strokeWidth}
                          dot={false}
                          animationDuration={0}
                        />
                      ))}
                  </LineChart>
                ) : (
                  <AreaChart data={chart.data} margin={chartConfig.margin}>
                    <XAxis
                      dataKey="time"
                      hide
                    />
                    <YAxis
                      hide
                      domain={chart.domain}
                    />
                    <Tooltip
                      content={(props) => <CustomTooltip {...props} chartTitle={chart.title} />}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Area
                      type="monotone"
                      dataKey={chart.dataKey as string}
                      stroke={chart.color as string}
                      fill={chart.color as string}
                      fillOpacity={0.3}
                      strokeWidth={chartConfig.strokeWidth}
                      dot={false}
                      animationDuration={0}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
              </Card>
          ))}
        </div>
      )}
    </div>
  );
};
