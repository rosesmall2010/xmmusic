export interface LyricLine {
  time: number
  text: string
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines = lrc.split('\n')
  const result: LyricLine[] = []

  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

  for (const line of lines) {
    const match = timeRegex.exec(line)
    if (match) {
      const minutes = parseInt(match[1])
      const seconds = parseInt(match[2])
      const milliseconds = parseInt(match[3])

      // Convert to seconds
      const time = minutes * 60 + seconds + milliseconds / (match[3].length === 3 ? 1000 : 100)
      const text = line.replace(timeRegex, '').trim()

      if (text) {
        result.push({ time, text })
      }
    }
  }

  return result.sort((a, b) => a.time - b.time)
}
