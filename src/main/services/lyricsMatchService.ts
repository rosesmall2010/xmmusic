/**
 * 在线歌词匹配（参考 music-lrc-match：搜索网易云 → 相似度筛选 → 拉取 LRC）
 * 仅在主进程使用
 */
import { writeFileSync, existsSync, unlinkSync, readFileSync, statSync } from 'fs'
import { dirname, join, basename, extname, resolve } from 'path'
import { net } from 'electron'
import iconv from 'iconv-lite'
import type { MusicItem } from '../../shared/types/music'
import type {
  LyricsMatchResult,
  LyricsMatchProgress,
  LyricsMatchSummary,
  LyricsMatchStatus,
  LyricsMatchCandidate,
  LyricsCandidateRef,
  LyricsMatchSource,
  LyricsMatchWorkerTask
} from '../../shared/types/lyrics'
import type MusicDatabase from '../database/db'
import LyricsService from './lyricsService'
import lrclib from './lrclibClient'
import kugouLyrics from './kugouLyricsClient'
import qqLyrics, { qqMidToSongId } from './qqLyricsClient'
import {
  clampMatchConcurrency,
  DEFAULT_MATCH_CONCURRENCY
} from '../../shared/utils/matchConcurrency'

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
/** 批量匹配同时进行的任务数（默认；实际由 options.concurrency 覆盖，范围 1–10） */
const BATCH_CONCURRENCY = DEFAULT_MATCH_CONCURRENCY
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
/** 批量进度 IPC 节流间隔（与封面批量一致） */
const PROGRESS_EMIT_INTERVAL_MS = 250
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
/** 手动选择的本地歌词文件大小上限 */
const MAX_LOCAL_LYRICS_BYTES = 2 * 1024 * 1024
const LOCAL_LYRICS_EXT = /\.(lrc|txt)$/i
/**
 * 与 LyricsService.parseLyrics 一致：分钟须两位（`[00:05.00]`）
 * 写入前会把一位分钟补零，避免「匹配成功但解析为空」
 */
const HAS_TIMED_LRC_LINE = /\[\d{2}:\d{2}(?:\.\d{1,3})?\].*\S/
/** 外站候选：时长相差超过此秒数则略降权（不直接丢弃） */
const EXTERNAL_DURATION_SLACK_SEC = 15

type ExternalScored = Array<{ candidate: LyricsMatchCandidate; artistScore: number }>

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

