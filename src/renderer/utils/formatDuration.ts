/**
 * 时长按有效单位缩短显示（省略前置为 0 的天/小时）：
 * - ≥1 天：`1天 02:03:04`
 * - ≥1 小时：`01:13:00`
 * - 不足 1 小时：`13:56`
 * @param dayLabel 天单位文案，默认「天」；英文界面传入 "d" 等
 */
export function formatDurationDhms(ms: number, dayLabel = '天'): string {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000) || 0)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (days > 0) {
    return `${days}${dayLabel} ${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }
  if (hours > 0) {
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`
  }
  return `${pad(mins)}:${pad(secs)}`
}
