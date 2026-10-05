/**
 * QQ 音乐歌词客户端（仅主进程）
 * 搜曲：u.y.qq.com/cgi-bin/musicu.fcg；拉词：c.y.qq.com lyric（需 Referer）
 */
import { net } from 'electron'

const TIMEOUT_MS = 10000
const SEARCH_LIMIT = 12
const CACHE_MAX = 200
const SEARCH_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const LYRIC_URL = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg'
const UA = 'Mozilla/5.0 (compatible; xmmusic/1.2.5)'
const REFERER = 'https://y.qq.com/'

export const qqAlbumCoverUrl = (albumMid: string, size = 800): string | undefined => {
  const mid = String(albumMid || '').trim()
  if (!mid) return undefined
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${mid}.jpg`
}

export interface QqLyricTrack {
  /** songmid */
  mid: string
  name: string
  artistName: string
  albumName?: string
  /** 专辑 mid，拼封面用 */
  albumMid?: string
  /** 专辑封面（有 albumMid 时） */
  coverUrl?: string
  /** 秒 */
  duration?: number
}

const fetchJson = async (
  url: string,
  init?: { method?: string; body?: string; contentType?: string; signal?: AbortSignal }
): Promise<any> => {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS)
  const res = await net.fetch(url, {
    method: init?.method || 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      Referer: REFERER,
      ...(init?.contentType ? { 'Content-Type': init.contentType } : {})
    },
    body: init?.body,
    signal: init?.signal ? AbortSignal.any([timeoutSignal, init.signal]) : timeoutSignal
  })
  if (!res.ok) throw new Error(`QQ 音乐 HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('QQ 音乐响应无效')
  }
}

/** 把 songmid 映射成稳定正整数，便于沿用 songId 字段做列表 key */
export const qqMidToSongId = (mid: string): number => {
  let h = 0
  for (let i = 0; i < mid.length; i++) {
    h = (Math.imul(31, h) + mid.charCodeAt(i)) | 0
  }
  // 避开与网易云小 id 撞车观感：取绝对值并加偏移
  return (Math.abs(h) || 1) + 1_000_000_000
}

class QqLyricsClient {
  private cache = new Map<string, QqLyricTrack & { lyric?: string }>()

  private remember(track: QqLyricTrack & { lyric?: string }) {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(track.mid, track)
  }

  async search(keyword: string, signal?: AbortSignal): Promise<QqLyricTrack[]> {
    const q = keyword.trim()
    if (!q) return []

    const body = JSON.stringify({
      req_1: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          num_per_page: SEARCH_LIMIT,
          page_num: 1,
          query: q,
          search_type: 0
        }
      }
    })
    const data = await fetchJson(SEARCH_URL, {
      method: 'POST',
      body,
      contentType: 'application/json',
      signal
    })

    const list: any[] =
      data?.req_1?.data?.body?.song?.list ||
      data?.req_1?.data?.song?.list ||
      []
    if (!Array.isArray(list)) return []

    const out: QqLyricTrack[] = []
    const seen = new Set<string>()
    for (const raw of list) {
      const mid = String(raw?.mid || raw?.songmid || '').trim()
      if (!mid || seen.has(mid)) continue
      seen.add(mid)
      const singers: string[] = Array.isArray(raw?.singer)
        ? raw.singer.map((s: any) => String(s?.name || '').trim()).filter(Boolean)
        : []
      const albumMid = String(raw?.album?.mid || raw?.albumMid || raw?.albummid || '').trim()
      const albumName = raw?.album?.name
        ? String(raw.album.name)
        : raw?.albumname
          ? String(raw.albumname)
          : undefined
      const track: QqLyricTrack = {
        mid,
        name: String(raw?.title || raw?.name || raw?.songname || '').trim(),
        artistName: singers.join(' / '),
        albumName,
        albumMid: albumMid || undefined,
        coverUrl: qqAlbumCoverUrl(albumMid),
        duration:
          typeof raw?.interval === 'number' && raw.interval > 0
            ? raw.interval
            : undefined
      }
      if (!track.name) continue
      this.remember(track)
      out.push(track)
      if (out.length >= SEARCH_LIMIT) break
    }
    return out
  }

  async getLyric(mid: string, signal?: AbortSignal): Promise<string | null> {
    const songmid = String(mid || '').trim()
    if (!songmid) throw new Error('QQ 歌曲 mid 无效')

    const cached = this.cache.get(songmid)
    if (cached?.lyric) return cached.lyric

    const qs = new URLSearchParams({
      songmid,
      format: 'json',
      nobase64: '1',
      g_tk: '5381'
    })
    const data = await fetchJson(`${LYRIC_URL}?${qs.toString()}`, { signal })
    if (data?.code !== 0 && data?.retcode !== 0) {
      // 无歌词常见 code
      if (data?.code === -1901 || data?.code === 700) return null
      throw new Error(data?.msg || `QQ 拉词失败 code=${data?.code}`)
    }
    let lyric = String(data?.lyric || '').trim()
    if (!lyric) return null
    // 偶发实体编码
    lyric = lyric
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')

    this.remember({
      mid: songmid,
      name: cached?.name || '',
      artistName: cached?.artistName || '',
      albumName: cached?.albumName,
      albumMid: cached?.albumMid,
      coverUrl: cached?.coverUrl,
      duration: cached?.duration,
      lyric
    })
    return lyric
  }
}

export default new QqLyricsClient()
