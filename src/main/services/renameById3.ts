/**
 * 按 ID3 歌手、歌曲名重命名音频，并让同曲歌词使用同一个主文件名。
 * 目标名已被其他文件占用时，从「主文件名.1.扩展名」起递增，每首歌各自从 1 开始。
 */
import { existsSync, renameSync } from 'fs'
import { basename, dirname, extname, join, normalize, resolve } from 'path'
import type MusicDatabase from '../database/db'
import type { MusicItem } from '../../shared/types/music'

const ILLEGAL_FILENAME = /[\\/:*?"<>|\u0000-\u001f]/g
const MAX_STEM_BYTES = 180
const MAX_SUFFIX = 9999

export interface LyricRename {
  from: string
  to: string
}

export interface RenamePlan {
  fileName: string
  audioFrom: string
  audioTo: string
  lyrics: LyricRename[]
}

/** 比较路径时忽略大小写（macOS / Windows 默认不区分） */
export function pathIdentity(filePath: string): string {
  const normalized = normalize(resolve(filePath))
  return process.platform === 'linux' ? normalized : normalized.toLowerCase()
}

/** 去掉文件名非法字符，并清掉首尾的点与空白 */
export function sanitizeFilePart(raw: string): string {
  return raw
    .replace(ILLEGAL_FILENAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.]+|[. ]+$/g, '')
}

/** 「歌手 - 歌曲名」，过长时按字节截断，避免超出文件系统文件名上限 */
export function buildId3Stem(artist: string, title: string): string {
  const artistPart = sanitizeFilePart(artist)
  const titlePart = sanitizeFilePart(title)
  if (!artistPart || !titlePart) {
    throw new Error('ID3 中的歌手或歌曲名为空，或只含不能用于文件名的字符')
  }

  let stem = `${artistPart} - ${titlePart}`
  const chars = Array.from(stem)
  while (Buffer.byteLength(chars.join(''), 'utf8') > MAX_STEM_BYTES && chars.length > 0) {
    chars.pop()
  }
  stem = chars.join('')
  stem = stem.replace(/[. ]+$/g, '')
  if (!stem) {
    throw new Error('ID3 中的歌手或歌曲名为空，或只含不能用于文件名的字符')
  }
  return stem
}

/**
 * 选出不冲突的主文件名。
 * n = 0 为「歌手 - 歌曲名.ext」；被占用后再试「歌手 - 歌曲名.1.ext」。
 * 正在改名的音频和歌词本身不算占用。
 * 同目录已有「主文件名.lrc」时，这个主文件名也算被占用。
 */
export function chooseRenamePlan(options: {
  audioPath: string
  stem: string
  lyricPaths: string[]
  exists: (absPath: string) => boolean
}): RenamePlan {
  const audioExt = extname(options.audioPath)
  const dir = dirname(options.audioPath)
  const lyricPaths = uniquePaths(options.lyricPaths)
  const owned = new Set<string>([
    pathIdentity(options.audioPath),
    ...lyricPaths.map((p) => pathIdentity(p))
  ])

  const taken = (absPath: string) => {
    if (owned.has(pathIdentity(absPath))) return false
    return options.exists(absPath)
  }

  for (let n = 0; n <= MAX_SUFFIX; n++) {
    const stem = n === 0 ? options.stem : `${options.stem}.${n}`
    const audioTo = join(dir, `${stem}${audioExt}`)
    const lyrics = lyricPaths.map((from) => ({
      from,
      to: join(dirname(from), `${stem}${extname(from)}`)
    }))
    const destinations = [audioTo, ...lyrics.map((item) => item.to)]
    const destIds = destinations.map((p) => pathIdentity(p))
    if (new Set(destIds).size !== destIds.length) continue
    // 同目录已有「主文件名.lrc」也算重名，避免改名后串到别人的歌词上。
    // 正在改名的这首歌自己的歌词不算占用。
    const sidecarLrc = join(dir, `${stem}.lrc`)
    if (destinations.some(taken) || taken(sidecarLrc)) continue
    return {
      fileName: basename(audioTo),
      audioFrom: options.audioPath,
      audioTo,
      lyrics
    }
  }

  throw new Error('目录中重名过多，无法分配新文件名')
}

/** 同目录同名 .lrc / .txt，以及数据库里已记录且仍存在的歌词 */
export function collectLyricFiles(
  audioPath: string,
  lyricsPath: string | null | undefined,
  findSidecar: (audioPath: string) => string | null
): string[] {
  const dir = dirname(audioPath)
  const base = basename(audioPath, extname(audioPath))
  const candidates = [
    lyricsPath,
    findSidecar(audioPath),
    base ? join(dir, `${base}.lrc`) : null,
    base ? join(dir, `${base}.txt`) : null
  ]
  return uniquePaths(candidates.filter((p): p is string => !!p && existsSync(p)))
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of paths) {
    const id = pathIdentity(p)
    if (seen.has(id)) continue
    seen.add(id)
    result.push(p)
  }
  return result
}

