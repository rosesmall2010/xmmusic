/**
 * 从文件名中智能解析音乐标签信息
 * （渲染进程入口，实现放在 shared 供主进程批量同步复用）
 */
export {
  parseFilenameForTags,
  validateTags,
  extractAlbumFromPath,
  type ParsedTags
} from '@shared/utils/parseFilename'
