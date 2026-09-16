/**
 * 在线封面匹配：搜索网易云 → 取专辑封面 → 写入缓存 / MP3 ID3 → 更新数据库
 * 仅在主进程使用。图源与歌词同源 SEARCH_APIS，但自行解析 picUrl（歌词服务未映射）。
 */
import { existsSync, mkdirSync, unlinkSync, accessSync, constants } from 'fs'
import { writeFile } from 'fs/promises'
import { join, normalize } from 'path'
import { randomUUID } from 'crypto'
import { app, net, nativeImage } from 'electron'
import type { MusicItem } from '../../shared/types/music'
import type {
  CoverMatchResult,
  CoverMatchCandidate,
  CoverMatchProgress,
  CoverMatchSummary,
  CoverMatchStatus
} from '../../shared/types/coverMatch'
import type MusicDatabase from '../database/db'
import MetadataEditor from './metadataEditor'

const SEARCH_APIS = [
  'https://music-api.0m2.cn',
  'https://music.api.ravelloh.top',
  'https://music.api.coderace.top',
  'https://neteaseapi.imgugu.ink'
]

const SEARCH_PATH = '/search?limit=3&type=1&keywords='
const SEARCH_PATH_PICK = '/search?limit=8&type=1&keywords='
/** 歌曲详情（补封面） */
const SONG_DETAIL_PATH = '/song/detail?ids='

const SIMILARITY_THRESHOLD = 75
const PICK_LIST_MIN_SIMILARITY = 35
const REQUEST_TIMEOUT_MS = 12000
const DOWNLOAD_TIMEOUT_MS = 20000
/** 单张封面下载上限 15MB（不缩放，但拒绝超大文件） */
const MAX_COVER_BYTES = 15 * 1024 * 1024
const REQUEST_GAP_MS = 120
const BATCH_CONCURRENCY = 3

type SearchSong = {
  id: number
  name: string
  artists: string
  album?: string
  coverUrl?: string
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const stripParen = (s: string) =>
  s.replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').replace(/\s+/g, ' ').trim()

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
  const res = await net.fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; xmmusic/1.2.3)',
      Accept: 'application/json,text/plain,*/*'
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

/** 从网易云风格 JSON 节点尽量取出封面 URL */
const pickPicUrl = (node: any): string | undefined => {
  if (!node || typeof node !== 'object') return undefined
  const keys = ['picUrl', 'blurPicUrl', 'coverImgUrl', 'cover', 'pic_url']
  for (const k of keys) {
    const v = node[k]
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim()
  }
  return undefined
}

const extractCoverUrlFromSongJson = (s: any): string | undefined => {
  return pickPicUrl(s?.album) || pickPicUrl(s?.al) || pickPicUrl(s)
}

const isMp3Path = (filePath: string) => /\.mp3$/i.test(filePath)

type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp'

/** 用文件头识别图片类型（比 Content-Type 更可靠） */
const detectImageKind = (buf: Buffer): ImageKind | null => {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png'
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif'
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

const extForKind = (kind: ImageKind): string => {
  if (kind === 'png') return '.png'
  if (kind === 'gif') return '.gif'
  return '.jpg'
}

/**
 * WebP 写入 ID3 兼容性差；用 Electron nativeImage 转为 JPEG（不缩放边长，仅换编码）
 */
const ensureId3FriendlyImage = (buf: Buffer, kind: ImageKind): { buf: Buffer; kind: ImageKind } => {
  if (kind !== 'webp') return { buf, kind }
  const img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) {
    throw new Error('WebP 封面解析失败')
  }
  return { buf: Buffer.from(img.toJPEG(90)), kind: 'jpeg' }
}

const isImageContentType = (ct: string | null): boolean => {
  if (!ct) return false
  const lower = ct.toLowerCase().split(';')[0].trim()
  return lower.startsWith('image/')
}

export default class CoverMatchService {
  private apiIndex = 0
  private cancelled = false
  private metadataEditor = new MetadataEditor()
  /** 下载进行中注册的取消回调（cancel() 时触发中断正在进行的网络请求） */
  private cancelListeners = new Set<() => void>()