const fetchText = async (url: string, signal?: AbortSignal): Promise<string> => {
  // Electron net 跟随系统代理
  // 取消中断：外部信号与超时合并（AbortSignal.any 需要两者的原因——
  // 只有 timeout 时取消要等满 12s，只有外部信号时单请求失去兜底超时）
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; xmmusic/1.1.6)',
      Accept: 'application/json,text/plain,*/*',
      'Cache-Control': 'no-cache'
    },
    signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
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
  /**
   * 取消时中断在途请求。
   * 只置 cancelled 标志时，在途的 net.fetch 要等满 12s 超时、镜像轮询最长可拖到
   * ~48s，期间 UI 停在「匹配中」无法取消；abort 让这些请求立即失败退出。
   */
  private abortController = new AbortController()

  /** 当前会话的中断信号；批量/单曲匹配内部所有请求都应带上它 */
  private abortSignal(): AbortSignal {
    return this.abortController.signal
  }

  cancel() {
    this.cancelled = true
    this.abortController.abort()
  }

  resetCancel() {
    this.cancelled = false
    this.abortController = new AbortController()
  }

  isCancelled() {
    return this.cancelled
  }

  /** 复位取消标志与镜像游标（批量取消后不复位会让随后的手动匹配直接返回「已取消」） */
  resetSessionState() {
    this.cancelled = false
    this.apiIndex = 0
    this.abortController = new AbortController()
  }

  /** 手动入口：复位会话状态 */
  async prepareManualSearch() {
    this.resetSessionState()
    // 目录里可能刚放入新的 .lrc，清掉索引缓存避免漏判
    this.lyricsService.clearLyricCache()
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
      // 取消后立即停止轮询镜像，不再对其余镜像逐个发请求
      if (this.cancelled) break
      const idx = (startIdx + attempt) % SEARCH_APIS.length
      const base = SEARCH_APIS[idx]
      try {
        const text = await fetchText(base + path + encoded + bust(), this.abortSignal())
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

  /** 拉词走网易云官方接口，与搜索镜像分离；不进 searchMutex，保留批量多路拉词 */
  private async fetchLyric(songId: number): Promise<{ lyric: string | null; instrumental: boolean }> {
    const text = await fetchText(LRC_API + String(songId), this.abortSignal())
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
   * 把 LRC 时间标签分钟补成两位，对齐 LyricsService.parseLyrics（只认 `\d{2}:\d{2}`）
   */
  private normalizeLrcTimestamps(lyric: string): string {
    return lyric.replace(
      /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g,
      (_m, min: string, rest: string) => `[${min.padStart(2, '0')}:${rest}]`
    )
  }

  /**
   * lrclib 搜索参数：有歌名+歌手用精确字段；否则用自由词 q
   */
  private lrclibSearchParams(
    music: MusicItem,
    hints: string[]
  ): { trackName?: string; artistName?: string; q?: string; durationSec?: number } {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const knownTitle = !this.isUnknownTitle(title)
    const knownArtist = !this.isUnknownArtist(artist)
    const durationSec =
      typeof music.duration === 'number' && music.duration > 0 ? music.duration : undefined
    if (knownTitle && knownArtist) {
      return {
        trackName: stripParen(title.replace(TAG_TRACK_NO_PREFIX, '').trim() || title),
        artistName: artist,
        durationSec
      }
    }
    if (knownTitle) {
      return {
        trackName: stripParen(title.replace(TAG_TRACK_NO_PREFIX, '').trim() || title),
        durationSec
      }
    }
    // 未知歌名：取最长/靠后段作 track，或整串 q
    let best = ''
    for (const h of hints) {
      const s = stripParen(h)
      if (s.length >= best.length) best = s
    }
    if (knownArtist && best) return { trackName: best, artistName: artist, durationSec }
    return { q: best || hints.join(' '), durationSec }
  }

  /**
   * 将外站搜到的曲目打成与网易云同结构的候选（歌名相关度 + 可选时长降权）
   */
  private scoreExternalTrack(
    music: MusicItem,
    hints: string[],
    track: {
      id: number
      source: LyricsMatchSource
      name: string
      artistName: string
      albumName?: string
      duration?: number
      externalKey?: string
    }
  ): { candidate: LyricsMatchCandidate; artistScore: number } | null {
    const song: SearchSong = {
      id: track.id,
      name: track.name,
      artists: track.artistName,
      artistList: track.artistName ? [track.artistName] : [],
      album: track.albumName
    }
    let similarity = this.songTitleScore(music, hints, song)
    const localDuration =
      typeof music.duration === 'number' && music.duration > 0 ? music.duration : null
    if (
      localDuration != null &&
      track.duration != null &&
      Math.abs(track.duration - localDuration) > EXTERNAL_DURATION_SLACK_SEC
    ) {
      similarity = Math.max(0, similarity - 5)
    }
    if (similarity < MIN_TITLE_RELEVANCE) return null
    return {
      candidate: {
        songId: track.id,
        source: track.source,
        externalKey: track.externalKey,
        name: track.name,
        artists: track.artistName,
        album: track.albumName,
        similarity
      },
      artistScore: this.artistScore(music, hints, song)
    }
  }

  /**
   * lrclib 候选：仅保留有带时间轴歌词（或纯音乐）的结果
   */
  private async searchLrclibCandidates(
    music: MusicItem,
    hints: string[]
  ): Promise<ExternalScored> {
    const params = this.lrclibSearchParams(music, hints)
    if (!params.q && !params.trackName) return []

    const tracks = await lrclib.search({ ...params, signal: this.abortSignal() })
    const scored: ExternalScored = []
    for (const track of tracks) {
      if (track.instrumental) {
        // 纯音乐也入列，应用时走 skipped_instrumental
      } else {
        const synced = track.syncedLyrics
          ? this.normalizeLrcTimestamps(track.syncedLyrics)
          : null
        if (!synced || !HAS_TIMED_LRC_LINE.test(synced)) continue
        // 缓存规范化后的歌词，预览/应用时无需再改
        track.syncedLyrics = synced
      }
      const item = this.scoreExternalTrack(music, hints, {
        id: track.id,
        source: 'lrclib',
        name: track.name,
        artistName: track.artistName,
        albumName: track.albumName,
        duration: track.duration
      })
      if (item) scored.push(item)
    }
    return scored
  }

  /** 酷狗歌词候选（搜索接口直接返回可下载的歌词条目） */
  private async searchKugouCandidates(
    music: MusicItem,
    hints: string[]
  ): Promise<ExternalScored> {
    const { keyword } = this.searchHints(music)
    if (!keyword) return []
    const durationSec =
      typeof music.duration === 'number' && music.duration > 0 ? music.duration : undefined
    const tracks = await kugouLyrics.search({ keyword, durationSec, signal: this.abortSignal() })
    const scored: ExternalScored = []
    for (const track of tracks) {
      const item = this.scoreExternalTrack(music, hints, {
        id: track.id,
        source: 'kugou',
        name: track.name,
        artistName: track.artistName,
        duration: track.duration,
        externalKey: track.accessKey
      })
      if (item) scored.push(item)
    }
    return scored
  }

  /** QQ 音乐搜曲候选（拉词时用 songmid） */
  private async searchQqCandidates(
    music: MusicItem,
    hints: string[]
  ): Promise<ExternalScored> {
    const { keyword } = this.searchHints(music)
    if (!keyword) return []
    const tracks = await qqLyrics.search(keyword, this.abortSignal())
    const scored: ExternalScored = []
    for (const track of tracks) {
      const item = this.scoreExternalTrack(music, hints, {
        id: qqMidToSongId(track.mid),
        source: 'qq',
        name: track.name,
        artistName: track.artistName,
        albumName: track.albumName,
        duration: track.duration,
        externalKey: track.mid
      })
      if (item) scored.push(item)
    }
    return scored
  }

  /** 来源优先级（同分时）：LRCLIB > 网易云 > 酷狗 > QQ */
  private sourcePriority(source?: LyricsMatchSource): number {
    switch (source) {
      case 'lrclib':
        return 4
      case 'netease':
        return 3
      case 'kugou':
        return 2
      case 'qq':
        return 1
      default:
        return 0
    }
  }

  /** 网易云搜歌结果打成统一候选结构 */
  private scoreNeteaseSongs(
    music: MusicItem,
    hints: string[],
    songs: SearchSong[],
    /** 手动候选不过相关度下限；自动/批量仍过滤 */
    applyMinRelevance: boolean
  ): ExternalScored {
    const scored: ExternalScored = []
    for (const song of songs) {
      const similarity = this.songTitleScore(music, hints, song)
      if (applyMinRelevance && similarity < MIN_TITLE_RELEVANCE) continue
      scored.push({
        candidate: {
          songId: song.id,
          source: 'netease',
          name: song.name,
          artists: song.artists,
          album: song.album,
          similarity
        },
        artistScore: this.artistScore(music, hints, song)
      })
    }
    return scored
  }

  /**
   * 四源并发搜索：LRCLIB / 网易云 / 酷狗 / QQ 同时发起；单源失败不影响其它
   */
  private async searchAllSourcesConcurrent(
    music: MusicItem,
    keyword: string,
    hints: string[],
    pickMode: boolean
  ): Promise<{
    scored: ExternalScored
    neteaseError?: unknown
    neteaseLowRelevance: boolean
  }> {
    const wrap = (label: string, p: Promise<ExternalScored>): Promise<ExternalScored> =>
      p.catch((e) => {
        console.warn(`[lyricsMatch] ${label} 搜索失败`, e)
        return [] as ExternalScored
      })

    type NeteaseBag =
      | { ok: true; outcome: SearchOutcome }
      | { ok: false; error: unknown }

    const [lrclibScored, kugouScored, qqScored, neteaseBag] = await Promise.all([
      wrap('lrclib', this.searchLrclibCandidates(music, hints)),
      wrap('kugou', this.searchKugouCandidates(music, hints)),
      wrap('qq', this.searchQqCandidates(music, hints)),
      this.searchSongs(keyword, pickMode, hints)
        .then((outcome): NeteaseBag => ({ ok: true, outcome }))
        .catch((error): NeteaseBag => ({ ok: false, error }))
    ])

    let neteaseScored: ExternalScored = []
    let neteaseError: unknown
    let neteaseLowRelevance = false
    if (neteaseBag.ok) {
      neteaseLowRelevance = neteaseBag.outcome.lowRelevance
      // 手动：全部入列；自动：过相关度下限
      neteaseScored = this.scoreNeteaseSongs(
        music,
        hints,
        neteaseBag.outcome.songs,
        !pickMode
      )
    } else {
      neteaseError = neteaseBag.error
    }

    return {
      scored: [...lrclibScored, ...neteaseScored, ...kugouScored, ...qqScored],
      neteaseError,
      neteaseLowRelevance
    }
  }

  /**
   * 自动/批量：按门槛筛过的候选，按相似度 / 艺人分 / 来源优先级降序
   * （歌名 ≥50；已知歌手艺人 ≥50；未知歌手且艺人对不上时歌名 ≥80）
   */
  private rankPassingCandidates(
    music: MusicItem,
    scored: ExternalScored
  ): Array<{ candidate: LyricsMatchCandidate; artistScore: number }> {
    const unknownArtist = this.isUnknownArtist(music.artist || '')
    const passed: Array<{ candidate: LyricsMatchCandidate; artistScore: number }> = []
    for (const item of scored) {
      const { candidate, artistScore } = item
      const similarity = candidate.similarity
      if (stripParen(candidate.name || '').length < 2 && similarity < 100) continue
      if (!unknownArtist && artistScore < ARTIST_SCORE_FLOOR) continue
      if (
        unknownArtist &&
        artistScore < ARTIST_SCORE_FLOOR &&
        similarity < UNKNOWN_ARTIST_MIN_SIMILARITY
      ) {
        continue
      }
      if (similarity < SIMILARITY_THRESHOLD) continue
      passed.push(item)
    }
    passed.sort(
      (a, b) =>
        b.candidate.similarity - a.candidate.similarity ||
        b.artistScore - a.artistScore ||
        this.sourcePriority(b.candidate.source) - this.sourcePriority(a.candidate.source)
    )
    return passed
  }

  /**
   * 搜索候选列表（按相似度降序），供手动挑选
   * LRCLIB / 网易云 / 酷狗 / QQ 四源并发；全部完成后再合并
   * 网易云不设相似度下限：全部结果入列，由用户预览后决定用或取消
   */
  async searchCandidates(music: MusicItem): Promise<LyricsMatchCandidate[]> {
    const { keyword, titleHints } = this.searchHints(music)
    if (!keyword) return []
    console.log(
      `[lyricsMatch] 手动候选 musicId=${music.id} title="${music.title}" keyword="${keyword}" hints=${JSON.stringify(titleHints)}`
    )
    const hints = titleHints.length ? titleHints : [keyword]
    const { scored, neteaseError } = await this.searchAllSourcesConcurrent(
      music,
      keyword,
      hints,
      true
    )

    if (neteaseError && scored.length === 0) {
      throw neteaseError instanceof Error ? neteaseError : new Error(String(neteaseError))
    }

    scored.sort(
      (a, b) =>
        b.candidate.similarity - a.candidate.similarity ||
        b.artistScore - a.artistScore ||
        this.sourcePriority(b.candidate.source) - this.sourcePriority(a.candidate.source)
    )
    return scored.map((s) => s.candidate)
  }

  /** 按候选来源取歌词文本 */
  private async fetchCandidateLyric(
    ref: LyricsCandidateRef
  ): Promise<{ lyric: string | null; instrumental: boolean }> {
    if (ref.source === 'lrclib') {
      const track = await lrclib.getById(ref.songId, this.abortSignal())
      if (track.instrumental) return { lyric: null, instrumental: true }
      const synced = track.syncedLyrics
        ? this.normalizeLrcTimestamps(track.syncedLyrics)
        : null
      if (synced) track.syncedLyrics = synced
      return { lyric: synced, instrumental: false }
    }
    if (ref.source === 'kugou') {
      const key = (ref.externalKey || '').trim()
      if (!key) throw new Error('缺少酷狗 accesskey')
      const raw = await kugouLyrics.getLyric(ref.songId, key, this.abortSignal())
      const synced = raw ? this.normalizeLrcTimestamps(raw) : null
      return { lyric: synced, instrumental: false }
    }
    if (ref.source === 'qq') {
      const mid = (ref.externalKey || '').trim()
      if (!mid) throw new Error('缺少 QQ songmid')
      const raw = await qqLyrics.getLyric(mid, this.abortSignal())
      const synced = raw ? this.normalizeLrcTimestamps(raw) : null
      return { lyric: synced, instrumental: false }
    }
    return this.fetchLyric(ref.songId)
  }

  /**
   * 预览候选歌词文本（供选择对话框展示），不写文件/不写库
   */
  async previewLyric(ref: LyricsCandidateRef): Promise<{ lyric: string | null; instrumental: boolean }> {
    return this.fetchCandidateLyric(ref)
  }

  /**
   * 应用用户手动选择的本地歌词文件
   * - 先规范化时间轴分钟为两位，再校验（与播放端 parseLyrics 一致）
   * - 与音乐同目录且内容无需改写：直接关联，避免再复制出一份
   * - 否则写入音乐同目录同名 .lrc；目录不可写时，仅当原文件已可解析才退回关联
   */
  async applyLocalFile(db: MusicDatabase, music: MusicItem, localPath: string): Promise<LyricsMatchResult> {
    const title = music.title || music.fileName
    const fail = (message: string): LyricsMatchResult => ({ musicId: music.id, title, status: 'failed', message })
    if (!music.filePath || !existsSync(music.filePath)) return fail('音乐文件不存在')

    const src = (localPath || '').trim()
    if (!src || !existsSync(src)) return fail('本地歌词文件不存在')
    if (!LOCAL_LYRICS_EXT.test(src)) return fail('仅支持 .lrc / .txt 歌词文件')

    let rawContent: string
    let normalized: string
    try {
      if (statSync(src).size > MAX_LOCAL_LYRICS_BYTES) return fail('歌词文件过大（超过 2MB）')
      const buf = readFileSync(src)
      const encoding = this.lyricsService.detectEncoding(src)
      if (encoding === 'utf8') {
        const start =
          buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0
        rawContent = buf.subarray(start).toString('utf8')
      } else {
        rawContent = iconv.decode(buf, encoding)
      }
      normalized = this.normalizeLrcTimestamps(rawContent)
      if (!HAS_TIMED_LRC_LINE.test(normalized)) return fail('未识别到带时间轴的歌词')
    } catch (e: any) {
      return fail(e?.message || '读取歌词文件失败')
    }

    const target = this.resolveLrcPath(music)
    // 源文件本身就是目标 .lrc（同目录同名）：直接关联，免去无谓重写
    if (resolve(src) === resolve(target)) {
      db.updateAllMusic(music.id, { lyrics_path: target })
      return { musicId: music.id, title, status: 'linked_local', lyricsPath: target, message: '已关联本地歌词' }
    }

    // 其余一律规范化写成同名 .lrc：源为 .txt / 异目录 / 时间轴补零改动过，
    // 统一落成 .lrc，避免库里混着 .txt 路径
    try {
      writeFileSync(target, normalized, 'utf8')
    } catch (e: any) {
      console.warn(`[lyricsMatch] 写入规范化歌词到 ${target} 失败`, e?.message || e)
      // 目录不可写时的兜底：能解析就直接关联原文件，总好过丢歌词
      try {
        if (this.lyricsService.parseLyrics(src).lines.length > 0) {
          db.updateAllMusic(music.id, { lyrics_path: src })
          return { musicId: music.id, title, status: 'linked_local', lyricsPath: src, message: '已关联本地歌词' }
        }
      } catch {
        /* ignore */
      }
      return fail(e?.message || '写入歌词文件失败')
    }
    db.updateAllMusic(music.id, { lyrics_path: target })
    return { musicId: music.id, title, status: 'matched', lyricsPath: target, message: '已应用本地歌词' }
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
   * 按用户选定的候选（网易云 / LRCLIB / 酷狗 / QQ）下载并写入歌词
   */
  async applyCandidate(
    db: MusicDatabase,
    music: MusicItem,
    ref: LyricsCandidateRef
  ): Promise<LyricsMatchResult> {
    const title = music.title || music.fileName
    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }

    let lyricPayload: { lyric: string | null; instrumental: boolean }
    try {
      lyricPayload = await this.fetchCandidateLyric(ref)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '获取歌词失败' }
    }

    if (lyricPayload.instrumental) {
      return { musicId: music.id, title, status: 'skipped_instrumental', message: '纯音乐无歌词' }
    }
    if (!lyricPayload.lyric) {
      return { musicId: music.id, title, status: 'failed', message: '歌词为空' }
    }
    // 偶发无时间轴：写入后播放端解析为空，应用前拦截（各源统一）
    if (!HAS_TIMED_LRC_LINE.test(lyricPayload.lyric)) {
      return { musicId: music.id, title, status: 'failed', message: '未识别到带时间轴的歌词' }
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
    const hints = titleHints.length ? titleHints : [keyword]

    // 四源并发搜索，再按分择优拉词写盘（同分优先 LRCLIB > 网易云 > 酷狗 > QQ）
    const { scored, neteaseError, neteaseLowRelevance } = await this.searchAllSourcesConcurrent(
      music,
      keyword,
      hints,
      false
    )
    if (isAborted()) return cancelledResult()

    const ranked = this.rankPassingCandidates(music, scored)
    let sawInstrumental = false
    let lastFetchError = ''

    for (const item of ranked) {
      if (isAborted()) return cancelledResult()
      const label = item.candidate.source || 'unknown'
      let lyricPayload: { lyric: string | null; instrumental: boolean }
      try {
        lyricPayload = await this.fetchCandidateLyric({
          songId: item.candidate.songId,
          source: item.candidate.source,
          externalKey: item.candidate.externalKey
        })
      } catch (e: any) {
        lastFetchError = e?.message || String(e)
        console.warn(
          `[lyricsMatch] ${label} 拉词失败 musicId=${music.id}，尝试下一候选`,
          lastFetchError
        )
        continue
      }
      if (isAborted()) return cancelledResult()
      if (lyricPayload.instrumental) {
        sawInstrumental = true
        continue
      }
      if (!lyricPayload.lyric || !HAS_TIMED_LRC_LINE.test(lyricPayload.lyric)) {
        continue
      }

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
      if (isAborted()) {
        try {
          if (existsSync(lrcPath)) unlinkSync(lrcPath)
        } catch {
          /* ignore */
        }
        return cancelledResult()
      }
      db.updateAllMusic(music.id, { lyrics_path: lrcPath })
      return {
        musicId: music.id,
        title,
        status: 'matched',
        lyricsPath: lrcPath,
        similarity: item.candidate.similarity,
        message: force ? '重新匹配成功' : '匹配成功'
      }
    }

    // 已过相似度门槛但拉词失败：优先报失败，勿误判为「匹配度过低」或「纯音乐」
    if (lastFetchError) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        message: lastFetchError
      }
    }
    // 仅当成功拉到的结果都是纯音乐（无拉词异常）才记 instrumental
    if (sawInstrumental) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_instrumental',
        message: '纯音乐无歌词'
      }
    }
    // 有搜索命中但无一过自动门槛
    if (ranked.length === 0 && scored.length > 0) {
      const top = [...scored].sort(
        (a, b) => b.candidate.similarity - a.candidate.similarity
      )[0]
      return {
        musicId: music.id,
        title,
        status: 'skipped_low_similarity',
        similarity: top?.candidate.similarity ?? 0,
        message: `匹配度过低(${top?.candidate.similarity ?? 0}%)`
      }
    }
    if (neteaseLowRelevance) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_low_similarity',
        similarity: 0,
        message: '搜索结果与歌名不符'
      }
    }
    if (neteaseError) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        message: neteaseError instanceof Error ? neteaseError.message : String(neteaseError)
      }
    }
    return {
      musicId: music.id,
      title,
      status: 'failed',
      message: '未找到可用歌词'
    }
  }

  /**
   * 批量匹配：默认只处理无歌词歌曲；forceAll 时对传入列表强制重匹配
   * 搜索经 searchMutex 串行；并发路数由 options.concurrency 控制（1–10）
   */
  async matchBatch(
    db: MusicDatabase,
    songs: MusicItem[],
    options: {
      force?: boolean
      /** 并发任务数，钳制到 1–10 */
      concurrency?: number
      /** 若调用方已开始计时（含枚举阶段），沿用该起点避免 UI 耗时回跳 */
      startedAt?: number
      onProgress?: (progress: LyricsMatchProgress) => void
      /** 为 false 时保留调用方已设置的取消标志（批量枚举阶段取消） */
      resetCancel?: boolean
    } = {}
  ): Promise<LyricsMatchSummary> {
    if (options.resetCancel !== false) {
      this.resetSessionState()
      // 新一轮批量：目录里可能已放入新的 .lrc，清索引缓存
      this.lyricsService.clearLyricCache()
    } else {
      // 保留 cancelled，仅复位镜像游标
      this.apiIndex = 0
    }
    if (this.cancelled) {
      return {
        total: songs.length,
        success: 0,
        failed: 0,
        skipped: 0,
        cancelled: true,
        results: []
      }
    }
    const force = options.force === true
    const total = songs.length
    const concurrency = clampMatchConcurrency(options.concurrency ?? BATCH_CONCURRENCY)
    const startedAt =
      typeof options.startedAt === 'number' && options.startedAt > 0
        ? options.startedAt
        : Date.now()
    let success = 0
    let failed = 0
    let skipped = 0
    let completed = 0
    let nextIndex = 0
    let failStreak = 0
    const results: Array<LyricsMatchResult | undefined> = new Array(total)
    let lastDoneTitle = ''
    let lastProgressEmitAt = 0
    let pendingProgressStatus: LyricsMatchStatus | undefined
    let progressTimer: ReturnType<typeof setTimeout> | null = null

    const clearProgressTimer = () => {
      if (progressTimer != null) {
        clearTimeout(progressTimer)
        progressTimer = null
      }
    }
    const workerCount = Math.min(concurrency, Math.max(total, 1))
    const tasks: LyricsMatchWorkerTask[] = Array.from({ length: workerCount }, (_, i) => ({
      workerId: i + 1,
      title: '',
      status: 'idle' as const
    }))

    const bump = (status: LyricsMatchStatus) => {
      if (status === 'matched' || status === 'linked_local') success++
      else if (status === 'failed') failed++
      else skipped++
    }

    const noteOutcome = (status: LyricsMatchStatus) => {
      const bad = status === 'failed' || status === 'skipped_low_similarity'
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

    const mapTaskStatus = (
      status: LyricsMatchStatus
    ): LyricsMatchWorkerTask['status'] => {
      if (status === 'matched' || status === 'linked_local') return 'success'
      if (status === 'failed') return 'failed'
      return 'skipped'
    }

    const emitProgress = (lastStatus?: LyricsMatchStatus, force = false) => {
      const now = Date.now()
      // 节流：同目录已有 .lrc 时 matchOne 走 linked_local 快路径不发网络，
      // 并发 10 路下每秒可完成上百首，不节流会用进度 IPC 淹掉渲染进程。
      // 完成/取消时 force 立即推送，保证末态不丢。
      if (!force && now - lastProgressEmitAt < PROGRESS_EMIT_INTERVAL_MS && completed < total && !this.cancelled) {
        pendingProgressStatus = lastStatus
        if (progressTimer == null) {
          progressTimer = setTimeout(() => {
            progressTimer = null
            emitProgress(pendingProgressStatus, true)
          }, PROGRESS_EMIT_INTERVAL_MS)
        }
        return
      }
      lastProgressEmitAt = now
      pendingProgressStatus = undefined
      clearProgressTimer()
      const elapsedMs = Date.now() - startedAt
      const estimatedRemainingMs =
        completed > 0 && completed < total
          ? Math.round(((total - completed) * elapsedMs) / completed)
          : completed >= total
            ? 0
            : null
      options.onProgress?.({
        current: completed,
        total,
        success,
        failed,
        skipped,
        currentTitle: lastDoneTitle,
        lastStatus,
        startedAt,
        elapsedMs,
        estimatedRemainingMs,
        concurrency: workerCount,
        tasks: tasks.map((t) => ({ ...t }))
      })
    }

    // 空列表也推一次，方便 UI 拿到 startedAt / concurrency
    if (total === 0) {
      emitProgress(undefined, true)
      return {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        cancelled: false,
        results: []
      }
    }

    emitProgress(undefined, true)

    const runOne = async (workerSlot: number, index: number) => {
      if (this.cancelled) return
      if (index > 0 && index % BATCH_ROTATE_EVERY === 0) {
        this.rotateApi(`批量已处理 ${index} 首`)
      }
      const music = songs[index]
      const displayTitle = music.title?.trim() || music.fileName
      lastDoneTitle = displayTitle
      tasks[workerSlot] = {
        workerId: workerSlot + 1,
        musicId: music.id,
        title: displayTitle,
        status: 'running'
      }
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
          tasks[workerSlot] = {
            workerId: workerSlot + 1,
            musicId: music.id,
            title: displayTitle,
            status: mapTaskStatus(result.status),
            message: result.message
          }
          emitProgress(result.status, true)
        } else {
          tasks[workerSlot] = {
            workerId: workerSlot + 1,
            title: '',
            status: 'idle'
          }
          emitProgress(undefined, true)
        }
        return
      }
      results[index] = result
      bump(result.status)
      noteOutcome(result.status)
      completed++
      lastDoneTitle = displayTitle
      tasks[workerSlot] = {
        workerId: workerSlot + 1,
        musicId: music.id,
        title: displayTitle,
        status: mapTaskStatus(result.status),
        message: result.message
      }
      emitProgress(result.status, this.cancelled || completed >= total)
    }

    const workers = Array.from({ length: workerCount }, async (_, workerSlot) => {
      while (!this.cancelled) {
        const index = nextIndex++
        if (index >= total) {
          tasks[workerSlot] = {
            workerId: workerSlot + 1,
            title: '',
            status: 'idle'
          }
          emitProgress(undefined, true)
          break
        }
        await runOne(workerSlot, index)
        if (!this.cancelled && nextIndex < total) {
          await sleep(REQUEST_GAP_MS)
        }
      }
    })

    try {
      await Promise.all(workers)
      // 结束时清空 running，保留最终统计
      for (const t of tasks) {
        if (t.status === 'running') {
          t.status = 'idle'
          t.title = ''
          delete t.musicId
          delete t.message
        }
      }
      emitProgress(undefined, true)
      return {
        total,
        success,
        failed,
        skipped,
        cancelled: this.cancelled,
        results: results.filter((r): r is LyricsMatchResult => !!r)
      }
    } finally {
      clearProgressTimer()
      this.resetSessionState()
    }
  }
}
