/**
 * 在线歌词匹配（参考 music-lrc-match：搜索网易云 → 相似度筛选 → 拉取 LRC）
 * 仅在主进程使用
 */
import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { dirname, join, basename, extname } from 'path'
import { net } from 'electron'
import type { MusicItem } from '../../shared/types/music'
import type {
  LyricsMatchResult,
  LyricsMatchProgress,
  LyricsMatchSummary,
  LyricsMatchStatus,
  LyricsMatchCandidate
} from '../../shared/types/lyrics'
import type MusicDatabase from '../database/db'
import LyricsService from './lyricsService'

const SEARCH_APIS = [
  'https://music-api.0m2.cn',
  'https://music.api.ravelloh.top',
  'https://music.api.coderace.top',
  'https://neteaseapi.imgugu.ink'
]

const SEARCH_PATH = '/search?limit=3&type=1&keywords='
/** 交互选择时多返回几条，方便用户挑选 */
const SEARCH_PATH_PICK = '/search?limit=8&type=1&keywords='
const LRC_API = 'https://music.163.com/api/song/media?id='
/** 与参考脚本一致：低于此相似度跳过（自动匹配） */
const SIMILARITY_THRESHOLD = 75
/** 选择对话框展示的最低相似度（仍列出，供人工挑选） */
const PICK_LIST_MIN_SIMILARITY = 35
const REQUEST_TIMEOUT_MS = 12000
const REQUEST_GAP_MS = 120
/** 批量匹配同时进行的任务数 */
const BATCH_CONCURRENCY = 3

type SearchSong = {
  id: number
  name: string
  artists: string
  album?: string
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 去掉括号内容，便于相似度比较 */
const stripParen = (s: string) =>
  s.replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').replace(/\s+/g, ' ').trim()

/**
 * SequenceMatcher.quick_ratio 近似实现（字符 bigram Dice）
 */
const similarPercent = (a: string, b: string): number => {
  const s1 = stripParen(a).toLowerCase()
  const s2 = stripParen(b).toLowerCase()
  if (!s1 && !s2) return 100
  if (!s1 || !s2) return 0
  if (s1 === s2) return 100
  if (s1.length === 1 || s2.length === 1) {
    return s1.includes(s2) || s2.includes(s1) ? 50 : 0
  }
  const bigrams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      map.set(bg, (map.get(bg) || 0) + 1)
    }
    return map
  }
  const m1 = bigrams(s1)
  const m2 = bigrams(s2)
  let overlap = 0
  for (const [k, v] of m1) {
    const o = m2.get(k)
    if (o) overlap += Math.min(v, o)
  }
  const total = (s1.length - 1) + (s2.length - 1)
  return total > 0 ? Math.round((2 * overlap / total) * 1000) / 10 : 0
}

const fetchText = async (url: string): Promise<string> => {
  // Electron net 跟随系统代理，比裸 fetch 更稳
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; xmmusic/1.1.6)',
      Accept: 'application/json,text/plain,*/*'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

export default class LyricsMatchService {
  private lyricsService = new LyricsService()
  private apiIndex = 0
  private cancelled = false

  cancel() {
    this.cancelled = true
  }

  resetCancel() {
    this.cancelled = false
  }

  /** 构建搜索关键词：优先「歌手 + 歌名」，否则用文件名 */
  buildKeyword(music: MusicItem): string {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const unknownTitle = !title || title === '未知标题' || title === 'Unknown'
    const unknownArtist = !artist || artist === '未知艺术家' || artist === 'Unknown Artist' || artist === '未知歌手'
    if (!unknownTitle && !unknownArtist) return `${artist} ${title}`
    if (!unknownTitle) return title
    const base = basename(music.fileName || music.filePath || '', extname(music.fileName || music.filePath || ''))
    return base || title || artist || ''
  }

  /** 用于相似度比较的本地展示名 */
  buildLocalName(music: MusicItem): string {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const unknownTitle = !title || title === '未知标题' || title === 'Unknown'
    const unknownArtist = !artist || artist === '未知艺术家' || artist === 'Unknown Artist' || artist === '未知歌手'
    if (!unknownTitle && !unknownArtist) return `${artist} - ${title}`
    if (!unknownTitle) return title
    return basename(music.fileName || music.filePath || '', extname(music.fileName || music.filePath || ''))
  }