  cancel() {
    this.cancelled = true
    for (const fn of this.cancelListeners) {
      try {
        fn()
      } catch {
        /* ignore */
      }
    }
  }

  resetCancel() {
    this.cancelled = false
    // 下载回调在下一次 downloadCoverToCache 生命周期自行清理；此处不主动清，避免误放新请求
  }

  /** 批量枚举阶段是否已请求取消 */
  isCancelled() {
    return this.cancelled
  }

  /** 库路径非空且磁盘可读 */
  hasValidCover(music: MusicItem): boolean {
    const p = (music.coverPath || '').trim()
    if (!p) return false
    try {
      accessSync(p, constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  buildKeyword(music: MusicItem): string {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const unknownTitle = !title || title === '未知标题' || title === 'Unknown'
    const unknownArtist =
      !artist || artist === '未知艺术家' || artist === 'Unknown Artist' || artist === '未知歌手'
    if (!unknownTitle && !unknownArtist) return `${artist} ${title}`
    if (!unknownTitle) return title
    const base = (music.fileName || music.filePath || '').replace(/\.[^.]+$/, '')
    return base || title || artist || ''
  }

  buildLocalName(music: MusicItem): string {
    const title = (music.title || '').trim()
    const artist = (music.artist || '').trim()
    const unknownTitle = !title || title === '未知标题' || title === 'Unknown'
    const unknownArtist =
      !artist || artist === '未知艺术家' || artist === 'Unknown Artist' || artist === '未知歌手'
    if (!unknownTitle && !unknownArtist) return `${artist} - ${title}`
    if (!unknownTitle) return title
    return (music.fileName || music.filePath || '').replace(/\.[^.]+$/, '')
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
          // 本镜像无结果：试下一个，勿直接当成全局无结果
          continue
        }
        this.apiIndex = idx
        return songs.slice(0, limit).map((s: any) => {
          const artists = Array.isArray(s.artists)
            ? s.artists.map((a: any) => a?.name).filter(Boolean).join(' ')
            : Array.isArray(s.ar)
              ? s.ar.map((a: any) => a?.name).filter(Boolean).join(' ')
              : ''
          const albumName = s.album?.name || s.al?.name
          return {
            id: Number(s.id),
            name: String(s.name || ''),
            artists,
            album: albumName ? String(albumName) : undefined,
            coverUrl: extractCoverUrlFromSongJson(s)
          } as SearchSong
        })
      } catch (e) {
        lastErr = e
      }
    }
    // 全部镜像都返回空列表（无异常）→ 视为无搜索结果；有异常则抛出
    if (lastErr) throw lastErr instanceof Error ? lastErr : new Error('搜索 API 全部失败')
    console.warn(`[coverMatch] 搜索「${keyword}」全部镜像无结果`)
    return []
  }

  private pickBestSong(
    localName: string,
    songs: SearchSong[]
  ): { song: SearchSong; similarity: number } | null {
    let best: { song: SearchSong; similarity: number } | null = null
    for (const song of songs) {
      const remote = `${song.artists} - ${song.name}`
      const score = similarPercent(localName, remote)
      if (!best || score > best.similarity) best = { song, similarity: score }
    }
    return best
  }

  /** 通过歌曲详情接口补全封面 URL */
  private async fetchCoverUrlBySongId(songId: number): Promise<string | undefined> {
    let lastErr: unknown
    for (let attempt = 0; attempt < SEARCH_APIS.length; attempt++) {
      const idx = (this.apiIndex + attempt) % SEARCH_APIS.length
      const base = SEARCH_APIS[idx]
      try {
        const text = await fetchText(base + SONG_DETAIL_PATH + String(songId))
        const json = JSON.parse(text)
        const song = Array.isArray(json?.songs) ? json.songs[0] : json?.song
        const url = extractCoverUrlFromSongJson(song)
        if (url) {
          this.apiIndex = idx
          return url
        }
        const dataSong = Array.isArray(json?.data) ? json.data[0] : json?.data
        const url2 = extractCoverUrlFromSongJson(dataSong)
        if (url2) {
          this.apiIndex = idx
          return url2
        }
        // 本镜像无封面字段：继续试下一个，勿提前 return undefined
        continue
      } catch (e) {
        lastErr = e
      }
    }
    if (lastErr) {
      console.warn('[coverMatch] 详情补图失败', lastErr)
    }
    return undefined
  }

