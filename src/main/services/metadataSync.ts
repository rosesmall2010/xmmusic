import { basename, extname } from 'path'
import type { MusicItem } from '@shared/types/music'
import { parseFilenameForTags } from '@shared/utils/parseFilename'
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

/**
 * 根据文件名 + ID3 推导应写入数据库的元数据
 * 优先使用正确的 ID3 / 文件名，覆盖库中可能乱码的旧值
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
    try {
      id3 = await id3Fixer.readRawID3Tags(music.filePath)
    } catch (error) {
      console.warn('读取 ID3 失败，回退到文件名解析:', music.filePath, error)
    }
  }

  // 标题/歌手：ID3 有值优先，否则用文件名解析，最后才保留库内值
  const title = pickNonEmpty(id3?.title, parsed.title, music.title) || music.title
  const artist = pickNonEmpty(id3?.artist, parsed.artist, music.artist) || music.artist
  // 专辑：ID3 优先；文件名解析通常无专辑，回退库内值或歌手名
  const albumRaw = pickNonEmpty(id3?.album, music.album || undefined, parsed.album, artist)
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
      result.failed++
      result.errors.push({
        id,
        file: '',
        error: error?.message || String(error)
      })
    }
  }

  return result
}