/** 计划里真正需要移动的文件（路径相同的跳过） */
export function movesInPlan(plan: RenamePlan): LyricRename[] {
  return [
    ...plan.lyrics.filter((item) => pathIdentity(item.from) !== pathIdentity(item.to)),
    ...(pathIdentity(plan.audioFrom) !== pathIdentity(plan.audioTo)
      ? [{ from: plan.audioFrom, to: plan.audioTo }]
      : [])
  ]
}

/** 先改歌词再改音频；中途失败则把已改动的文件移回去 */
export function applyRenamePlan(plan: RenamePlan): void {
  const moves = movesInPlan(plan)
  const done: Array<{ from: string; to: string }> = []
  try {
    for (const move of moves) {
      renameSync(move.from, move.to)
      done.push(move)
    }
  } catch (error) {
    for (const move of done.reverse()) {
      try {
        renameSync(move.to, move.from)
      } catch (rollbackError) {
        console.error('重命名回滚失败:', rollbackError)
      }
    }
    throw error
  }
}

function pathMoved(item: LyricRename): boolean {
  return pathIdentity(item.from) !== pathIdentity(item.to)
}

/**
 * 只有歌词文件真的被挪走时才改库里的路径。
 * 原来的路径已经失效、同时同目录 .lrc 被改名时，改指向新文件。
 */
export function resolveLyricsPathAfterRename(
  previous: string | null | undefined,
  plan: RenamePlan,
  previousExists: boolean
): string | null {
  const previousId = previous && previousExists ? pathIdentity(previous) : ''
  const matched = previousId
    ? plan.lyrics.find((item) => pathIdentity(item.from) === previousId)
    : undefined
  if (matched) return pathMoved(matched) ? matched.to : previous || null

  const movedLrc = plan.lyrics.find(
    (item) => extname(item.from).toLowerCase() === '.lrc' && pathMoved(item)
  )
  if (movedLrc && !previousExists) return movedLrc.to
  return previous || null
}

export async function renameMusicById3(deps: {
  db: MusicDatabase
  musicId: number
  readTags: (filePath: string) => Promise<{ artist?: string; title?: string } | null>
  findSidecar: (audioPath: string) => string | null
  clearLyricCache: () => void
}): Promise<{ music: MusicItem; changed: boolean; moves: LyricRename[] }> {
  const music = deps.db.getMusicById(deps.musicId)
  if (!music) throw new Error('音乐不存在')
  if (!music.filePath || !existsSync(music.filePath)) throw new Error('音乐文件不存在')

  const tags = await deps.readTags(music.filePath)
  const stem = buildId3Stem(tags?.artist || '', tags?.title || '')
  const lyricPaths = collectLyricFiles(music.filePath, music.lyricsPath, deps.findSidecar)
  const audioDirId = pathIdentity(dirname(music.filePath))

  const plan = chooseRenamePlan({
    audioPath: music.filePath,
    stem,
    lyricPaths,
    exists: (absPath) => {
      if (existsSync(absPath)) return true
      if (pathIdentity(dirname(absPath)) !== audioDirId) return false
      const row = deps.db.getMusicByPath(absPath)
      return !!row && row.id !== music.id
    }
  })

  const previousLyricsExists = !!(music.lyricsPath && existsSync(music.lyricsPath))
  applyRenamePlan(plan)
  deps.clearLyricCache()

  const moves = movesInPlan(plan)
  const lyricsPath = resolveLyricsPathAfterRename(music.lyricsPath, plan, previousLyricsExists)
  const fileChanged = pathIdentity(plan.audioFrom) !== pathIdentity(plan.audioTo)
  const finalFileName = fileChanged ? plan.fileName : music.fileName
  const lyricsChanged = (lyricsPath || null) !== (music.lyricsPath || null)

  if (fileChanged || lyricsChanged) {
    try {
      deps.db.updateAllMusic(music.id, {
        ...(fileChanged ? { file_name: finalFileName } : {}),
        ...(lyricsChanged ? { lyrics_path: lyricsPath } : {})
      })
    } catch (error) {
      applyRenamePlan({
        fileName: basename(plan.audioFrom),
        audioFrom: plan.audioTo,
        audioTo: plan.audioFrom,
        lyrics: plan.lyrics.map((item) => ({ from: item.to, to: item.from }))
      })
      deps.clearLyricCache()
      throw error
    }
  }

  const updated = deps.db.getMusicById(music.id)
  if (!updated) throw new Error('音乐不存在')
  return { music: updated, changed: moves.length > 0 || lyricsChanged, moves }
}

