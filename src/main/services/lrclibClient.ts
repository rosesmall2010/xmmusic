/**
 * LRCLIB 歌词客户端（仅主进程）
 * 基于 https://github.com/notigorwastaken/lrclib-api（npm: lrclib-api）
 * 手动候选与网易云并行；自动/批量匹配优先使用，不够格再回退网易云。站点无封面。
 */
import { net } from 'electron'
import { Client, type FindLyricsResponse } from 'lrclib-api'

const TIMEOUT_MS = 10000
const SEARCH_LIMIT = 12
const CACHE_MAX = 200
const CLIENT_NAME = 'xmmusic 1.2.5 (https://github.com/rosesmall2010/xmmusic)'

export interface LrclibTrack {
  id: number
  name: string
  artistName: string
  albumName?: string
  /** 秒（与本地 MusicItem.duration 一致） */
  duration?: number
  instrumental: boolean
  syncedLyrics: string | null
  plainLyrics: string | null
}

type SearchParams = {
  q?: string
  trackName?: string
  artistName?: string
  /** 曲长（秒），会换成库要求的毫秒传给 API */
  durationSec?: number
}

const mapRecord = (raw: FindLyricsResponse): LrclibTrack => ({
  id: raw.id,
  name: String(raw.trackName || raw.name || '').trim(),
  artistName: String(raw.artistName || '').trim(),
  albumName: raw.albumName ? String(raw.albumName) : undefined,
  duration: typeof raw.duration === 'number' ? raw.duration : undefined,
  instrumental: raw.instrumental === true,
  syncedLyrics:
    typeof raw.syncedLyrics === 'string' && raw.syncedLyrics.trim()
      ? raw.syncedLyrics.trim()
      : null,
  plainLyrics:
    typeof raw.plainLyrics === 'string' && raw.plainLyrics.trim()
      ? raw.plainLyrics.trim()
      : null
})

class LrclibClient {
  private client = new Client({
    timeoutMs: TIMEOUT_MS,
    clientName: CLIENT_NAME,
    // 与歌词/封面其它网络请求一致：走 Electron net（跟随系统代理）
    fetch: ((input: any, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : typeof input?.href === 'string'
            ? input.href
            : String(input?.url || input)
      return net.fetch(url, init)
    }) as typeof fetch
  })

  private cache = new Map<number, LrclibTrack>()

  private remember(track: LrclibTrack) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(track.id, track)
  }

  private takeCached(list: FindLyricsResponse[]): LrclibTrack[] {
    const out: LrclibTrack[] = []
    const seen = new Set<number>()
    for (const raw of list) {
      if (!raw?.id || seen.has(raw.id)) continue
      seen.add(raw.id)
      const track = mapRecord(raw)
      this.remember(track)
      out.push(track)
      if (out.length >= SEARCH_LIMIT) break
    }
    return out
  }

  async search(params: SearchParams & { signal?: AbortSignal }): Promise<LrclibTrack[]> {
    const durationMs =
      params.durationSec != null && params.durationSec > 0
        ? Math.round(params.durationSec * 1000)
        : undefined
    const artist = params.artistName?.trim() || undefined

    // lrclib-api 自带 timeoutMs，外部取消信号经 RequestInit 透传（其内部会用 AbortSignal.any 合并）
    const init: RequestInit | undefined = params.signal ? { signal: params.signal } : undefined

    let list: FindLyricsResponse[]
    if (params.trackName?.trim()) {
      list = await this.client.searchLyrics(
        {
          track_name: params.trackName.trim(),
          artist_name: artist,
          duration: durationMs
        },
        init
      )
    } else if (params.q?.trim()) {
      list = await this.client.searchLyrics(
        {
          query: params.q.trim(),
          artist_name: artist,
          duration: durationMs
        },
        init
      )
    } else {
      return []
    }
    return this.takeCached(list)
  }

  async getById(id: number, signal?: AbortSignal): Promise<LrclibTrack> {
    const cached = this.cache.get(id)
    if (cached && (cached.syncedLyrics || cached.instrumental)) return cached

    const track = mapRecord(
      await this.client.findLyrics({ id }, signal ? { signal } : undefined)
    )
    this.remember(track)
    return track
  }
}

export default new LrclibClient()
