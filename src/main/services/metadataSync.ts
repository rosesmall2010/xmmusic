import { basename, extname } from 'path'
import type { MusicItem } from '@shared/types/music'
import { parseFilenameForTags } from '../../shared/utils/parseFilename'
import ID3Fixer from './id3Fixer'
import type MusicDatabase from '../database/db'

export interface SyncMetadataUpdates {
  title?: string
  artist?: string
  album?: string | null
  year?: number | null
  genre?: string | null
}

export interface BatchSyncResult {
  success: number
  failed: number
  updated: MusicItem[]
  errors: Array<{ id: number; file: string; error: string }>
}

const id3Fixer = new ID3Fixer()

function pickNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 是否基本为可打印 ASCII（英文歌名/歌手常见情况） */
function isMostlyPrintableAscii(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true
  const s = value.trim()
  const ascii = (s.match(/[\x20-\x7E]/g) || []).length
  return ascii / s.length >= 0.85
}

/** 粗略判断字符串是否像乱码（替换符、控制符、无 CJK 却大量 Latin-1 扩展） */
function looksGarbled(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false
  const s = value.trim()
  if (/[\uFFFD\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(s)) return true
  // 纯英文/ASCII 绝不是乱码
  if (isMostlyPrintableAscii(s)) return false
  const cjk = (s.match(/[\u4e00-\u9fa5]/g) || []).length
  const latinExt = (s.match(/[\u0080-\u024F]/g) || []).length
  // 常见：GBK 被当 Latin1/UTF-8 读出，呈现一串扩展拉丁字母而无汉字
  if (latinExt >= 2 && cjk === 0 && /[À-ÿ]/.test(s)) return true
  return false
}

/**
 * 是否值得尝试编码转换：
 * - 英文/ASCII 标签禁止转码（utf16le/gbk 误转会把英文变成汉字乱码）
 * - 已有正常汉字且不乱码：禁止转码
 * - 仅当字段疑似乱码时才尝试
 */
function shouldAttemptEncodingFix(raw: {
  title?: string
  artist?: string
  album?: string
}): boolean {
  const fields = [raw.title, raw.artist, raw.album]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

  if (fields.length === 0) return false
  if (fields.every(isMostlyPrintableAscii)) return false

  const hasCleanCjk = fields.some(
    (f) => /[\u4e00-\u9fa5]/.test(f) && !looksGarbled(f)
  )
  if (hasCleanCjk && !fields.some(looksGarbled)) return false

  return fields.some(looksGarbled)
}

function countCjk(value: string | null | undefined): number {
  if (!value) return 0
  return (value.match(/[\u4e00-\u9fa5]/g) || []).length
}

/**
 * 读取并尽量纠正 ID3（仅 MP3）。乱码或无法纠正时对应字段返回空，交给文件名兜底。
 */
async function resolveId3Fields(
  filePath: string
): Promise<{ title?: string; artist?: string; album?: string; year?: string; genre?: string } | null> {
  let raw: { title: string; artist: string; album: string; year?: string; genre?: string } | null = null
  try {
    raw = await id3Fixer.readRawID3Tags(filePath)
  } catch (error) {
    console.warn('读取 ID3 失败，回退到文件名解析:', filePath, error)
    return null
  }
  if (!raw) return null

  let tags = { ...raw }

  // 仅在疑似乱码时尝试编码转换；英文标签绝不转码
  if (shouldAttemptEncodingFix(raw)) {
    try {
      const detections = await id3Fixer.detectEncoding(filePath)
      // 排除 utf16le：对 ASCII 英文误转极易变成「像汉字的乱码」
      const best = detections.find(
        (d) => d.encoding !== 'utf8' && d.encoding !== 'utf16le' && d.confidence > 0.5
      )
      if (best) {
        const converted = id3Fixer.convertID3TagsEncoding(
          {
            title: raw.title || '',
            artist: raw.artist || '',
            album: raw.album || '',
            year: raw.year,
            genre: raw.genre
          },
          best.encoding
        )
        const rawGarbledCount = [raw.title, raw.artist, raw.album].filter(looksGarbled).length
        const convertedGarbledCount = [converted.title, converted.artist, converted.album].filter(looksGarbled).length
        const rawCjk = countCjk(raw.title) + countCjk(raw.artist) + countCjk(raw.album)
        const convertedCjk = countCjk(converted.title) + countCjk(converted.artist) + countCjk(converted.album)
        // 仅当转换后更干净（乱码更少，或汉字明显增加且自身不乱码）才采纳
        const improved =
          convertedGarbledCount < rawGarbledCount ||
          (convertedCjk > rawCjk && convertedGarbledCount === 0)
        if (improved) {
          tags = converted
        }
      }
    } catch (error) {
      console.warn('检测 ID3 编码失败，使用原始标签:', filePath, error)
    }
  }

  return {
    title: looksGarbled(tags.title) ? undefined : tags.title || undefined,
    artist: looksGarbled(tags.artist) ? undefined : tags.artist || undefined,
    album: looksGarbled(tags.album) ? undefined : tags.album || undefined,
    year: tags.year,
    genre: tags.genre
  }
}

/**
 * 根据文件名 + ID3 推导应写入数据库的元数据
 * MP3：优先用编码纠正后的 ID3；乱码字段降级到文件名解析，再回退库内值
 * 非 MP3：仅文件名 + 库内值（当前未读 FLAC/M4A 等内嵌标签）
 */
export async function resolveMetadataForSync(music: MusicItem): Promise<SyncMetadataUpdates> {
  const fileName = music.fileName || basename(music.filePath)
  const parsed = parseFilenameForTags(fileName, {
    artist: music.artist,
    title: music.title,
    album: music.album || ''
  })

  let id3: { title?: string; artist?: string; album?: string; year?: string; genre?: string } | null = null
  const ext = (music.fileExtension || extname(music.filePath)).toLowerCase().replace(/^\./, '')
  if (ext === 'mp3') {
    id3 = await resolveId3Fields(music.filePath)
  }

  const title = pickNonEmpty(id3?.title, parsed.title, music.title) || music.title
  const artist = pickNonEmpty(id3?.artist, parsed.artist, music.artist) || music.artist
  // 专辑：无可靠来源时写 null，不要用歌手名兜底污染专辑维度
  const albumRaw = pickNonEmpty(id3?.album, music.album || undefined, parsed.album)
  const album = albumRaw || null

  const updates: SyncMetadataUpdates = { title, artist, album }

  if (id3?.year) {
    const year = parseInt(id3.year, 10)
    if (!isNaN(year)) updates.year = year
  }
  if (id3?.genre) {
    updates.genre = id3.genre
  }

  return updates
}

/**
 * 仅把元数据写入数据库（不改文件 ID3）
 * 歌单/收藏等通过 music_id JOIN all_music，因此无需再改关联表
 */
export function syncMusicMetadataToDb(
  db: MusicDatabase,
  musicId: number,
  updates: SyncMetadataUpdates
): MusicItem {
  const music = db.getMusicById(musicId)
  if (!music) {
    throw new Error(`音乐不存在: id=${musicId}`)
  }

  const dbUpdates: Parameters<MusicDatabase['updateAllMusic']>[1] = {}
  if (updates.title !== undefined) dbUpdates.title = updates.title
  if (updates.artist !== undefined) dbUpdates.artist = updates.artist
  if (updates.album !== undefined) dbUpdates.album = updates.album
  if (updates.year !== undefined) dbUpdates.year = updates.year
  if (updates.genre !== undefined) dbUpdates.genre = updates.genre

  if (Object.keys(dbUpdates).length > 0) {
    db.updateAllMusic(musicId, dbUpdates)
  }

  const updated = db.getMusicById(musicId)
  if (!updated) {
    throw new Error(`同步后无法读取音乐: id=${musicId}`)
  }
  return updated
}

/**
 * 批量：自动从文件名/ID3 解析后写入数据库
 */
export async function batchSyncMusicMetadataToDb(
  db: MusicDatabase,
  musicIds: number[]
): Promise<BatchSyncResult> {
  const result: BatchSyncResult = {
    success: 0,
    failed: 0,
    updated: [],
    errors: []
  }

  for (const id of musicIds) {
    try {
      const music = db.getMusicById(id)
      if (!music) {
        result.failed++
        result.errors.push({ id, file: '', error: '音乐不存在' })
        continue
      }
      const updates = await resolveMetadataForSync(music)
      const updated = syncMusicMetadataToDb(db, id, updates)
      result.success++
      result.updated.push(updated)
    } catch (error: any) {
      let file = ''
      try {
        const failedMusic = db.getMusicById(id)
        file = failedMusic?.fileName || failedMusic?.filePath || ''
      } catch {
        // 忽略二次查询失败
      }
      result.failed++
      result.errors.push({
        id,
        file,
        error: error?.message || String(error)
      })
    }
  }

  return result
}
