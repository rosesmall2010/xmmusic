import { describe, it, expect } from 'vitest'
import { parseSearchKeywords } from './searchKeywords'

describe('parseSearchKeywords', () => {
  it('按空格、英文逗号、中文逗号拆分', () => {
    expect(parseSearchKeywords('周杰伦 晴天,live，2004')).toEqual(['周杰伦', '晴天', 'live', '2004'])
  })

  it('连续分隔符与首尾空白不产生空关键字', () => {
    expect(parseSearchKeywords('  a ,, b，，  c  ')).toEqual(['a', 'b', 'c'])
  })

  it('去重且不区分大小写', () => {
    expect(parseSearchKeywords('Jay jay JAY 晴天 晴天')).toEqual(['Jay', '晴天'])
  })

  it('非 ASCII 字母大小写不合并（SQLite LIKE 对其区分大小写）', () => {
    expect(parseSearchKeywords('Émile émile')).toEqual(['Émile', 'émile'])
  })

  it('没有关键字返回空数组', () => {
    expect(parseSearchKeywords('')).toEqual([])
    expect(parseSearchKeywords(' , ，  ')).toEqual([])
  })
})
