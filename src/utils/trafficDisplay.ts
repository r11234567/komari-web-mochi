// Provider calibration and traffic quotas use decimal GB. Keep RAM, disk and
// instantaneous transfer-rate formatting independent.
export function formatTrafficGB(bytes: number, compact = false, decimals = 2): string {
  const value = (Math.max(0, bytes) / 1_000_000_000).toFixed(Math.max(2, decimals));
  return `${value}${compact ? "GB" : " GB"}`;
}

/**
 * Format traffic reset countdown in "还剩多少d多少h" format.
 */
export function formatTrafficResetTime(
  nextReset?: string | Date | null,
  t?: (key: string, options?: any) => string
): string {
  if (!nextReset) return "";
  const date = typeof nextReset === "string" ? new Date(nextReset) : nextReset;
  const time = date.getTime();
  if (!Number.isFinite(time)) return "";
  const diffMs = time - Date.now();
  if (diffMs <= 0) {
    return t ? t("nodeCard.trafficResetNow", { defaultValue: "还剩 0h" }) : "还剩 0h";
  }
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return t
      ? t("nodeCard.trafficResetDays", {
          defaultValue: `还剩 ${days}d ${hours}h`,
          days,
          hours,
        })
      : `还剩 ${days}d ${hours}h`;
  }
  return t
    ? t("nodeCard.trafficResetHours", {
        defaultValue: `还剩 ${hours}h`,
        hours,
      })
    : `还剩 ${hours}h`;
}
