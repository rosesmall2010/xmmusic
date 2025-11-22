/**
 * 获取封面图片的 URL
 * @param coverPath 封面文件路径
 * @returns 可访问的 URL
 */
export const getCoverUrl = (coverPath: string | null | undefined): string => {
  if (!coverPath) return ''

  // 如果已经是 http/https 开头，直接返回
  if (coverPath.startsWith('http://') || coverPath.startsWith('https://')) {
    return coverPath
  }

  // 如果是 base64，直接返回
  if (coverPath.startsWith('data:image')) {
    return coverPath
  }

  // 否则转换为 local-file 协议
  // 注意：Windows 下路径可能包含反斜杠，需要处理
  // 但 local-file 协议通常只需要加上前缀即可，Electron 会处理
  return `local-file://${coverPath}`
}
