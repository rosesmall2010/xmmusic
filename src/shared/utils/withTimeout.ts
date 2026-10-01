/**
 * 给可能永不 settle 的 Promise 加超时护栏
 *
 * 用途：扫描单个文件时，读取会阻塞的文件（FIFO、卡死的网络盘、下载不下来的
 * iCloud 占位文件）会让 `music-metadata.parseFile` 与 MD5 读流**双双永久挂起**，
 * 既不抛错也不结束，整轮扫描就此卡死且无从得知是哪个文件。
 *
 * 注意（已知天花板）：超时只是让调用方继续往下走，**并不能真正中断底层操作**，
 * 挂住的 fd 会一直留到进程退出。要真正中断需要底层支持 AbortSignal，
 * music-metadata 当前版本不支持；等它支持后可以把这里换成可中断实现。
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export const isTimeoutError = (e: unknown): boolean =>
  e instanceof TimeoutError ||
  (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'TimeoutError')

/**
 * @param fn 要执行的异步操作
 * @param ms 超时毫秒数；<= 0 表示不设超时，直接返回原 Promise
 * @param message 超时时抛出的错误文案
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return fn()

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), ms)
      })
    ])
  } finally {
    // 正常返回时必须清掉定时器，否则每个文件都留一个待触发的 timer，
    // 大批量扫描会把事件循环撑满、进程也迟迟不退出
    if (timer !== undefined) clearTimeout(timer)
  }
}
