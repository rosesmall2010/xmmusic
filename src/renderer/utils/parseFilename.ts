/**
 * 从文件名中智能解析音乐标签信息
 * 支持的格式：
 * - "歌手名-歌曲名.mp3"
 * - "歌曲名.mp3"
 * - "歌手1&歌手2-歌曲名.mp3"
 * - "歌手1,歌手2-歌曲名.mp3"
 */

export interface ParsedTags {
  artist: string
  title: string
  album: string
}

/**
 * 解析文件名获取标签信息
 * @param fileName 文件名（包含扩展名）
 * @param currentTags 当前的标签信息（用于补充）
 * @returns 解析后的标签信息
 */
export function parseFilenameForTags(
  fileName: string,
  currentTags?: { artist?: string; title?: string; album?: string }
): ParsedTags {
  // 移除文件扩展名
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')

  // 默认值
  let artist = currentTags?.artist || ''
  let title = currentTags?.title || nameWithoutExt
  let album = currentTags?.album || ''

  // 检测是否包含分隔符 "-"
  if (nameWithoutExt.includes('-')) {
    const parts = nameWithoutExt.split('-').map(p => p.trim())

    if (parts.length >= 2) {
      // 格式: "歌手-歌曲" 或 "歌手1&歌手2-歌曲"
      artist = parts[0]
      title = parts.slice(1).join('-') // 处理标题中可能包含 "-" 的情况

      // 处理多个歌手的情况
      // 支持 "&" 和 "," 作为分隔符
      if (artist.includes('&') || artist.includes(',')) {
        // 标准化为统一的分隔符
        artist = artist.replace(/,/g, ' & ')
      }
    }
  } else if (nameWithoutExt.includes('_')) {
    // 某些文件使用下划线作为分隔符
    const parts = nameWithoutExt.split('_').map(p => p.trim())

    if (parts.length >= 2) {
      artist = parts[0]
      title = parts.slice(1).join('_')
    }
  }

  // 清理空格
  artist = artist.trim()
  title = title.trim()
  album = album.trim()

  return {
    artist,
    title,
    album
  }
}

/**
 * 验证标签是否有效（不为空）
 */
export function validateTags(tags: ParsedTags): boolean {
  return !!(tags.title && tags.title.length > 0)
}

/**
 * 从文件路径中提取可能的专辑信息
 * 例如: /music/周杰伦/范特西/歌曲.mp3 -> 专辑可能是 "范特西"
 */
export function extractAlbumFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  // 通常专辑名是倒数第二个文件夹
  if (parts.length >= 2) {
    return parts[parts.length - 2] || ''
  }
  return ''
}