export interface RestoreFileNameRequest {
  musicId: number
  /** 还原目标：打开对话框时的音频路径 */
  audioTo: string
  /** 打开对话框时的歌词路径；当时没有则为 null */
  lyricsPath: string | null
  /** 歌词从当前位置移回原路径 */
  lyrics: LyricRename[]
}

/**
 * 把本次对话框里重命名过的音频和歌词移回打开对话框时的路径。
 * 原路径已被其他文件占用时拒绝，避免覆盖。
 */
export async function restoreMusicFileName(deps: {
  db: MusicDatabase
  request: RestoreFileNameRequest
  clearLyricCache: () => void
}): Promise<MusicItem> {
  const { request } = deps
  const music = deps.db.getMusicById(request.musicId)
  if (!music?.filePath || !existsSync(music.filePath)) throw new Error('音乐文件不存在')
  if (!request.audioTo || !Array.isArray(request.lyrics)) throw new Error('还原参数无效')
  if (extname(request.audioTo).toLowerCase() !== extname(music.filePath).toLowerCase()) {
    throw new Error('只能还原为原来的扩展名')
  }

  const audioDir = pathIdentity(dirname(music.filePath))
  if (pathIdentity(dirname(request.audioTo)) !== audioDir) {
    throw new Error('只能还原到原来的目录')
  }

  const lyricMoves = request.lyrics.filter(
    (item) => item?.from && item?.to && pathIdentity(item.from) !== pathIdentity(item.to)
  )
  for (const move of lyricMoves) {
    assertOwnedLyric(music, move.from)
    if (pathIdentity(dirname(move.from)) !== pathIdentity(dirname(move.to))) {
      throw new Error('只能还原到原来的目录')
    }
    if (!existsSync(move.from)) throw new Error('歌词文件已不在预期位置，无法还原')
    if (existsSync(move.to) && pathIdentity(move.to) !== pathIdentity(move.from)) {
      throw new Error(`原歌词名已被占用：${basename(move.to)}`)
    }
  }

  if (existsSync(request.audioTo) && pathIdentity(request.audioTo) !== pathIdentity(music.filePath)) {
    throw new Error(`原文件名已被占用：${basename(request.audioTo)}`)
  }

  const plan: RenamePlan = {
    fileName: basename(request.audioTo),
    audioFrom: music.filePath,
    audioTo: request.audioTo,
    lyrics: lyricMoves
  }
  applyRenamePlan(plan)
  deps.clearLyricCache()

  const fileChanged = pathIdentity(music.filePath) !== pathIdentity(request.audioTo)
  const nextLyrics = request.lyricsPath || null
  const lyricsChanged = (music.lyricsPath || null) !== nextLyrics
  if (fileChanged || lyricsChanged) {
    try {
      deps.db.updateAllMusic(music.id, {
        ...(fileChanged ? { file_name: basename(request.audioTo) } : {}),
        ...(lyricsChanged ? { lyrics_path: nextLyrics } : {})
      })
    } catch (error) {
      applyRenamePlan({
        fileName: basename(music.filePath),
        audioFrom: request.audioTo,
        audioTo: music.filePath,
        lyrics: lyricMoves.map((item) => ({ from: item.to, to: item.from }))
      })
      deps.clearLyricCache()
      throw error
    }
  }

  const updated = deps.db.getMusicById(music.id)
  if (!updated) throw new Error('音乐不存在')
  return updated
}

function assertOwnedLyric(music: MusicItem, from: string): void {
  if (music.lyricsPath && pathIdentity(from) === pathIdentity(music.lyricsPath)) return
  const audioDir = dirname(music.filePath)
  if (pathIdentity(dirname(from)) !== pathIdentity(audioDir)) {
    throw new Error('只能还原这首歌自己的歌词文件')
  }
  const audioBase = basename(music.filePath, extname(music.filePath))
  const lyricBase = basename(from, extname(from))
  const sameBase = process.platform === 'linux'
    ? lyricBase === audioBase
    : lyricBase.toLowerCase() === audioBase.toLowerCase()
  if (!sameBase) {
    throw new Error('只能还原这首歌自己的歌词文件')
  }
  const ext = extname(from).toLowerCase()
  if (ext !== '.lrc' && ext !== '.txt') {
    throw new Error('只能还原歌词文件')
  }
}
