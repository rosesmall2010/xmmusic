import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applyRenamePlan, chooseRenamePlan, pathIdentity, resolveLyricsPathAfterRename, type RenamePlan } from './renameById3'

describe('按 ID3 重命名', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xmmusic-rename-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const touch = (name: string) => {
    const p = join(dir, name)
    writeFileSync(p, 'x')
    return p
  }

  const exists = (absPath: string) => existsSync(absPath)

  it('空闲时使用「歌手 - 歌曲名.扩展名」，歌词跟着改', () => {
    const audio = touch('old.mp3')
    const lyric = touch('old.lrc')
    const plan = chooseRenamePlan({
      audioPath: audio,
      stem: '周杰伦 - 晴天',
      lyricPaths: [lyric],
      exists
    })
    applyRenamePlan(plan)

    expect(plan.fileName).toBe('周杰伦 - 晴天.mp3')
    expect(existsSync(join(dir, '周杰伦 - 晴天.mp3'))).toBe(true)
    expect(existsSync(join(dir, '周杰伦 - 晴天.lrc'))).toBe(true)
    expect(existsSync(audio)).toBe(false)
    expect(existsSync(lyric)).toBe(false)
  })

  it('同名文件从 .1 开始递增，当前文件本身不算冲突', () => {
    touch('周杰伦 - 晴天.mp3')
    touch('周杰伦 - 晴天.1.mp3')
    const audio = touch('other.mp3')
    const lyric = touch('other.lrc')
    touch('周杰伦 - 晴天.lrc')

    const plan = chooseRenamePlan({
      audioPath: audio,
      stem: '周杰伦 - 晴天',
      lyricPaths: [lyric],
      exists
    })

    expect(plan.fileName).toBe('周杰伦 - 晴天.2.mp3')
    expect(plan.lyrics[0].to).toBe(join(dir, '周杰伦 - 晴天.2.lrc'))
  })

  it('已经是目标名时不再加序号', () => {
    const audio = touch('周杰伦 - 晴天.mp3')
    const lyric = touch('周杰伦 - 晴天.lrc')
    const plan = chooseRenamePlan({
      audioPath: audio,
      stem: '周杰伦 - 晴天',
      lyricPaths: [lyric],
      exists
    })
    applyRenamePlan(plan)
    expect(pathIdentity(plan.audioTo)).toBe(pathIdentity(audio))
    expect(existsSync(audio)).toBe(true)
    expect(existsSync(lyric)).toBe(true)
  })

  it('每首歌的序号都从 1 重新计，不沿用上一首的数字', () => {
    touch('周杰伦 - 晴天.flac')
    const first = touch('a.flac')
    const second = touch('b.mp3')

    const planA = chooseRenamePlan({
      audioPath: first,
      stem: '周杰伦 - 晴天',
      lyricPaths: [],
      exists
    })
    applyRenamePlan(planA)

    const planB = chooseRenamePlan({
      audioPath: second,
      stem: '陈奕迅 - 十年',
      lyricPaths: [],
      exists
    })
    touch('陈奕迅 - 十年.mp3')
    const planBConflict = chooseRenamePlan({
      audioPath: second,
      stem: '陈奕迅 - 十年',
      lyricPaths: [],
      exists
    })

    expect(planA.fileName).toBe('周杰伦 - 晴天.1.flac')
    expect(planB.fileName).toBe('陈奕迅 - 十年.mp3')
    expect(planBConflict.fileName).toBe('陈奕迅 - 十年.1.mp3')
  })

  it('同目录已有同名 .lrc 时视为重名，从 .1 开始', () => {
    touch('周杰伦 - 晴天.lrc')
    touch('周杰伦 - 晴天.1.lrc')
    const audio = touch('other.mp3')

    const plan = chooseRenamePlan({
      audioPath: audio,
      stem: '周杰伦 - 晴天',
      lyricPaths: [],
      exists
    })

    expect(plan.fileName).toBe('周杰伦 - 晴天.2.mp3')
  })

  it('同名 .lrc 就是这首歌自己的歌词时不另加序号', () => {
    const audio = touch('other.mp3')
    const lyric = touch('周杰伦 - 晴天.lrc')

    const plan = chooseRenamePlan({
      audioPath: audio,
      stem: '周杰伦 - 晴天',
      lyricPaths: [lyric],
      exists
    })

    expect(plan.fileName).toBe('周杰伦 - 晴天.mp3')
    expect(plan.lyrics[0].to).toBe(lyric)
  })
})

describe('重命名后的歌词路径', () => {
  const plan = (lyrics: Array<{ from: string; to: string }>): RenamePlan => ({
    fileName: '新歌.mp3',
    audioFrom: '/music/旧歌.mp3',
    audioTo: '/music/新歌.mp3',
    lyrics
  })

  it('歌词文件没移动时不改库里的路径', () => {
    const same = '/music/旧歌.lrc'
    expect(resolveLyricsPathAfterRename(null, plan([{ from: same, to: same }]), false)).toBeNull()
    expect(resolveLyricsPathAfterRename(same, plan([{ from: same, to: same }]), true)).toBe(same)
  })

  it('歌词被改名后指向新路径；原路径已失效时也指向被改名的 .lrc', () => {
    const from = '/music/旧歌.lrc'
    const to = '/music/新歌.lrc'
    expect(resolveLyricsPathAfterRename(from, plan([{ from, to }]), true)).toBe(to)
    expect(resolveLyricsPathAfterRename('/music/missing.lrc', plan([{ from, to }]), false)).toBe(to)
  })
})
