import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl, Switch, Button, Badge } from "@radix-ui/themes";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import Loading from "@/components/loading";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { cutPeakValues, interpolateNullsLinear } from "@/utils/RecordHelper";
import Tips from "@/components/ui/tips";
import { Eye, EyeOff, Radio } from "lucide-react";
import { getPingRecords } from "@/api/connect";
import { buildTimeRanges } from "@/utils/timeRanges";

interface PingRecord {
  client: string;
  task_id: number;
  time: string;
  value: number;
}
interface TaskInfo {
  id: number;
  name: string;
  interval: number;
  loss: number;
  p99?: number;
  p50?: number;
  p99_p50_ratio?: number;
  min?: number;
  max?: number;
  avg?: number;
  latest?: number;
  total?: number;
  type?: string;
}
//const MAX_POINTS = 1000;
const colors = [
  "var(--red-9)",
  "var(--green-9)",
  "var(--violet-9)",
  "var(--cyan-9)",
  "var(--sky-9)",
  "var(--purple-9)",
  "var(--orange-9)",
  "var(--amber-9)",
];

const PingChart = ({ uuid }: { uuid: string }) => {
  const { t } = useTranslation();
  const { publicInfo } = usePublicInfo();
  const max_record_preserve_time = publicInfo?.ping_record_preserve_time || 0;
  const avaliableView = useMemo(() => {
    return buildTimeRanges(max_record_preserve_time, t);
  }, [max_record_preserve_time, t]);

  // 默认视图设为1小时
  const initialView =
    avaliableView.find((v) => v.hours === 1)?.label ||
    avaliableView[0]?.label ||
    "";
  const [view, setView] = useState<string>(initialView);
  const [hours, setHours] = useState<number>(
    avaliableView.find((v) => v.label === initialView)?.hours || 1
  ); // Add hours state

  const [remoteData, setRemoteData] = useState<PingRecord[] | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cutPeak, setCutPeak] = useState(false);

  // Update hours state when view changes
  useEffect(() => {
    const selected = avaliableView.find((v) => v.label === view);
    if (selected && selected.hours !== undefined) {
      const nextHours = selected.hours;
      const frame = requestAnimationFrame(() => {
        setHours(nextHours);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [view, avaliableView]);

  useEffect(() => {
    if (!uuid) return;
    if (!hours) {
      // Use hours directly
      const frame = requestAnimationFrame(() => {
        setRemoteData(null);
        setError(null);
        setLoading(false);
      });
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setError(null);
    });
    const controller = new AbortController();
    (async () => {
      try {
        const result = await getPingRecords([uuid], hours, [], controller.signal);
        const records = result.records;
        records.sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
        );
        setRemoteData(records);
        setTasks(result?.tasks || []);
        setLoading(false);
      } catch (err: any) {
        setError(err?.message || "Error");
        setLoading(false);
      }
    })();
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [hours, uuid]);

  const midData = useMemo(() => {
    // 与 Mini 保持一致：只使用合并抖动后的真实锚点，并截取到最后 hours 窗口范围。
    const data = remoteData || [];
    if (!data.length) return [];

    // 参考间隔（若缺失则 60s），仅用于抖动合并容差
    const taskIntervals = tasks
      .map((t) => t.interval)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const fallbackIntervalSec = taskIntervals.length
      ? Math.min(...taskIntervals)
      : 60;

    // 合并抖动：0.25 * 参考间隔（0.8s ~ 6s）
    const toleranceMs = Math.min(
      6000,
      Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25))
    );
    const grouped: Record<number, any> = {};
    const anchors: number[] = [];
    for (const rec of data) {
      const ts = new Date(rec.time).getTime();
      let anchor: number | null = null;
      for (const a of anchors) {
        if (Math.abs(a - ts) <= toleranceMs) {
          anchor = a;
          break;
        }
      }
      const use = anchor ?? ts;
      if (!grouped[use]) {
        grouped[use] = { time: new Date(use).toISOString() };
        if (anchor === null) anchors.push(use);
      }
      grouped[use][rec.task_id] = rec.value < 0 ? null : rec.value;
    }
    const merged = Object.values(grouped).sort(
      (a: any, b: any) =>
        new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    // 截取最后 hours 窗口，并多保留一个窗口外的前置点，便于边界插值
    const lastTs = new Date(
      (merged as any[])[(merged as any[]).length - 1].time
    ).getTime();
    const fromTs = lastTs - hours * 3600_000;
    let startIdx = 0;
    for (let i = 0; i < (merged as any[]).length; i++) {
      const ts = new Date((merged as any[])[i].time).getTime();
      if (ts >= fromTs) {
        startIdx = Math.max(0, i - 1);
        break;
      }
    }
    const clipped = (merged as any[]).slice(startIdx);
    return clipped;
  }, [remoteData, tasks, hours]);

  // 组装图表数据
  const chartData = useMemo(() => {
    let full = midData;
    // 如果开启削峰，应用削峰处理
    if (cutPeak && tasks.length > 0) {
      const taskKeys = tasks.map((task) => String(task.id));
      full = cutPeakValues(midData, taskKeys);
    }
    // 无论是否平滑显示曲线，都做一次“真实感插值”：
    // 仅在相邻有效点之间用线性插值填补中间 null，避免大量零散段。
    // 数据驱动：每条线使用“中位采样间隔 * 倍数（默认6）”作为最大插值跨度，并钳制在 [2min, 30min]。
    if (tasks.length > 0 && full.length > 0) {
      const keys = tasks.map((t) => String(t.id));
      full = interpolateNullsLinear(full, keys, {
        maxGapMultiplier: 6,
        minCapMs: 2 * 60_000,
        maxCapMs: 30 * 60_000,
      });
    }
    return full;
  }, [cutPeak, midData, tasks]);

  // 时间格式化
  const timeFormatter = (value: any, index: number) => {
    if (!chartData.length) return "";
    if (index === 0 || index === chartData.length - 1) {
      if (hours < 24) {
        // Use hours for conditional formatting
        return new Date(value).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return new Date(value).toLocaleDateString([], {
        month: "2-digit",
        day: "2-digit",
      });
    }
    return "";
  };
  const lableFormatter = (value: any) => {
    const date = new Date(value);
    if (hours < 24) {
      // Use hours for conditional formatting
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 颜色配置
  const chartConfig = useMemo(() => {
    const config: Record<string, any> = {};
    tasks.forEach((task, idx) => {
      config[task.id] = {
        label: `${task.name}${
          typeof task.p99_p50_ratio === "number"
            ? ` (${t("chart.volatility")}: ${task.p99_p50_ratio.toFixed(2)})`
            : ""
        }`,
        color: colors[idx % colors.length],
      };
    });
    return config;
  }, [tasks, t]);

  const latestValues = useMemo(() => {
    if (!remoteData || !tasks.length) return [];
    const map = new Map<number, PingRecord>();

    // 为每个task找到最新的有效值（>=0）
    for (const task of tasks) {
      for (let i = remoteData.length - 1; i >= 0; i--) {
        const rec = remoteData[i];
        if (rec.task_id === task.id && rec.value >= 0) {
          map.set(task.id, rec);
          break;
        }
      }
    }

    return tasks.map((task, idx) => ({
      ...task,
      value: map.get(task.id)?.value ?? null,
      time: map.get(task.id)?.time ?? null,
      color: colors[idx % colors.length],
    }));
  }, [remoteData, tasks]);

  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

  const toggleLine = useCallback((id: number) => {
    const key = String(id);
    setHiddenLines((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAllLines = useCallback(() => {
    const allHidden = tasks.every((task) => hiddenLines[String(task.id)]);
    const newHiddenState: Record<string, boolean> = {};
    tasks.forEach((task) => {
      newHiddenState[String(task.id)] = !allHidden;
    });
    setHiddenLines(newHiddenState);
  }, [tasks, hiddenLines]);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 顶部控制栏：时间范围选择 */}
      <div className="w-full overflow-x-auto px-1">
        <div className="w-max mx-auto">
          <SegmentedControl.Root
            value={view}
            onValueChange={(newView) => {
              setView(newView);
              const selected = avaliableView.find((v) => v.label === newView);
              if (selected && selected.hours !== undefined) {
                setHours(selected.hours);
              }
            }}
            className="node-detail-toggle"
          >
            {avaliableView.map((v) => (
              <SegmentedControl.Item
                key={v.label}
                value={v.label}
                className="capitalize"
              >
                {v.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        </div>
      </div>

      {loading && (
        <div className="py-12 flex justify-center items-center w-full">
          <Loading />
        </div>
      )}

      {error && (
        <div className="py-8 text-center text-red-11 w-full text-sm font-medium">
          {error}
        </div>
      )}

      {!loading && !error && latestValues.length > 0 && (
        <div className="w-full rounded-2xl border border-gray-a4 bg-panel-solid p-4 md:p-5 shadow-xs flex flex-col gap-4">
          {/* Header of targets section */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-a3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-accent-a2 text-accent-9 flex items-center justify-center">
                <Radio size={16} />
              </div>
              <span className="font-bold text-sm text-gray-12">
                {t("nodeCard.ping", { defaultValue: "测速节点监控" })}
              </span>
              <Badge color="blue" variant="soft" size="1">
                {tasks.length} {t("chart.targets", { defaultValue: "目标" })}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              {/* 削峰平滑 */}
              <div className="flex items-center gap-2">
                <Switch
                  id="cut-peak"
                  checked={cutPeak}
                  onCheckedChange={setCutPeak}
                  size="1"
                />
                <label
                  htmlFor="cut-peak"
                  className="text-xs font-medium text-gray-11 flex items-center gap-1 cursor-pointer select-none"
                >
                  {t("chart.cutPeak")}
                  <Tips size="14">
                    <span dangerouslySetInnerHTML={{ __html: t("chart.cutPeak_tips") }} />
                  </Tips>
                </label>
              </div>

              {/* 全部显示 / 全部隐藏 */}
              <Button
                variant="soft"
                size="1"
                onClick={toggleAllLines}
                className="flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              >
                {tasks.every((task) => hiddenLines[String(task.id)]) ? (
                  <>
                    <Eye size={13} />
                    <span>{t("chart.showAll")}</span>
                  </>
                ) : (
                  <>
                    <EyeOff size={13} />
                    <span>{t("chart.hideAll")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Metric Targets Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 w-full">
            {latestValues.map((task) => {
              const isHidden = !!hiddenLines[String(task.id)];
              const latencyColor =
                task.value === null
                  ? "text-gray-9"
                  : task.value < 80
                  ? "text-green-11"
                  : task.value < 180
                  ? "text-amber-11"
                  : "text-red-11";

              return (
                <div
                  key={task.id}
                  onClick={() => toggleLine(task.id)}
                  className={`group relative p-2.5 rounded-xl border transition-all duration-200 cursor-pointer select-none flex flex-col justify-between gap-2 ${
                    isHidden
                      ? "opacity-45 bg-gray-a2 border-gray-a3 hover:opacity-75"
                      : "bg-gray-a2 hover:bg-gray-a3 border-gray-a4 hover:border-accent-7 hover:shadow-xs"
                  }`}
                  style={{
                    borderLeftWidth: "3px",
                    borderLeftColor: isHidden ? "var(--gray-7)" : task.color,
                  }}
                  title={isHidden ? t("chart.click_to_show", { defaultValue: "点击显示此折线" }) : t("chart.click_to_hide", { defaultValue: "点击隐藏此折线" })}
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: isHidden ? "var(--gray-8)" : task.color,
                          boxShadow: !isHidden ? `0 0 6px ${task.color}90` : "none",
                        }}
                      />
                      <span className={`font-semibold text-xs truncate ${isHidden ? "line-through text-gray-9" : "text-gray-12"}`}>
                        {task.name}
                      </span>
                    </div>

                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <Tips size="13" color="gray">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {typeof task.min === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.min")}</span>
                              <span className="font-mono text-right">{Math.round(task.min)} ms</span>
                            </>
                          )}
                          {typeof task.max === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.max")}</span>
                              <span className="font-mono text-right">{Math.round(task.max)} ms</span>
                            </>
                          )}
                          {typeof task.avg === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.avg")}</span>
                              <span className="font-mono text-right">{Math.round(task.avg)} ms</span>
                            </>
                          )}
                          {typeof task.latest === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.latest")}</span>
                              <span className="font-mono text-right">{Math.round(task.latest)} ms</span>
                            </>
                          )}
                          {typeof task.p50 === "number" && (
                            <>
                              <span className="text-gray-10">P50</span>
                              <span className="font-mono text-right">{Math.round(task.p50)} ms</span>
                            </>
                          )}
                          {typeof task.p99 === "number" && (
                            <>
                              <span className="text-gray-10">P99</span>
                              <span className="font-mono text-right">{Math.round(task.p99)} ms</span>
                            </>
                          )}
                          {typeof task.p99_p50_ratio === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.volatility")}</span>
                              <span className="font-mono text-right">{task.p99_p50_ratio.toFixed(2)}</span>
                            </>
                          )}
                          {typeof task.loss === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.lossRate")}</span>
                              <span className="font-mono text-right">{Number(task.loss).toFixed(1)}%</span>
                            </>
                          )}
                          {typeof task.interval === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.interval")}</span>
                              <span className="font-mono text-right">{task.interval}s</span>
                            </>
                          )}
                          {task.type && (
                            <>
                              <span className="text-gray-10">{t("chart.type")}</span>
                              <span className="font-mono uppercase text-right">{task.type}</span>
                            </>
                          )}
                          {typeof task.total === "number" && (
                            <>
                              <span className="text-gray-10">{t("chart.total")}</span>
                              <span className="font-mono text-right">{task.total}</span>
                            </>
                          )}
                        </div>
                      </Tips>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-a3">
                    <div className="flex items-baseline gap-1 font-mono">
                      <span className={`font-bold text-sm ${latencyColor}`}>
                        {task.value !== null ? Math.round(task.value) : "-"}
                      </span>
                      {task.value !== null && <span className="text-[10px] text-gray-9">ms</span>}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {typeof task.loss === "number" && (
                        <Badge
                          size="1"
                          color={task.loss > 0 ? "red" : "green"}
                          variant="soft"
                          className="text-[10px] px-1 py-0"
                        >
                          {Number(task.loss).toFixed(1)}%
                        </Badge>
                      )}
                      {typeof task.p99_p50_ratio === "number" && (
                        <span
                          className="text-[10px] text-gray-10 font-mono bg-gray-a3 px-1 py-0.5 rounded"
                          title="P99/P50 波动率"
                        >
                          ~{task.p99_p50_ratio.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Line Chart Card */}
      <div className="w-full rounded-2xl border border-gray-a4 bg-panel-solid p-4 md:p-5 shadow-xs">
        {chartData.length === 0 ? (
          <div className="w-full h-48 flex items-center justify-center text-gray-9 text-sm">
            {t("common.none")}
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="w-full h-[320px] md:h-[360px]">
            <LineChart
              data={chartData}
              accessibilityLayer
              margin={{ top: 10, right: 16, bottom: 10, left: 10 }}
            >
              <CartesianGrid vertical={false} stroke="var(--gray-a3)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickFormatter={timeFormatter}
                interval="preserveStartEnd"
                minTickGap={40}
                tick={{ fontSize: 11, fill: "var(--gray-9)" }}
                allowDuplicatedCategory={false}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                unit=" ms"
                allowDecimals={false}
                orientation="left"
                type="number"
                tick={{ fontSize: 11, fill: "var(--gray-9)" }}
                width={50}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--gray-a6)", strokeWidth: 1, strokeDasharray: "3 3" }}
                formatter={(v: any) => `${Math.round(v)} ms`}
                content={
                  <ChartTooltipContent
                    labelFormatter={lableFormatter}
                    indicator="dot"
                  />
                }
              />
              {tasks.map((task, idx) => (
                <Line
                  key={task.id}
                  dataKey={String(task.id)}
                  name={task.name}
                  stroke={colors[idx % colors.length]}
                  dot={false}
                  isAnimationActive={false}
                  strokeWidth={2}
                  connectNulls={false}
                  type={cutPeak ? "basis" : "linear"}
                  hide={!!hiddenLines[String(task.id)]}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
};

export default PingChart;
