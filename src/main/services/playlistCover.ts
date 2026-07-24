import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { app } from 'electron'
import type MusicDatabase from '../database/db'

export type PlaylistCoverSource =
  | { type: 'file'; filePath: string }
  | { type: 'music'; musicId: number; filePath?: string }
  | { type: 'default' }

/**
 * 设置歌单封面：选本地图片 / 使用歌单内歌曲封面 / 使用应用默认封面图
 * 返回写入数据库的 coverPath
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

  let sourcePath: string | null = null

  if (source.type === 'default') {
    // 使用应用内置默认封面图（不是清空 coverPath）
    sourcePath = resolveAppDefaultCoverPath()
  } else if (source.type === 'music') {
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

/**
 * 解析应用默认封面图片路径（开发源文件 / 生产 Vite 产物均可）
 */
function resolveAppDefaultCoverPath(): string {
  const candidates: string[] = []

  if (!app.isPackaged) {
    candidates.push(join(app.getAppPath(), 'src/renderer/assets/default-cover.png'))
    candidates.push(join(process.cwd(), 'src/renderer/assets/default-cover.png'))
  }

  // dist/electron/main/services → dist/renderer/assets
  const assetDirs = [
    join(__dirname, '../../../renderer/assets'),
    join(app.getAppPath(), 'dist/renderer/assets')
  ]

  for (const dir of assetDirs) {
    if (!existsSync(dir)) continue
    try {
      const match = readdirSync(dir).find(
        (name) => name.startsWith('default-cover') && /\.(png|jpe?g|webp)$/i.test(name)
      )
      if (match) candidates.push(join(dir, match))
    } catch {
      // 忽略读目录失败
    }
  }

  // 相对编译产物再向上找源文件（兜底）
  candidates.push(join(__dirname, '../../../../src/renderer/assets/default-cover.png'))

  for (const path of candidates) {
    if (existsSync(path)) return path
  }

  throw new Error('找不到应用默认封面图片（default-cover.png）')
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
    ext = '.png'
  }
  // Vite 哈希文件名如 default-cover-CF2PkWjy.png，extname 正常
  if (!['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
    ext = '.png'
  }

  // 使用时间戳生成唯一文件名，避免同路径导致浏览器缓存旧封面
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
