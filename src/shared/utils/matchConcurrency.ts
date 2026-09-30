/** 批量匹配并发路数：默认与上下限 */
export const DEFAULT_MATCH_CONCURRENCY = 3
export const MIN_MATCH_CONCURRENCY = 1
export const MAX_MATCH_CONCURRENCY = 10

export function clampMatchConcurrency(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MATCH_CONCURRENCY
  return Math.min(
    MAX_MATCH_CONCURRENCY,
    Math.max(MIN_MATCH_CONCURRENCY, Math.floor(n))
  )
}
