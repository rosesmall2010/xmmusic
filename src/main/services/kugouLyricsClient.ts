/**
 * 酷狗歌词客户端（仅主进程）
 * 搜候选：lyrics.kugou.com/search；下载 LRC：/download（content 为 base64）
 */
import { net } from 'electron'

const TIMEOUT_MS = 10000
const SEARCH_LIMIT = 12
const CACHE_MAX = 200
const SEARCH_URL = 'https://lyrics.kugou.com/search'
const DOWNLOAD_URL = 'https://lyrics.kugou.com/download'
const UA = 'Mozilla/5.0 (compatible; xmmusic/1.2.5)'

export interface KugouLyricTrack {
  id: number
  accessKey: string
  name: string
  artistName: string
  /** 秒 */
  duration?: number
  score?: number
}

type CacheEntry = KugouLyricTrack & { lyric?: string }

const fetchText = async (url: string, externalSignal?: AbortSignal): Promise<string> => {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS)
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://www.kugou.com/'
    },
    signal: externalSignal ? AbortSignal.any([timeoutSignal, externalSignal]) : timeoutSignal
  })
  if (!res.ok) throw new Error(`酷狗 HTTP ${res.status}`)
  return await res.text()
}

/** 酷狗 duration 有时是秒、有时是毫秒 */
const normalizeDurationSec = (raw: unknown): number | undefined => {
  if (typeof raw !== 'number' || !(raw > 0)) return undefined
  return raw > 10000 ? Math.round(raw / 1000) : Math.round(raw)
}

class KugouLyricsClient {
  private cache = new Map<number, CacheEntry>()

  private remember(track: CacheEntry) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(track.id, track)
  }

  async search(params: {
    keyword: string
    durationSec?: number
    signal?: AbortSignal
  }): Promise<KugouLyricTrack[]> {
    const keyword = params.keyword.trim()
    if (!keyword) return []

    const qs = new URLSearchParams({
      ver: '1',
      man: 'yes',
      client: 'pc',
      keyword,
      hash: '',
      duration:
        params.durationSec != null && params.durationSec > 0
          ? String(Math.round(params.durationSec * 1000))
          : ''
    })
    const text = await fetchText(`${SEARCH_URL}?${qs.toString()}`, params.signal)
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('酷狗搜索响应无效')
    }
    if (data?.status !== 200 && data?.status !== 0) {
      throw new Error(data?.info || `酷狗搜索失败 status=${data?.status}`)
    }

    const list: any[] = Array.isArray(data?.candidates) ? data.candidates : []
    const out: KugouLyricTrack[] = []
    const seen = new Set<number>()
    for (const raw of list) {
      const id = Number(raw?.id)
      const accessKey = String(raw?.accesskey || raw?.accessKey || '').trim()
      if (!id || !accessKey || seen.has(id)) continue
      seen.add(id)
      const track: KugouLyricTrack = {
        id,
        accessKey,
        name: String(raw?.song || raw?.songname || '').trim(),
        artistName: String(raw?.singer || raw?.artist || '').trim(),
        duration: normalizeDurationSec(raw?.duration),
        score: typeof raw?.score === 'number' ? raw.score : undefined
      }
      if (!track.name) continue
      this.remember(track)
      out.push(track)
      if (out.length >= SEARCH_LIMIT) break
    }
    return out
  }

  async getLyric(id: number, accessKey: string, signal?: AbortSignal): Promise<string | null> {
    const key = String(accessKey || '').trim()
    if (!id || !key) throw new Error('酷狗歌词凭证无效')

    const cached = this.cache.get(id)
    if (cached?.lyric) return cached.lyric

    const qs = new URLSearchParams({
      ver: '1',
      client: 'pc',
      id: String(id),
      accesskey: key,
      fmt: 'lrc',
      charset: 'utf8'
    })
    const text = await fetchText(`${DOWNLOAD_URL}?${qs.toString()}`, signal)
    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('酷狗歌词响应无效')
    }
    if (data?.status !== 200 && data?.status !== 0) {
      throw new Error(data?.info || `酷狗拉词失败 status=${data?.status}`)
    }
    const content = String(data?.content || '').trim()
    if (!content) return null

    let lyric: string
    try {
      lyric = Buffer.from(content, 'base64').toString('utf8').trim()
    } catch {
      throw new Error('酷狗歌词解码失败')
    }
    if (!lyric) return null

    this.remember({
      id,
      accessKey: key,
      name: cached?.name || '',
      artistName: cached?.artistName || '',
      duration: cached?.duration,
      lyric
    })
    return lyric
  }
}

export default new KugouLyricsClient()
