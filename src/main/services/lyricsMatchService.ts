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
/** 自动/批量匹配：低于此相似度跳过 */
const SIMILARITY_THRESHOLD = 50
const REQUEST_TIMEOUT_MS = 12000
const REQUEST_GAP_MS = 120
/** 批量匹配同时进行的任务数（搜索串行、拉词可并行） */
const BATCH_CONCURRENCY = 3
/** 自动匹配：已知歌手时，远端艺人相似度低于此值则跳过该候选 */
const ARTIST_SCORE_FLOOR = 50
/** 自动匹配：歌手未知且艺人对不上时，歌名相似度须达到此值 */
const UNKNOWN_ARTIST_MIN_SIMILARITY = 80
/**
 * 搜索结果「歌名」相关度下限（只比本地歌名候选，不能用含歌手的关键词冒充相关）
 * 搜索常返回同歌手其它热门曲：关键词相关度高、歌名却完全不对
 */
const MIN_TITLE_RELEVANCE = 30
/** 批量中连续失败/低相似次数达到此值则强制换镜像 */
const FAIL_STREAK_ROTATE = 3
/** 批量每处理这么多首强制轮转一次镜像，避免长跑粘死 */
const BATCH_ROTATE_EVERY = 25
/** 视为「无歌手」的占位/广告标签（小写比较；部分下载站写入「为您精心打造」） */
const JUNK_ARTISTS = new Set([
  '未知艺术家',
  '未知歌手',
  '未知',
  'unknown',
  'unknown artist',
  'various artists',
  '群星',
  '为您精心打造'
])
/**
 * 文件名前的曲目编号：「133摇摇欲坠」「275.The Island」「01 - 晴天」
 * 1~2 位无分隔的数字不剥（「17岁」）；分隔符后紧跟数字不剥（「3.14」）
 */
const TRACK_NO_PREFIX = /^\s*(?:\d{1,4}\s*[.、．_]+(?!\d)|\d{1,3}\s+[-－–—]+\s+|\d{3}(?=\D))\s*/
/** 标签歌名只剥带分隔符的编号（「03.晴天」）；无分隔的三位数多为真实歌名（「100种生活」） */
const TAG_TRACK_NO_PREFIX = /^\s*(?:\d{1,4}\s*[.、．_]+(?!\d)|\d{1,3}\s+[-－–—]+\s+)\s*/
/** 抓轨/合集常见的占位歌名「曲目 15」「Track-03」「Audio Track 1」「第15首」 */
const PLACEHOLDER_TITLE = /^(?:(?:曲目|音轨|(?:audio\s*)?track)[\s_-]*\d+|第\s*\d+\s*首)$/i
/**
 * 文件名里歌名与歌手的分隔符（含全角/长破折号）
 * 两侧都是英文字母且无空格的连字符不拆：「Twenty-One」「Jay-Z」「K-POP」
 */
const NAME_SEPARATOR = /\s+[-－–—]+\s+|(?<![A-Za-z])[-－–—]+|[-－–—]+(?![A-Za-z])|\s+_\s+/
const PURE_DIGITS = /^\d+$/

type SearchSong = {
  id: number
  name: string
  artists: string
  /** 逐个艺人名，合唱曲按单人比对 */
  artistList: string[]
  album?: string
}

