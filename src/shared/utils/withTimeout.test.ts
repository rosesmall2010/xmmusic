/**
 * withTimeout 自检
 *
 * 守的是扫描卡死那条路：读取会阻塞的文件会让 parseFile / MD5 读流永不 settle，
 * 必须有超时把扫描放行；同时超时护栏自己不能留下未清的定时器。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout, TimeoutError, isTimeoutError } from './withTimeout'

const never = () => new Promise<never>(() => {})
const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('永不 settle 的操作会按时超时（这正是扫描卡死的场景）', async () => {
    await expect(withTimeout(never, 30, '处理超时')).rejects.toThrow(TimeoutError)
  })

  it('超时错误可被 isTimeoutError 识别，且携带文案', async () => {
    try {
      await withTimeout(never, 20, '处理超时：a.mp3')
      throw new Error('不应走到这里')
    } catch (e) {
      expect(isTimeoutError(e)).toBe(true)
      expect((e as Error).message).toBe('处理超时：a.mp3')
    }
  })

  it('按时完成则原样返回结果', async () => {
    await expect(withTimeout(() => after(5, 'ok'), 500, 'x')).resolves.toBe('ok')
  })

  it('原始错误原样抛出，不被包装成超时', async () => {
    const boom = new Error('ENOENT: 文件不存在')
    await expect(withTimeout(() => Promise.reject(boom), 500, 'x')).rejects.toThrow(
      'ENOENT: 文件不存在'
    )
  })

  it('ms <= 0 表示不设超时', async () => {
    await expect(withTimeout(() => after(5, 'ok'), 0, 'x')).resolves.toBe('ok')
    await expect(withTimeout(() => after(5, 'ok'), -1, 'x')).resolves.toBe('ok')
  })

  it('成功路径不残留定时器（否则两万多个文件会撑满事件循环）', async () => {
    vi.useFakeTimers()
    const p = withTimeout(() => Promise.resolve('ok'), 120_000, 'x')
    await expect(p).resolves.toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('失败路径同样不残留定时器', async () => {
    vi.useFakeTimers()
    const p = withTimeout(() => Promise.reject(new Error('boom')), 120_000, 'x')
    await expect(p).rejects.toThrow('boom')
    expect(vi.getTimerCount()).toBe(0)
  })
})
