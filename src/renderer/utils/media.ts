/**
 * 把本地文件路径转换为 local-file 协议 URL
 *
 * 对齐 EchoVault（electron 38）已验证的 Windows 可播方案：
 * - 固定 host「media」，避免 standard 协议把路径误当 host 规范化破坏
 * - 整段路径一次 encodeURIComponent，保留 Windows 原生反斜杠（C:\Music\a.mp3）
 *   不要先改成 / 再拆段编码——Chromium 的 URL.pathname 在 Win 下易把路径解析坏
 *
 * @param filePath 本地文件绝对路径（保持 OS 原生分隔符即可）
 * @returns local-file://media/<encodeURIComponent(path)>
 */
export const toLocalFileUrl = (filePath: string): string => {
  return `local-file://media/${encodeURIComponent(filePath)}`
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
