/**
 * 把本地文件路径转换为 local-file 协议 URL
 * local-file 是 standard 协议（媒体 seek 必须），URL 必须带 host，这里用固定占位 host "media"
 * @param filePath 本地文件绝对路径
 * @returns local-file://media/... 形式的 URL
 */
export const toLocalFileUrl = (filePath: string): string => {
  // Windows 路径处理：将反斜杠转换为正斜杠（URL 需要）
  let normalizedPath = filePath
  // 检测 Windows 路径（包含反斜杠或以盘符开头）
  const isWindowsPath = normalizedPath.includes('\\') || normalizedPath.match(/^[A-Za-z]:/)
  if (isWindowsPath) {
    normalizedPath = normalizedPath.replace(/\\/g, '/')
  }
  // 确保以 / 开头（Windows 绝对路径如 C:/Music -> /C:/Music）
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath
  }
  // 分段编码路径，保留斜杠；避免中文/空格导致协议解析或 CORS 校验异常
  const encodedPath = normalizedPath
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/')
  return `local-file://media${encodedPath}`
}

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
  return toLocalFileUrl(coverPath)
}
