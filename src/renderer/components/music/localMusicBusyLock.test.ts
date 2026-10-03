/**
 * 本地音乐页「锁不自引用」护栏
 *
 * 背景（真实 bug，2026-10 修）：SongList 通过 syncManualMatchUiBusy() 把
 * isMatchFlowBusy() 的结果写回 lyricsMatchStore.manualMatchUiBusy，而
 * isMatchFlowBusy() 又包含 props.libraryBusy。若传给 SongList 的 libraryBusy
 * 由 LocalMusicList.isLibraryBusy 提供、且后者包含 manualMatchUiBusy，就闭合成环：
 *
 *   isMatchFlowBusy() → manualMatchUiBusy → isLibraryBusy → props.libraryBusy → isMatchFlowBusy()
 *
 * 第一次匹配成功后在 finally 里清标志时，读到的 libraryBusy 正是由那个还没清掉的
 * 标志推出来的 → 永远清不掉 → 第二次右键被 `if (isMatchFlowBusy()) return` 静默吞掉。
 *
 * 这里不挂载组件（项目无 @vue/test-utils），改为直接校验接线：
 * 传给 SongList 的标志必须排除 manualMatchUiBusy。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// vitest 的 cwd 是项目根
const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const LOCAL_LIST = 'src/renderer/components/music/LocalMusicList.vue'

/** 取出某个 const xxx = computed(() => ...) 的完整表达式 */
const computedBody = (src: string, name: string): string => {
  const m = src.match(new RegExp(`const ${name} = computed\\(([\\s\\S]*?)\\n\\)`))
  if (!m) throw new Error(`未找到 computed: ${name}`)
  return m[1]
}

describe('本地音乐页 busy 标志接线', () => {
  const src = readSrc(LOCAL_LIST)

  it('传给 SongList 的是 isExternalLibraryBusy（而非含 manualMatchUiBusy 的 isLibraryBusy）', () => {
    expect(src).toMatch(/:library-busy="isExternalLibraryBusy"/)
    expect(src).not.toMatch(/:library-busy="isLibraryBusy"/)
  })

  it('isExternalLibraryBusy 不得包含 manualMatchUiBusy（否则与 SongList 形成自引用环）', () => {
    const body = computedBody(src, 'isExternalLibraryBusy')
    expect(body).not.toContain('manualMatchUiBusy')
    // 仍须覆盖批量匹配 / 扫描 / 清理这三种「库外部忙碌」
    expect(body).toContain('isMatchingLyrics')
    expect(body).toContain('isMatchingCovers')
    expect(body).toContain('isScanning')
    expect(body).toContain('isCleaningMissing')
  })

  it('isLibraryBusy 仍包含 manualMatchUiBusy（工具栏禁用需要它）', () => {
    const body = computedBody(src, 'isLibraryBusy')
    expect(body).toContain('isMatchingBusy')
    expect(body).toContain('isScanning')
  })

  it('isMatchingBusy 仍包含 manualMatchUiBusy（供 toolbar 提示文案）', () => {
    const body = computedBody(src, 'isMatchingBusy')
    expect(body).toContain('manualMatchUiBusy')
  })
})
