/**
 * 批量匹配结果合并的自检
 *
 * 用户要求的三条行为：
 * 1. 每次匹配完更新一次数据（成功项才更新）
 * 2. 未成功的不变化
 * 3. 正在显示的当前曲封面要同步更新（由 App.vue 的 applyCoverPaths 负责，此处不覆盖）
 *
 * 这里守住前两条：状态筛选等价于「只认带路径的成功项」，且值未变时不产生新数组。
 */
import { describe, it, expect } from 'vitest'
import { mergeMatchPaths } from './mergeMatchPaths'
import type { MusicItem } from '@shared/types/music'

const song = (id: number, extra: Partial<MusicItem> = {}) =>
  ({ id, title: `s${id}`, ...extra }) as MusicItem

describe('mergeMatchPaths', () => {
  it('成功项更新对应字段', () => {
    const list = [song(1), song(2)]
    const out = mergeMatchPaths(list, [{ musicId: 2, lyricsPath: '/l/2.lrc' }])
    expect(out).not.toBeNull()
    expect(out![0].lyricsPath).toBeUndefined()
    expect(out![1].lyricsPath).toBe('/l/2.lrc')
  })

  it('失败项不带路径 → 内存不变（返回 null）', () => {
    const list = [song(1), song(2)]
    const out = mergeMatchPaths(list, [
      { musicId: 1 }, // failed
      { musicId: 2 } // skipped_low_similarity / instrumental 等同样不带路径
    ])
    expect(out).toBeNull()
  })

  it('混合批次：只更新成功项，失败项保持原样', () => {
    const list = [song(1), song(2, { lyricsPath: '/old/2.lrc' }), song(3)]
    const out = mergeMatchPaths(list, [
      { musicId: 1, lyricsPath: '/l/1.lrc' }, // matched
      { musicId: 2 }, // failed → 不动
      { musicId: 3 } // skipped
    ])
    expect(out).not.toBeNull()
    expect(out![0].lyricsPath).toBe('/l/1.lrc')
    expect(out![1].lyricsPath).toBe('/old/2.lrc') // 未被清空
    expect(out![2].lyricsPath).toBeUndefined()
  })

  it('skipped_has_cover 带的是原有路径 → 值相等时返回 null（no-op）', () => {
    const list = [song(1, { coverPath: '/c/1.jpg' })]
    const out = mergeMatchPaths(list, [{ musicId: 1, coverPath: '/c/1.jpg' }])
    expect(out).toBeNull()
  })

  it('同一首已有旧路径、匹配到新路径 → 更新', () => {
    const list = [song(1, { coverPath: '/c/old.jpg' })]
    const out = mergeMatchPaths(list, [{ musicId: 1, coverPath: '/c/new.jpg' }])
    expect(out).not.toBeNull()
    expect(out![0].coverPath).toBe('/c/new.jpg')
  })

  it('结果里的 id 不在当前列表中（已翻页/已删除）→ 忽略且不算变更', () => {
    const list = [song(1)]
    const out = mergeMatchPaths(list, [{ musicId: 999, coverPath: '/c/999.jpg' }])
    expect(out).toBeNull()
  })

  it('linked_local 与 matched 一样算成功', () => {
    const list = [song(1)]
    const out = mergeMatchPaths(list, [{ musicId: 1, lyricsPath: '/local/1.lrc' }])
    expect(out![0].lyricsPath).toBe('/local/1.lrc')
  })

  it('空结果 / 空列表 / undefined 都是安全 no-op', () => {
    expect(mergeMatchPaths([], [{ musicId: 1, coverPath: '/c.jpg' }])).toBeNull()
    expect(mergeMatchPaths([song(1)], [])).toBeNull()
    expect(mergeMatchPaths([song(1)], undefined)).toBeNull()
  })

  it('未变更的项保持同一对象引用（避免整表重渲染）', () => {
    const untouched = song(1)
    const list = [untouched, song(2)]
    const out = mergeMatchPaths(list, [{ musicId: 2, coverPath: '/c/2.jpg' }])
    expect(out![0]).toBe(untouched)
  })
})