  private async searchSongs(keyword: string, pickMode = false): Promise<SearchSong[]> {
    if (!keyword.trim()) return []
    const encoded = encodeURIComponent(keyword.trim())
    const path = pickMode ? SEARCH_PATH_PICK : SEARCH_PATH
    const limit = pickMode ? 8 : 3
    let lastErr: unknown
    for (let attempt = 0; attempt < SEARCH_APIS.length; attempt++) {
      const idx = (this.apiIndex + attempt) % SEARCH_APIS.length
      const base = SEARCH_APIS[idx]
      try {
        const text = await fetchText(base + path + encoded)
        const json = JSON.parse(text)
        const songs = json?.result?.songs
        if (!Array.isArray(songs) || songs.length === 0) {
          this.apiIndex = idx
          return []
        }
        this.apiIndex = idx
        return songs.slice(0, limit).map((s: any) => ({
          id: Number(s.id),
          name: String(s.name || ''),
          artists: Array.isArray(s.artists)
            ? s.artists.map((a: any) => a?.name).filter(Boolean).join(' ')
            : '',
          album: s.album?.name ? String(s.album.name) : undefined
        }))
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('搜索 API 全部失败')
  }

  private pickBestSong(localName: string, songs: SearchSong[]): { song: SearchSong; similarity: number } | null {
    let best: { song: SearchSong; similarity: number } | null = null
    for (const song of songs) {
      const remote = `${song.artists} - ${song.name}`
      const score = similarPercent(localName, remote)
      if (!best || score > best.similarity) best = { song, similarity: score }
    }
    return best
  }

  private async fetchLyric(songId: number): Promise<{ lyric: string | null; instrumental: boolean }> {
    const text = await fetchText(LRC_API + String(songId))
    const json = JSON.parse(text)
    if (json?.nolyric === true || json?.nolyric === 'true') {
      return { lyric: null, instrumental: true }
    }
    const lyric = typeof json?.lyric === 'string' ? json.lyric.trim() : ''
    if (!lyric) return { lyric: null, instrumental: false }
    // 网易云纯音乐有时仍有很短说明句
    if (/纯音乐|请欣赏/.test(lyric) && lyric.length < 80) {
      return { lyric: null, instrumental: true }
    }
    return { lyric, instrumental: false }
  }

  private resolveLrcPath(music: MusicItem): string {
    const dir = dirname(music.filePath)
    const base = basename(music.fileName || music.filePath, extname(music.fileName || music.filePath))
    return join(dir, `${base}.lrc`)
  }

  /** 歌曲是否已有可用歌词（DB 路径或同目录 sidecar） */
  hasExistingLyrics(music: MusicItem): boolean {
    if (music.lyricsPath && existsSync(music.lyricsPath)) return true
    if (music.filePath && this.lyricsService.findLyricsFile(music.filePath)) return true
    return false
  }

  /**
   * 搜索候选列表（按相似度降序），供全屏播放手动挑选
   */
  async searchCandidates(music: MusicItem): Promise<LyricsMatchCandidate[]> {
    const keyword = this.buildKeyword(music)
    if (!keyword) return []
    const songs = await this.searchSongs(keyword, true)
    const localName = this.buildLocalName(music)
    const list: LyricsMatchCandidate[] = songs.map((song) => ({
      songId: song.id,
      name: song.name,
      artists: song.artists,
      album: song.album,
      similarity: similarPercent(localName, `${song.artists} - ${song.name}`)
    }))
    return list
      .filter((c) => c.similarity >= PICK_LIST_MIN_SIMILARITY)
      .sort((a, b) => b.similarity - a.similarity)
  }

  /**
   * 预览候选歌词文本（供选择对话框展示），不写文件/不写库
   */
  async previewLyric(songId: number): Promise<{ lyric: string | null; instrumental: boolean }> {
    return this.fetchLyric(songId)
  }

  /**
   * 按用户选定的网易云 songId 下载并写入歌词
   */
  async applyCandidate(
    db: MusicDatabase,
    music: MusicItem,
    songId: number
  ): Promise<LyricsMatchResult> {
    const title = music.title || music.fileName
    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }

    let lyricPayload: { lyric: string | null; instrumental: boolean }
    try {
      lyricPayload = await this.fetchLyric(songId)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '获取歌词失败' }
    }

    if (lyricPayload.instrumental) {
      return { musicId: music.id, title, status: 'skipped_instrumental', message: '纯音乐无歌词' }
    }
    if (!lyricPayload.lyric) {
      return { musicId: music.id, title, status: 'failed', message: '歌词为空' }
    }

    const lrcPath = this.resolveLrcPath(music)
    try {
      writeFileSync(lrcPath, lyricPayload.lyric, 'utf8')
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '写入歌词文件失败' }
    }

