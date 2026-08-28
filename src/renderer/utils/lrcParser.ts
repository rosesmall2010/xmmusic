export interface LyricLine {
  time: number
  text: string
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines = lrc.split('\n')
  const result: LyricLine[] = []

  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{1,3})\]/

  for (const line of lines) {
    const match = timeRegex.exec(line)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const fraction = parseInt(match[3])

      // 小数位数不固定：1 位为十分之一秒，2 位为百分之一秒，3 位为毫秒
      const time = minutes * 60 + seconds + fraction / Math.pow(10, match[3].length)
      const text = line.replace(timeRegex, '').trim()

      if (text) {
        result.push({ time, text })
      }
    }
  }

  return result.sort((a, b) => a.time - b.time)
}
