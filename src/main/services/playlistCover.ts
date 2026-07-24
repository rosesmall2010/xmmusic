import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { app } from 'electron'
import type MusicDatabase from '../database/db'

export type PlaylistCoverSource =
  | { type: 'file'; filePath: string }
  | { type: 'music'; musicId: number; filePath?: string }
  | { type: 'default' }

/**
 * 设置歌单封面：选本地图片 / 使用歌单内歌曲封面 / 恢复默认（清空自定义封面）
 * 返回写入数据库的 coverPath（默认封面为 null）
 */
export function setPlaylistCover(
  db: MusicDatabase,
  playlistId: number,
  source: PlaylistCoverSource
): string | null {
  const playlist = db.getPlaylistById(Number(playlistId))
  if (!playlist) {
    throw new Error(`歌单不存在: id=${playlistId}`)
  }

  if (source.type === 'default') {
    cleanupPlaylistCoverFiles(playlistId)
    db.updatePlaylist(playlistId, { coverPath: null })
    return null
  }

  let sourcePath: string | null = null

  if (source.type === 'music') {
    // 优先使用前端传入的候选封面路径（与列表展示一致），避免二次查库路径不一致
    if (source.filePath && existsSync(source.filePath)) {
      sourcePath = source.filePath
    } else {
      const musicId = Number(source.musicId)
      const music = db.getMusicById(musicId)
      if (!music) {
        throw new Error(`音乐不存在: id=${source.musicId}`)
      }
      if (!music.coverPath || !existsSync(music.coverPath)) {
        throw new Error('该歌曲没有可用封面')
      }
      sourcePath = music.coverPath
    }
  } else {
    // type === 'file'
    if (!source.filePath || !existsSync(source.filePath)) {
      throw new Error('图片文件不存在')
    }
    sourcePath = source.filePath
  }

  const savedPath = copyCoverToPlaylistDir(playlistId, sourcePath)
  db.updatePlaylist(playlistId, { coverPath: savedPath })
  return savedPath
}

function getCoversDir(): string {
  const coversDir = join(app.getPath('userData'), 'covers')
  if (!existsSync(coversDir)) {
    mkdirSync(coversDir, { recursive: true })
  }
  return coversDir
}

/** 清理该歌单旧的自定义封面文件（playlist-{id}.* / playlist-{id}-*.*） */
function cleanupPlaylistCoverFiles(playlistId: number): void {
  const coversDir = getCoversDir()
  const prefix = `playlist-${playlistId}`
  try {
    for (const name of readdirSync(coversDir)) {
      if (name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`)) {
        try {
          unlinkSync(join(coversDir, name))
        } catch {
          // 忽略单个文件删除失败
        }
      }
    }
  } catch {
    // 目录不存在等
  }
}

function copyCoverToPlaylistDir(playlistId: number, sourcePath: string): string {
  const coversDir = getCoversDir()

  let ext = extname(sourcePath).toLowerCase()
  if (!ext || ext === '.') {
    ext = '.jpg'
  }
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
    ext = '.jpg'
  }

  // 使用时间戳生成唯一文件名，避免同路径导致浏览器缓存旧封面、看起来像「设置失败」
  cleanupPlaylistCoverFiles(playlistId)
  const destPath = join(coversDir, `playlist-${playlistId}-${Date.now()}${ext}`)
  copyFileSync(sourcePath, destPath)
  return destPath
}

export function getPlaylistCoverCandidates(
  db: MusicDatabase,
  playlistId: number
): Array<{ musicId: number; title: string; artist: string; coverPath: string }> {
  const songs = db.getPlaylistSongs(Number(playlistId))
  const seen = new Set<string>()
  const candidates: Array<{ musicId: number; title: string; artist: string; coverPath: string }> = []

  for (const song of songs) {
    if (!song.coverPath || !existsSync(song.coverPath)) continue
    if (seen.has(song.coverPath)) continue
    seen.add(song.coverPath)
    candidates.push({
      musicId: song.id,
      title: song.title,
      artist: song.artist,
      coverPath: song.coverPath
    })
  }

  return candidates
}