    db.updateAllMusic(music.id, { lyrics_path: lrcPath })
    return {
      musicId: music.id,
      title,
      status: 'matched',
      lyricsPath: lrcPath,
      message: '匹配成功'
    }
  }

  /**
   * 匹配单曲歌词并写入同目录 .lrc，更新数据库
   * @param force 为 true 时覆盖已有歌词（重新匹配）
   */
  async matchOne(
    db: MusicDatabase,
    music: MusicItem,
    options: { force?: boolean; shouldAbort?: () => boolean } = {}
  ): Promise<LyricsMatchResult> {
    const force = options.force === true
    const title = music.title || music.fileName
    const isAborted = () => this.cancelled || options.shouldAbort?.() === true
    const cancelledResult = (): LyricsMatchResult => ({
      musicId: music.id,
      title,
      status: 'failed',
      message: '已取消'
    })

    if (isAborted()) return cancelledResult()

    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }

    // 非强制：已有有效歌词路径则跳过
    if (!force && music.lyricsPath && existsSync(music.lyricsPath)) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_has_lyrics',
        lyricsPath: music.lyricsPath,
        message: '已有歌词'
      }
    }

    // 非强制：同目录已有 lrc 则直接关联
    if (!force) {
      const local = this.lyricsService.findLyricsFile(music.filePath)
      if (local) {
        if (isAborted()) return cancelledResult()
        db.updateAllMusic(music.id, { lyrics_path: local })
        return {
          musicId: music.id,
          title,
          status: 'linked_local',
          lyricsPath: local,
          message: '已关联本地歌词'
        }
      }
    }

    const keyword = this.buildKeyword(music)
    if (!keyword) {
      return { musicId: music.id, title, status: 'failed', message: '无法构造搜索关键词' }
    }

    let songs: SearchSong[]
    try {
      songs = await this.searchSongs(keyword)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '搜索失败' }
    }

    if (isAborted()) return cancelledResult()

    if (songs.length === 0) {
      return { musicId: music.id, title, status: 'failed', message: '未找到搜索结果' }
    }

    const localName = this.buildLocalName(music)
    const best = this.pickBestSong(localName, songs)
    if (!best || best.similarity < SIMILARITY_THRESHOLD) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_low_similarity',
        similarity: best?.similarity ?? 0,
        message: `匹配度过低(${best?.similarity ?? 0}%)`
      }
    }

    let lyricPayload: { lyric: string | null; instrumental: boolean }
    try {
      lyricPayload = await this.fetchLyric(best.song.id)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '获取歌词失败' }
    }

    if (isAborted()) return cancelledResult()

    if (lyricPayload.instrumental) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_instrumental',
        similarity: best.similarity,
        message: '纯音乐无歌词'
      }
    }
    if (!lyricPayload.lyric) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        similarity: best.similarity,
        message: '歌词为空'
      }
    }

    if (isAborted()) return cancelledResult()

    const lrcPath = this.resolveLrcPath(music)
    try {
      if (isAborted()) return cancelledResult()
      writeFileSync(lrcPath, lyricPayload.lyric, 'utf8')
    } catch (e: any) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        message: e?.message || '写入歌词文件失败'
      }
    }

    // 取消可能发生在写文件后、写库前：删除刚写入的文件并终止，避免落盘/写库
    if (isAborted()) {
      try {
        if (existsSync(lrcPath)) unlinkSync(lrcPath)
      } catch {
        // 删除失败时仅保留取消结果，避免再写库
      }
      return cancelledResult()
    }

    db.updateAllMusic(music.id, { lyrics_path: lrcPath })
    return {
      musicId: music.id,
      title,
      status: 'matched',
      lyricsPath: lrcPath,
      similarity: best.similarity,
      message: force ? '重新匹配成功' : '匹配成功'
    }
  }

  /**
   * 批量匹配：默认只处理无歌词歌曲；forceAll 时对传入列表强制重匹配
   * 同时最多 BATCH_CONCURRENCY 路并发，加快大批量匹配
   */
  async matchBatch(
    db: MusicDatabase,
    songs: MusicItem[],
    options: {
      force?: boolean
      onProgress?: (progress: LyricsMatchProgress) => void
    } = {}
  ): Promise<LyricsMatchSummary> {
    this.resetCancel()
    const force = options.force === true
    const total = songs.length
    let success = 0
    let failed = 0
    let skipped = 0
    let completed = 0
    let nextIndex = 0
    const results: Array<LyricsMatchResult | undefined> = new Array(total)
    let lastDoneTitle = ''

    const bump = (status: LyricsMatchStatus) => {
      if (status === 'matched' || status === 'linked_local') success++
      else if (status === 'failed') failed++
      else skipped++
    }

    const emitProgress = (lastStatus?: LyricsMatchStatus) => {
      options.onProgress?.({
        current: completed,
        total,
        success,
        failed,
        skipped,
        currentTitle: lastDoneTitle,
        lastStatus
      })
    }

    const runOne = async (index: number) => {
      if (this.cancelled) return
      const music = songs[index]
      const result = await this.matchOne(db, music, {
        force,
        shouldAbort: () => this.cancelled
      })
      // 取消后：丢弃进行中任务的回调，不计入统计/结果
      if (this.cancelled) return
      results[index] = result
      bump(result.status)
      completed++
      lastDoneTitle = music.title || music.fileName
      emitProgress(result.status)
    }

    const workerCount = Math.min(BATCH_CONCURRENCY, total)
    const workers = Array.from({ length: workerCount }, async () => {
      while (!this.cancelled) {
        const index = nextIndex++
        if (index >= total) break
        await runOne(index)
        // 同 worker 领取下一首前稍作间隔，减轻上游 API 压力
        if (!this.cancelled && nextIndex < total) {
          await sleep(REQUEST_GAP_MS)
        }
      }
    })

    try {
      await Promise.all(workers)
      return {
        total,
        success,
        failed,
        skipped,
        cancelled: this.cancelled,
        results: results.filter((r): r is LyricsMatchResult => !!r)
      }
    } finally {
      // 批量结束（含取消）后复位，避免后续单曲 matchOne 一直返回「已取消」
      this.resetCancel()
    }
  }
}
