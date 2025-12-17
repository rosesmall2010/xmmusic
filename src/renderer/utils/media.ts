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
  // Windows 路径处理：将反斜杠转换为正斜杠（URL 需要）
  let normalizedPath = coverPath
  // 检测 Windows 路径（包含反斜杠或以盘符开头）
  const isWindowsPath = normalizedPath.includes('\\') || normalizedPath.match(/^[A-Za-z]:/)
  if (isWindowsPath) {
    normalizedPath = normalizedPath.replace(/\\/g, '/')
    // Windows 绝对路径需要添加前导斜杠（如 C:/Music -> /C:/Music）
    if (normalizedPath.match(/^[A-Za-z]:/)) {
      normalizedPath = '/' + normalizedPath
    }
  }
  return `local-file://${normalizedPath}`
}
