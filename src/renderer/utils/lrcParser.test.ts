import { describe, it, expect } from 'vitest'
import { parseLrc } from './lrcParser'

describe('parseLrc', () => {
  it('应该解析 1/2/3 位小数的时间戳', () => {
    const result = parseLrc(
      '[00:29.0]一位小数\n[00:33.45]两位小数\n[00:40.809]三位小数'
    )
    expect(result).toEqual([
      { time: 29, text: '一位小数' },
      { time: 33.45, text: '两位小数' },
      { time: 40.809, text: '三位小数' }
    ])
  })

  it('不应丢失只有 1 位小数的行（回归：曾整行解析失败被丢弃）', () => {
    const result = parseLrc(
      '[02:26.400]虽然总有些遗憾\n[02:34.0]为何你还在我心中'
    )
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ time: 154, text: '为何你还在我心中' })
  })
})
