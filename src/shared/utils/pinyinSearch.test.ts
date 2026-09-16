import { describe, expect, it } from 'vitest'
import { classifySearchQuery, escapeFtsQuery, toFullPinyin, toInitials } from './pinyinSearch'

describe('pinyinSearch', () => {
  it('classifySearchQuery 分流', () => {
    expect(classifySearchQuery('zjl')).toBe('pinyin')
    expect(classifySearchQuery('周杰伦')).toBe('fts')
    expect(classifySearchQuery('jay1')).toBe('mixed')
  })

  it('escapeFtsQuery 去除特殊字符', () => {
    expect(escapeFtsQuery('hello*"')).toBe('hello')
  })

  it('全拼与声母', () => {
    expect(toFullPinyin('晴天')).toContain('qing')
    expect(toInitials('周杰伦')).toBe('zjl')
  })
})
