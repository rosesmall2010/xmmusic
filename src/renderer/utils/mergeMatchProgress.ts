/**
 * 合并主进程进度与本地乐观进度：
 * - 保留更早的 startedAt，避免耗时回跳
 * - 枚举 preparing（total=0）时保留乐观的 total / 标题 / 并发槽
 */
export function mergeMatchProgress<
  T extends {
    startedAt?: number
    elapsedMs?: number
    total?: number
    currentTitle?: string
    concurrency?: number
    tasks?: unknown[]
  }
>(prev: T | null | undefined, incoming: T): T {
  let merged: T = { ...incoming }

  if (
    prev?.startedAt &&
    typeof incoming.startedAt === 'number' &&
    prev.startedAt > 0 &&
    prev.startedAt < incoming.startedAt
  ) {
    const startedAt = prev.startedAt
    merged = {
      ...merged,
      startedAt,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    }
  }

  if ((incoming.total ?? 0) === 0 && (prev?.total ?? 0) > 0) {
    merged = {
      ...merged,
      total: prev!.total,
      currentTitle: incoming.currentTitle || prev!.currentTitle || '',
      concurrency: prev!.concurrency ?? incoming.concurrency,
      tasks: prev!.tasks?.length ? prev!.tasks : incoming.tasks
    }
  }

  return merged
}
