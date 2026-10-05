/**
 * 酷狗封面搜索（仅主进程）
 * 歌词接口没有图，走歌曲搜索拿 imgurl / union_cover。
 */
import { net } from 'electron'

const TIMEOUT_MS = 10000
const SEARCH_LIMIT = 12
const SEARCH_URL = 'https://mobilecdn.kugou.com/api/v3/search/song'
const UA = 'Mozilla/5.0 (compatible; xmmusic/1.2.7)'

export interface KugouCoverTrack {
  id: number
  name: string
  artistName: string
  albumName?: string
  coverUrl: string
}

const fetchJson = async (url: string, signal?: AbortSignal): Promise<any> => {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS)
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      Referer: 'https://www.kugou.com/'
    },
    signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
  })
  if (!res.ok) throw new Error(`酷狗封面 HTTP ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('酷狗封面搜索响应无效')
  }
}

/** 把 {size} 换成具体边长 */
const expandKugouImage = (raw: unknown, size = 400): string | undefined => {
  if (typeof raw !== 'string') return undefined
  const u = raw.trim().replace(/\{size\}/g, String(size))
  if (!/^https?:\/\//i.test(u)) return undefined
  return u
}

class KugouCoverClient {
  async search(keyword: string, signal?: AbortSignal): Promise<KugouCoverTrack[]> {
    const q = keyword.trim()
    if (!q) return []

    const qs = new URLSearchParams({
      format: 'json',
      keyword: q,
      page: '1',
      pagesize: String(SEARCH_LIMIT)
    })
    const data = await fetchJson(`${SEARCH_URL}?${qs.toString()}`, signal)
    const list: any[] = Array.isArray(data?.data?.info)
      ? data.data.info
      : Array.isArray(data?.data?.lists)
        ? data.data.lists
        : []
    if (
      !Array.isArray(list) ||
      (list.length === 0 && data?.status !== 1 && data?.status !== 0 && data?.error_code)
    ) {
      throw new Error(data?.error || `酷狗封面搜索失败 status=${data?.status}`)
    }

    const out: KugouCoverTrack[] = []
    const seen = new Set<number>()
    for (const raw of list) {
      const coverUrl =
        expandKugouImage(raw?.imgurl) ||
        expandKugouImage(raw?.Image) ||
        expandKugouImage(raw?.trans_param?.union_cover) ||
        expandKugouImage(raw?.album_sizable_cover)
      if (!coverUrl) continue
      let id = Number(raw?.audio_id || raw?.id || raw?.scid || 0)
      if (!id) {
        const hash = String(raw?.hash || raw?.HQFileHash || '').trim()
        if (!hash) continue
        let h = 0
        for (let i = 0; i < hash.length; i++) {
          h = (Math.imul(31, h) + hash.charCodeAt(i)) | 0
        }
        id = (Math.abs(h) || 1) + 1_000_000_000
      }
      if (seen.has(id)) continue
      seen.add(id)
      const name = String(raw?.songname || raw?.SongName || raw?.song || '').trim()
      if (!name) continue
      out.push({
        id,
        name,
        artistName: String(raw?.singername || raw?.SingerName || raw?.singer || '').trim(),
        albumName: raw?.album_name
          ? String(raw.album_name)
          : raw?.AlbumName
            ? String(raw.AlbumName)
            : undefined,
        coverUrl
      })
      if (out.length >= SEARCH_LIMIT) break
    }
    return out
  }
}

export default new KugouCoverClient()
