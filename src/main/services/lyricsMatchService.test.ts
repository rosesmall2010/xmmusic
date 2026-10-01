/**
 * 批量歌词匹配的进度节流自检
 *
 * 背景：同目录已有 .lrc 时 matchOne 走 linked_local 快路径不发网络，
 * 并发 10 路下每秒可完成上百首。不节流会用进度 IPC 淹掉渲染进程
 * （封面批量早有 250ms 节流，歌词一直缺）。
 *
 * 这里用「文件不存在」这条同样不发网络的快路径构造批量，
 * 断言进度推送次数不随歌曲数线性增长，且末态不被节流吞掉。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 服务在主进程用 electron.net 发请求；本用例全走不发网络的快路径，mock 即可
vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

import LyricsMatchService from './lyricsMatchService'
import type { LyricsMatchProgress } from '../../shared/types/lyrics'
import type { MusicItem } from '../../shared/types/music'

const makeSongs = (n: number): MusicItem[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    // 不存在的路径：matchOne 立即返回 failed，不发网络
    filePath: `/xmmusic-test/definitely-missing/${i}.mp3`,
    fileName: `${i}.mp3`,
    title: `song-${i}`
  })) as unknown as MusicItem[]

describe('LyricsMatchService.matchBatch 进度节流', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // 连续失败会触发 rotateApi 的 console.warn，与本用例无关
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('推送次数不随歌曲数线性增长，且末态完整', async () => {
    const svc = new LyricsMatchService()
    const songs = makeSongs(60)
    const emits: LyricsMatchProgress[] = []

    const summary = await svc.matchBatch({} as never, songs, {
      concurrency: 10,
      onProgress: (p) => emits.push(p)
    })

    expect(summary.total).toBe(60)
    expect(summary.failed).toBe(60)
    expect(summary.cancelled).toBe(false)

    // 不节流时为「每首开始 + 每首结束」≈ 2n + 并发收尾 ≈ 130 次。
    // 节流后只剩强制推送（初始 / 各 worker 收尾 / 末首 / 最终）加少量定时推送。
    expect(emits.length).toBeLessThan(songs.length)

    // 末态必须推到位，不能被节流吞掉
    const last = emits[emits.length - 1]
    expect(last.current).toBe(60)
    expect(last.total).toBe(60)
    expect(last.failed).toBe(60)
    expect(last.tasks?.every((t) => t.status === 'idle')).toBe(true)
  })

  it('空列表也推一次，便于 UI 拿到 startedAt / concurrency', async () => {
    const svc = new LyricsMatchService()
    const emits: LyricsMatchProgress[] = []

    const summary = await svc.matchBatch({} as never, [], {
      concurrency: 4,
      onProgress: (p) => emits.push(p)
    })

    expect(summary.total).toBe(0)
    expect(emits).toHaveLength(1)
    // workerCount 会按 max(total,1) 钳制，空列表下为 1（与封面批量一致）；
    // 真实并发数由 handler 的 preparing 进度先行告知 UI
    expect(emits[0].concurrency).toBe(1)
    expect(emits[0].startedAt).toBeGreaterThan(0)
  })

  it('批量结束后不再有迟到的节流推送', async () => {
    const svc = new LyricsMatchService()
    const emits: LyricsMatchProgress[] = []

    await svc.matchBatch({} as never, makeSongs(12), {
      concurrency: 4,
      onProgress: (p) => emits.push(p)
    })

    const countAtFinish = emits.length
    // 节流定时器若没在 finally 里清掉，会在这段时间内再推一次
    await new Promise((r) => setTimeout(r, 400))
    expect(emits.length).toBe(countAtFinish)
  })
})
