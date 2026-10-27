// Provider calibration and traffic quotas use decimal GB. Keep RAM, disk and
// instantaneous transfer-rate formatting independent.
export function formatTrafficGB(bytes: number, compact = false, decimals = 2): string {
  const value = (Math.max(0, bytes) / 1_000_000_000).toFixed(Math.max(2, decimals));
  return `${value}${compact ? "GB" : " GB"}`;
}
