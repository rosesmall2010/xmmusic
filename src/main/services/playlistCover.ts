import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, extname } from 'path'
import { app } from 'electron'
import type MusicDatabase from '../database/db'

export type PlaylistCoverSource =
  | { type: 'file'; filePath: string }
  | { type: 'music'; musicId: number }
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
  const playlist = db.getPlaylistById(playlistId)
  if (!playlist) {
    throw new Error(`歌单不存在: id=${playlistId}`)
  }

  if (source.type === 'default') {
    db.updatePlaylist(playlistId, { coverPath: null })
    return null
  }

  if (source.type === 'music') {
    const music = db.getMusicById(source.musicId)
    if (!music) {
      throw new Error(`音乐不存在: id=${source.musicId}`)
    }
    if (!music.coverPath || !existsSync(music.coverPath)) {
      throw new Error('该歌曲没有可用封面')
    }
    const savedPath = copyCoverToPlaylistDir(playlistId, music.coverPath)
    db.updatePlaylist(playlistId, { coverPath: savedPath })
    return savedPath
  }

  // type === 'file'
  if (!source.filePath || !existsSync(source.filePath)) {
    throw new Error('图片文件不存在')
  }
  const savedPath = copyCoverToPlaylistDir(playlistId, source.filePath)
  db.updatePlaylist(playlistId, { coverPath: savedPath })
  return savedPath
}

function copyCoverToPlaylistDir(playlistId: number, sourcePath: string): string {
  const coversDir = join(app.getPath('userData'), 'covers')
  if (!existsSync(coversDir)) {
    mkdirSync(coversDir, { recursive: true })
  }

  let ext = extname(sourcePath).toLowerCase()
  if (!ext || ext === '.') {
    ext = '.jpg'
  }
  // 统一常见扩展名
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
    ext = '.jpg'
  }

  const destPath = join(coversDir, `playlist-${playlistId}${ext}`)
  copyFileSync(sourcePath, destPath)
  return destPath
}

export function getPlaylistCoverCandidates(
  db: MusicDatabase,
  playlistId: number
): Array<{ musicId: number; title: string; artist: string; coverPath: string }> {
  const songs = db.getPlaylistSongs(playlistId)
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