  /** 解析最终可用封面 URL：已有则用，否则详情补全 */
  async resolveCoverUrl(song: { id: number; coverUrl?: string }): Promise<string | undefined> {
    if (song.coverUrl && /^https?:\/\//i.test(song.coverUrl)) return song.coverUrl
    return this.fetchCoverUrlBySongId(song.id)
  }

  private getCoversDir(): string {
    const coversDir = join(app.getPath('userData'), 'covers')
    mkdirSync(coversDir, { recursive: true })
    return coversDir
  }

  /** 下载封面到 userData/covers；WebP 转为 JPEG 以便写入 ID3；文件名带随机串避免撞名 */
  private async downloadCoverToCache(coverUrl: string, music: MusicItem): Promise<string> {
    // 取消中断：优先用控制器 + 手动超时定时器（AbortSignal.timeout 无法与外部取消信号合并）
    const abortCtrl = new AbortController()
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) abortCtrl.abort(new Error('下载封面超时'))
    }, DOWNLOAD_TIMEOUT_MS)
    const abortFromCancel = () => {
      if (!settled) abortCtrl.abort()
    }
    const cleanup = () => {
      settled = true
      clearTimeout(timeout)
      this.cancelListeners.delete(abortFromCancel)
    }

    this.cancelListeners.add(abortFromCancel)

    let res: Awaited<ReturnType<typeof net.fetch>>
    try {
      res = await net.fetch(coverUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; xmmusic/1.2.3)',
          Accept: 'image/*,*/*'
        },
        signal: abortCtrl.signal
      })
    } catch (e) {
      cleanup()
      throw e
    }
    if (!res.ok) {
      cleanup()
      throw new Error(`下载封面 HTTP ${res.status}`)
    }

    const contentType = res.headers.get('content-type')
    if (contentType && !isImageContentType(contentType)) {
      if (!contentType.toLowerCase().includes('octet-stream')) {
        cleanup()
        throw new Error(`非图片类型: ${contentType}`)
      }
    }

    const contentLength = Number(res.headers.get('content-length') || 0)
    if (contentLength > MAX_COVER_BYTES) {
      cleanup()
      throw new Error(`封面过大(${Math.round(contentLength / 1024 / 1024)}MB)，超过 15MB 限制`)
    }

    let buf: Buffer
    try {
      buf = Buffer.from(await res.arrayBuffer())
    } catch (e) {
      cleanup()
      throw e
    }
    cleanup()
    if (buf.length === 0) throw new Error('封面数据为空')
    if (buf.length > MAX_COVER_BYTES) {
      throw new Error(`封面过大(${Math.round(buf.length / 1024 / 1024)}MB)，超过 15MB 限制`)
    }

    // 一律用魔数校验，避免错误页冒充 image/*
    let kind = detectImageKind(buf)
    if (!kind) {
      throw new Error('下载内容不是有效图片')
    }

    // WebP → JPEG，避免 ID3 MIME 错误 / 播放器不认
    const friendly = ensureId3FriendlyImage(buf, kind)
    buf = Buffer.from(friendly.buf)
    kind = friendly.kind

    const ext = extForKind(kind)
    const hash = (music.fileHash || `id${music.id}`).replace(/[^a-zA-Z0-9]/g, '')
    const coverPath = join(this.getCoversDir(), `${hash}_cover_${randomUUID()}${ext}`)
    await writeFile(coverPath, buf)
    return coverPath
  }

  private tryRemoveOldCover(oldPath: string | null | undefined, coversDir: string) {
    if (!oldPath) return
    const oldNorm = normalize(oldPath)
    const dirNorm = normalize(coversDir)
    // Windows 下盘符大小写可能不一致
    const underCovers =
      process.platform === 'win32'
        ? oldNorm.toLowerCase().startsWith(dirNorm.toLowerCase())
        : oldNorm.startsWith(dirNorm)
    if (!underCovers) return
    try {
      if (existsSync(oldNorm)) unlinkSync(oldNorm)
    } catch {
      // 忽略清理失败
    }
  }

  /** 将缓存封面应用到歌曲：MP3 先写 ID3 再写库；非 MP3 只写库 */
  private async applyCoverFile(
    db: MusicDatabase,
    music: MusicItem,
    cachePath: string,
    extra: { similarity?: number; message?: string }
  ): Promise<CoverMatchResult> {
    const title = music.title || music.fileName
    const isMp3 = isMp3Path(music.filePath)
    const coversDir = this.getCoversDir()

    if (isMp3) {
      try {
        await this.metadataEditor.updateMetadata(music.filePath, { coverPath: cachePath })
      } catch (e: any) {
        try {
          if (existsSync(cachePath)) unlinkSync(cachePath)
        } catch {
          /* ignore */
        }
        return {
          musicId: music.id,
          title,
          status: 'failed',
          message: e?.message || '写入 MP3 封面失败'
        }
      }
      db.updateAllMusic(music.id, { cover_path: cachePath })
      this.tryRemoveOldCover(music.coverPath, coversDir)
      return {
        musicId: music.id,
        title,
        status: 'matched',
        coverPath: cachePath,
        fileNotUpdated: false,
        similarity: extra.similarity,
        message: extra.message || '匹配成功'
      }
    }

    db.updateAllMusic(music.id, { cover_path: cachePath })
    this.tryRemoveOldCover(music.coverPath, coversDir)
    return {
      musicId: music.id,
      title,
      status: 'matched',
      coverPath: cachePath,
      fileNotUpdated: true,
      similarity: extra.similarity,
      message: extra.message || '已更新应用内封面（文件未修改）'
    }
  }

  /** 搜索候选（含封面 URL 尽力补全），按相似度降序 */
  async searchCandidates(music: MusicItem): Promise<CoverMatchCandidate[]> {
    const keyword = this.buildKeyword(music)
    if (!keyword) return []
    const songs = await this.searchSongs(keyword, true)
    const localName = this.buildLocalName(music)
    const list: CoverMatchCandidate[] = []

    for (const song of songs) {
      const similarity = similarPercent(localName, `${song.artists} - ${song.name}`)
      if (similarity < PICK_LIST_MIN_SIMILARITY) continue
      let coverUrl = song.coverUrl
      if (!coverUrl) {
        try {
          coverUrl = await this.fetchCoverUrlBySongId(song.id)
        } catch {
          coverUrl = undefined
        }
        await sleep(REQUEST_GAP_MS)
      }
      // 无封面地址的候选不进入列表，避免 UI 裂图后再点选失败
      if (!coverUrl) continue
      list.push({
        songId: song.id,
        name: song.name,
        artists: song.artists,
        album: song.album,
        similarity,
        coverUrl
      })
    }

    return list.sort((a, b) => b.similarity - a.similarity)
  }

  /** 按用户选定的 songId 应用封面；已有有效封面时需 force */
  async applyCandidate(
    db: MusicDatabase,
    music: MusicItem,
    songId: number,
    options: { coverUrl?: string; force?: boolean } = {}
  ): Promise<CoverMatchResult> {
    const title = music.title || music.fileName
    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }

    if (!options.force && this.hasValidCover(music)) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_has_cover',
        coverPath: music.coverPath || undefined,
        message: '已有封面'
      }
    }

    const url = await this.resolveCoverUrl({ id: songId, coverUrl: options.coverUrl })
    if (!url) {
      return { musicId: music.id, title, status: 'failed', message: '无封面地址' }
    }

    let cachePath: string
    try {
      cachePath = await this.downloadCoverToCache(url, music)
    } catch (e: any) {
      return { musicId: music.id, title, status: 'failed', message: e?.message || '下载封面失败' }
    }

    return this.applyCoverFile(db, music, cachePath, { message: '匹配成功' })
  }

  /** 自动匹配单曲封面 */
  async matchOne(
    db: MusicDatabase,
    music: MusicItem,
    options: { force?: boolean; shouldAbort?: () => boolean } = {}
  ): Promise<CoverMatchResult> {
    const force = options.force === true
    const title = music.title || music.fileName
    const isAborted = () => this.cancelled || options.shouldAbort?.() === true
    const cancelledResult = (): CoverMatchResult => ({
      musicId: music.id,
      title,
      status: 'failed',
      message: '已取消'
    })

    if (isAborted()) return cancelledResult()

    if (!music.filePath || !existsSync(music.filePath)) {
      return { musicId: music.id, title, status: 'failed', message: '音乐文件不存在' }
    }

    if (!force && this.hasValidCover(music)) {
      return {
        musicId: music.id,
        title,
        status: 'skipped_has_cover',
        coverPath: music.coverPath || undefined,
        message: '已有封面'
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

    if (isAborted()) return cancelledResult()

    const coverUrl = await this.resolveCoverUrl(best.song)
    if (!coverUrl) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        similarity: best.similarity,
        message: '无封面地址'
      }
    }

    if (isAborted()) return cancelledResult()

    let cachePath: string
    try {
      cachePath = await this.downloadCoverToCache(coverUrl, music)
    } catch (e: any) {
      return {
        musicId: music.id,
        title,
        status: 'failed',
        similarity: best.similarity,
        message: e?.message || '下载封面失败'
      }
    }

    if (isAborted()) {
      try {
        if (existsSync(cachePath)) unlinkSync(cachePath)
      } catch {
        /* ignore */
      }
      return cancelledResult()
    }

    return this.applyCoverFile(db, music, cachePath, {
      similarity: best.similarity,
      message: force ? '重新匹配成功' : '匹配成功'
    })
  }

  /** 批量匹配（供 S1.3）；预留取消与进度 */
  async matchBatch(
    db: MusicDatabase,
    songs: MusicItem[],
    options: {
      force?: boolean
      onProgress?: (progress: CoverMatchProgress) => void
      /** 为 false 时保留调用方已设置的取消标志（批量枚举阶段取消） */
      resetCancel?: boolean
    } = {}
  ): Promise<CoverMatchSummary> {
    if (options.resetCancel !== false) {
      this.resetCancel()
    }
    const force = options.force === true
    const total = songs.length
    let success = 0
    let failed = 0
    let skipped = 0
    let writtenToFile = 0
    let dbOnly = 0
    let completed = 0
    let nextIndex = 0
    const results: Array<CoverMatchResult | undefined> = new Array(total)
    let lastDoneTitle = ''

    const bump = (result: CoverMatchResult) => {
      if (result.status === 'matched') {
        success++
        if (result.fileNotUpdated) dbOnly++
        else writtenToFile++
      } else if (result.status === 'failed') failed++
      else skipped++
    }

    const emitProgress = (lastStatus?: CoverMatchStatus) => {
      options.onProgress?.({
        current: completed,
        total,
        success,
        failed,
        skipped,
        writtenToFile,
        dbOnly,
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
      if (this.cancelled) return
      results[index] = result
      bump(result)
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
        if (!this.cancelled && nextIndex < total) {
          await sleep(REQUEST_GAP_MS)
        }
      }
    })

    await Promise.all(workers)
    // 取消标志生命周期由调用方管理：handler 入口 resetCancel，结束不清，
    // 避免「批量已取消 → 下一个单曲匹配被残留标志误中止」的尾部竞态
    return {
      total,
      success,
      failed,
      skipped,
      writtenToFile,
      dbOnly,
      cancelled: this.cancelled,
      results: results.filter((r): r is CoverMatchResult => !!r)
    }
  }
}
