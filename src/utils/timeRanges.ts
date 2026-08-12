export interface TimeRangeOption {
  label: string;
  hours?: number;
}

type Translate = (key: string, options?: { count: number }) => string;

export function buildTimeRanges(
  retentionHours: number,
  t: Translate,
  includeRealtime = false,
): TimeRangeOption[] {
  const limit = Number.isFinite(retentionHours) && retentionHours > 0
    ? retentionHours
    : 24;
  const hours = [1, 6, 12, 24, 24 * 7];
  for (let value = 24 * 15; value <= limit; value += 24 * 15) {
    hours.push(value);
  }

  const options: TimeRangeOption[] = includeRealtime
    ? [{ label: t("common.real_time") }]
    : [];
  for (const value of hours) {
    if (value > limit) continue;
    options.push({
      label: value < 24
        ? t("chart.hours", { count: value })
        : t("chart.days", { count: value / 24 }),
      hours: value,
    });
  }
  return options;
}