type SearchOutcome = {
  songs: SearchSong[]
  lowRelevance: boolean
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
  // Electron net 跟随系统代理
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; xmmusic/1.1.6)',
      Accept: 'application/json,text/plain,*/*',
      'Cache-Control': 'no-cache'
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
  /** 搜索请求串行化，避免非官方镜像并发时串结果 */
  private searchMutex: Promise<void> = Promise.resolve()

  cancel() {
    this.cancelled = true
  }

  resetCancel() {
    this.cancelled = false
  }

  /** 复位取消标志与镜像游标（批量取消后不复位会让随后的手动匹配直接返回「已取消」） */
  resetSessionState() {
    this.cancelled = false
    this.apiIndex = 0
  }

  /** 手动入口：复位会话状态 */
  async prepareManualSearch() {
    this.resetSessionState()
  }

  /** 换到下一个搜索镜像（连续失败 / 低相似时调用） */
  private rotateApi(reason?: string) {
    const prev = this.apiIndex
    this.apiIndex = (this.apiIndex + 1) % SEARCH_APIS.length
    if (reason) {
      console.warn(
        `[lyricsMatch] 换镜像 ${SEARCH_APIS[prev]} → ${SEARCH_APIS[this.apiIndex]}（${reason}）`
      )
    }
  }

  private isUnknownTitle(title: string): boolean {
    const t = (title || '').trim()
    return !t || t === '未知标题' || t === 'Unknown' || PLACEHOLDER_TITLE.test(t)
  }

  private isUnknownArtist(artist: string): boolean {
    const a = (artist || '').trim()
    return !a || JUNK_ARTISTS.has(a.toLowerCase()) || /^[?？\s]+$/.test(a)
  }

  /**
   * 生成搜索关键词与打分用歌名候选
   * 歌手未知时 title 往往就是文件名（如「133摇摇欲坠-小蓝背心 _ 飞行工作室」），
   * 需去编号、按分隔符拆段：整串搜会返回无关歌曲，整串打分也永远过不了线
   */
  private searchHints(music: MusicItem): { keyword: string; titleHints: string[] } {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const unknownTitle = this.isUnknownTitle(title)
    // 单字歌名 Dice inclusion 恰为 50，易误过自动门槛：不作为打分候选
    const usable = (s: string) => stripParen(s).length >= 2
    if (!unknownTitle && !this.isUnknownArtist(artist)) {
      const tagTitle = title.replace(TAG_TRACK_NO_PREFIX, '').trim() || title
      return {
        keyword: `${artist} ${tagTitle}`,
        titleHints: [...new Set([tagTitle, title])].filter(usable)
      }
    }
    const fileBase = basename(music.fileName || music.filePath || '', extname(music.fileName || music.filePath || ''))
    const source = (unknownTitle ? fileBase : title).trim()
    const cleaned = source.replace(TRACK_NO_PREFIX, '').trim() || source
    if (this.isUnknownTitle(cleaned) || PURE_DIGITS.test(cleaned)) return { keyword: '', titleHints: [] }
    const split = (s: string) =>
      s
        .split(NAME_SEPARATOR)
        .map((p) => p.trim())
        .filter((p) => p && !PURE_DIGITS.test(p))
    const segments = split(cleaned)
    const keyword = stripParen(segments.join(' ')) || cleaned
    // 同时保留剥编号前的首段：「999朵玫瑰」这类数字开头的真实歌名也能打满分
    const titleHints = [...new Set([...segments, cleaned, ...split(source).slice(0, 1)])].filter(usable)
    return { keyword, titleHints }
  }

  /** 艺人打分：歌手未知时用文件名各段比对；已知时按远端逐个艺人取最高（合唱曲） */
  private artistScore(music: MusicItem, titleHints: string[], song: SearchSong): number {
    const artist = (music.artist || '').trim()
    if (this.isUnknownArtist(artist)) return this.titleScore(titleHints, song.artists || '')
    let best = similarPercent(artist, song.artists || '')
    for (const name of song.artistList) best = Math.max(best, similarPercent(artist, name))
    return best
  }

  /** 构建搜索关键词：优先「歌手 + 歌名」，否则用清洗后的歌名/文件名 */
  buildKeyword(music: MusicItem): string {
    return this.searchHints(music).keyword
  }

  /** 歌名打分：取各候选歌名段的最高分（文件名里歌名/歌手顺序不定） */
  private titleScore(titleHints: string[], name: string): number {
    let best = 0
    for (const hint of titleHints) best = Math.max(best, similarPercent(hint, name))
    return best
  }

  /**
   * 对某条远端结果的歌名打分：歌手未知时排除「就是该曲艺人」的段，
   * 防止文件名里的歌手段（如「小蓝背心」）撞上同名歌曲拿满分
   */
  private songTitleScore(music: MusicItem, titleHints: string[], song: SearchSong): number {
    if (titleHints.length < 2 || !this.isUnknownArtist(music.artist || '')) {
      return this.titleScore(titleHints, song.name || '')
    }
    const artists = [song.artists, ...song.artistList].filter(Boolean)
    const isArtistHint = (hint: string) => artists.some((a) => similarPercent(hint, a) >= 80)
    return this.titleScore(titleHints.filter((h) => !isArtistHint(h)), song.name || '')
  }

  private async withSearchLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void
    const prev = this.searchMutex
    this.searchMutex = new Promise<void>((resolve) => {
      release = resolve
    })
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /**
   * @param titleHints 本地歌名候选，用于丢弃「有结果但完全不相关」的镜像响应
   * @returns lowRelevance 为 true 表示有结果但歌名都对不上（区别于「搜不到」）
   */
  private async searchSongs(
    keyword: string,
    pickMode: boolean,
    titleHints: string[]
  ): Promise<SearchOutcome> {
    if (!keyword.trim()) return { songs: [], lowRelevance: false }
    // 取消批量后，已在锁上排队的搜索不再发请求
    return this.withSearchLock(() =>
      this.cancelled
        ? Promise.resolve({ songs: [], lowRelevance: false })
        : this.searchSongsUnlocked(keyword, pickMode, titleHints)
    )
  }

  /**
   * 结果与期望歌名的相关度（只比曲名）
   * 切勿用「歌手+歌名」关键词去比：返回同歌手其它歌时会被误判为相关
   */
  private maxTitleRelevance(titleHints: string[], songs: SearchSong[]): number {
    let best = 0
    for (const song of songs) {
      best = Math.max(best, this.titleScore(titleHints, song.name || ''))
    }
    return best
  }

  private async searchSongsUnlocked(
    keyword: string,
    pickMode: boolean,
    titleHints: string[]
  ): Promise<SearchOutcome> {
    const encoded = encodeURIComponent(keyword.trim())
    const path = pickMode ? SEARCH_PATH_PICK : SEARCH_PATH
    const limit = pickMode ? 8 : 3
    // 防缓存/错误复用：避免长跑后拿到上一首的搜索响应
    const bust = () => `&_=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let lastErr: unknown
    let sawEmptyOk = false
    let sawLowRelevance = false
    let bestMapped: SearchSong[] | null = null
    let bestTitleScore = -1
    // 快照起始游标：扫描期间其它批量任务的 rotateApi 不影响本轮顺序
    const startIdx = this.apiIndex
    let bestIdx = startIdx

    // 扫遍全部镜像，按「歌名相关度」择优；禁止「第一个勉强过线就 sticky」
    for (let attempt = 0; attempt < SEARCH_APIS.length; attempt++) {
      const idx = (startIdx + attempt) % SEARCH_APIS.length
      const base = SEARCH_APIS[idx]
      try {
        const text = await fetchText(base + path + encoded + bust())
        const json = JSON.parse(text)
        const songs = json?.result?.songs
        if (!Array.isArray(songs) || songs.length === 0) {
          sawEmptyOk = true
          lastErr = undefined
          continue
        }
        const mapped: SearchSong[] = songs.slice(0, limit).map((s: any) => {
          const artistList: string[] = Array.isArray(s.artists)
            ? s.artists.map((a: any) => String(a?.name || '')).filter(Boolean)
            : []
          return {
            id: Number(s.id),
            name: String(s.name || ''),
            artists: artistList.join(' '),
            artistList,
            album: s.album?.name ? String(s.album.name) : undefined
          }
        })

        const titleScore = this.maxTitleRelevance(titleHints.length ? titleHints : [keyword], mapped)

        // 手动挑选不设下限：低相关结果仍作兜底候选，交由用户预览决定
        if (!pickMode && titleScore < MIN_TITLE_RELEVANCE) {
          console.warn(
            `[lyricsMatch] 镜像 ${base} 搜索「${keyword}」歌名相关度过低(${titleScore}%)，换下一个`
          )
          sawLowRelevance = true
          lastErr = undefined
          continue
        }

        if (titleScore > bestTitleScore) {
          bestTitleScore = titleScore
          bestMapped = mapped
          bestIdx = idx
        }
        // 歌名已达自动写入门槛：无需继续扫（镜像实为同一后端，多扫只增加等待）
        if (titleScore >= SIMILARITY_THRESHOLD) break
      } catch (e) {
        lastErr = e
      }
    }

    if (bestMapped) {
      this.apiIndex = bestIdx
      return { songs: bestMapped, lowRelevance: false }
    }
    if (sawLowRelevance || sawEmptyOk) return { songs: [], lowRelevance: sawLowRelevance }
    if (lastErr) throw lastErr instanceof Error ? lastErr : new Error('搜索 API 全部失败')
    return { songs: [], lowRelevance: false }
  }

  private pickBestSong(
    music: MusicItem,
    songs: SearchSong[],
    titleHints: string[]
  ): { song: SearchSong; similarity: number } | null {
    // searchHints 已滤掉 <2 字的歌名：无可用候选则不自动写入
    if (titleHints.length === 0) return null
    const unknownArtist = this.isUnknownArtist(music.artist || '')
    let best: { song: SearchSong; similarity: number; artistScore: number } | null = null
    for (const song of songs) {
      const similarity = this.songTitleScore(music, titleHints, song)
      // 远端单字曲名靠 inclusion 拿 50 分，非完全一致时不自动采用
      if (stripParen(song.name || '').length < 2 && similarity < 100) continue
      // 歌手未知时艺人分仅用于同名曲打平（如同名「极乐世界」优先郑钧版）
      const artistScore = this.artistScore(music, titleHints, song)
      // 已知歌手时艺人分过低则跳过，避免同名异艺人写串
      if (!unknownArtist && artistScore < ARTIST_SCORE_FLOOR) continue
      // 歌手未知且文件名各段都对不上艺人：歌名须高度一致才自动写入，防「Low Of The World 叮当」配到 Aqua《Around the World》
      if (unknownArtist && artistScore < ARTIST_SCORE_FLOOR && similarity < UNKNOWN_ARTIST_MIN_SIMILARITY) continue
      if (
        !best ||
        similarity > best.similarity ||
        (similarity === best.similarity && artistScore > best.artistScore)
      ) {
        best = { song, similarity, artistScore }
      }
    }
    return best
  }

  /** 拉词走网易云官方接口，与搜索镜像分离；不进 searchMutex，保留批量多路拉词 */
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
    // 与 findLyricsFile 一致，只用真实文件路径，避免 fileName 与路径不一致时写错/读错
    const base = basename(music.filePath, extname(music.filePath))
    return join(dir, `${base}.lrc`)
  }

  /** 歌曲是否已有可用歌词（DB 路径或同目录 sidecar） */
  hasExistingLyrics(music: MusicItem): boolean {
    if (music.lyricsPath && existsSync(music.lyricsPath)) return true
    if (music.filePath && this.lyricsService.findLyricsFile(music.filePath)) return true
    return false
  }

  /**
   * 搜索候选列表（按相似度降序），供手动挑选
   * 不设相似度下限：全部结果入列，由用户预览后决定用或取消
   */
  async searchCandidates(music: MusicItem): Promise<LyricsMatchCandidate[]> {
    const { keyword, titleHints } = this.searchHints(music)
    if (!keyword) return []
    console.log(
      `[lyricsMatch] 手动候选 musicId=${music.id} title="${music.title}" keyword="${keyword}" hints=${JSON.stringify(titleHints)}`
    )
    const hints = titleHints.length ? titleHints : [keyword]
    const { songs } = await this.searchSongs(keyword, true, hints)
    const scored = songs.map((song) => ({
      candidate: {
        songId: song.id,
        name: song.name,
        artists: song.artists,
        album: song.album,
        similarity: this.songTitleScore(music, hints, song)
      } as LyricsMatchCandidate,
      artistScore: this.artistScore(music, hints, song)
    }))
    // 同名曲按艺人相似度排在前面
    scored.sort(
      (a, b) => b.candidate.similarity - a.candidate.similarity || b.artistScore - a.artistScore
    )
    return scored.map((s) => s.candidate)
  }

  /**
   * 预览候选歌词文本（供选择对话框展示），不写文件/不写库
   */
  async previewLyric(songId: number): Promise<{ lyric: string | null; instrumental: boolean }> {
    return this.fetchLyric(songId)
  }

  /**
   * 仅关联同目录已有 .lrc，绝不发起在线搜索/下载
   * 供手动匹配「无在线候选」回退，避免误调 matchOne 静默写盘
   */
  async linkLocalLyrics(db: MusicDatabase, music: MusicItem): Promise<LyricsMatchResult> {
    const title = music.title || music.fileName
    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }
    const local = this.lyricsService.findLyricsFile(music.filePath)
    if (!local) {
      return { musicId: music.id, title, status: 'failed', message: '未找到本地歌词' }
    }
    db.updateAllMusic(music.id, { lyrics_path: local })
    return {
      musicId: music.id,
      title,
      status: 'linked_local',
      lyricsPath: local,
      message: '已关联本地歌词'
    }
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

    const { keyword, titleHints } = this.searchHints(music)
    if (!keyword) {
      return { musicId: music.id, title, status: 'failed', message: '无法构造搜索关键词' }
    }

    // 镜像轮转统一由批量的 noteOutcome 负责，这里不再轮转，避免一次失败计两次
    let outcome: SearchOutcome
    try {
      outcome = await this.searchSongs(keyword, false, titleHints)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '搜索失败' }
    }
    const { songs } = outcome

    if (isAborted()) return cancelledResult()

    if (songs.length === 0) {
      if (outcome.lowRelevance) {
        return {
          musicId: music.id,
          title,
          status: 'skipped_low_similarity',
          similarity: 0,
          message: '搜索结果与歌名不符'
        }
      }
      return { musicId: music.id, title, status: 'failed', message: '未找到搜索结果' }
    }

    const best = this.pickBestSong(music, songs, titleHints)

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
   * 搜索经 searchMutex 串行；拉词最多 BATCH_CONCURRENCY 路并行
   */
  async matchBatch(
    db: MusicDatabase,
    songs: MusicItem[],
    options: {
      force?: boolean
      onProgress?: (progress: LyricsMatchProgress) => void
    } = {}
  ): Promise<LyricsMatchSummary> {
    this.resetSessionState()
    const force = options.force === true
    const total = songs.length
    let success = 0
    let failed = 0
    let skipped = 0
    let completed = 0
    let nextIndex = 0
    let failStreak = 0
    const results: Array<LyricsMatchResult | undefined> = new Array(total)
    let lastDoneTitle = ''

    const bump = (status: LyricsMatchStatus) => {
      if (status === 'matched' || status === 'linked_local') success++
      else if (status === 'failed') failed++
      else skipped++
    }

    const noteOutcome = (status: LyricsMatchStatus) => {
      const bad =
        status === 'failed' ||
        status === 'skipped_low_similarity'
      if (status === 'matched' || status === 'linked_local') {
        failStreak = 0
        return
      }
      if (bad) {
        failStreak++
        if (failStreak >= FAIL_STREAK_ROTATE) {
          this.rotateApi(`连续 ${failStreak} 次失败/低相似`)
          failStreak = 0
        }
      }
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
      // 长跑定期轮转，避免某一镜像中后期开始返回乱结果仍被 sticky
      if (index > 0 && index % BATCH_ROTATE_EVERY === 0) {
        this.rotateApi(`批量已处理 ${index} 首`)
      }
      const music = songs[index]
      // 进度显示「正在处理」的歌，避免并发时用 lastDoneTitle 造成「传错歌」的错觉
      const displayTitle = music.title?.trim() || music.fileName
      lastDoneTitle = displayTitle
      emitProgress()
      const result = await this.matchOne(db, music, {
        force,
        shouldAbort: () => this.cancelled
      })
      // 取消后：进行中任务若已成功写入仍计入，避免摘要低于磁盘实际
      if (this.cancelled) {
        if (result.status === 'matched' || result.status === 'linked_local') {
          results[index] = result
          bump(result.status)
          completed++
          lastDoneTitle = displayTitle
          emitProgress(result.status)
        }
        return
      }
      results[index] = result
      bump(result.status)
      noteOutcome(result.status)
      completed++
      lastDoneTitle = displayTitle
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
      this.resetSessionState()
    }
  }
}
