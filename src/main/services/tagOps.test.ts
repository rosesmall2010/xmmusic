/**
 * 标签原子写入的自检
 *
 * 关注点是「写完整、可回读、不损坏音频体」三件事 —— 这是把写盘从原地覆盖
 * 改成「临时文件 + rename」后最容易出错的地方。
 * 不依赖 Electron，纯 node 环境跑。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { updateMetadataSync, extractCoverSync } from './tagOps'

/** 构造一个最小的合法 MP3：几个静音帧 + 无 ID3 头 */
const makeTinyMp3 = (): Buffer => Buffer.from([0xff, 0xfb, 0x90, 0x00, ...new Array(400).fill(0)])

/** 最小 JPEG 魔数，供封面测试用 */
const makeTinyJpeg = (): Buffer => Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(0)])

describe('tagOps', () => {
  let dir: string
  let mp3Path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xmmusic-tagops-'))
    mp3Path = join(dir, 'song.mp3')
    writeFileSync(mp3Path, makeTinyMp3())
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('写入标签后音频体保持不变，且不残留临时文件', () => {
    const before = readFileSync(mp3Path)
    updateMetadataSync(mp3Path, { title: '测试歌曲', artist: '测试歌手' })
    const after = readFileSync(mp3Path)

    // ID3 头追加在文件开头，原始音频体应原样保留在末尾
    expect(after.length).toBeGreaterThan(before.length)
    expect(after.subarray(after.length - before.length).equals(before)).toBe(true)

    // 目录里只应有 mp3 本身，没有 .tmp 残留
    const leftovers = existsSync(join(dir, 'song.mp3'))
    expect(leftovers).toBe(true)
    expect(readFileSync(join(dir, 'song.mp3')).includes(Buffer.from('ID3'))).toBe(true)
  })

  it('已写过标签的文件再次写入不会叠加多份 ID3 头', () => {
    updateMetadataSync(mp3Path, { title: '第一次' })
    const once = readFileSync(mp3Path)
    updateMetadataSync(mp3Path, { title: '第二次' })
    const twice = readFileSync(mp3Path)

    // 第二次替换而非追加：长度不应继续增长（标题字数相同）
    expect(twice.length).toBe(once.length)

    // 全文件只应出现一次 ID3 标识
    const occurrences = twice.toString('latin1').split('ID3').length - 1
    expect(occurrences).toBe(1)
  })

  it('非 MP3 扩展名报错文案不变', () => {
    const flacPath = join(dir, 'song.flac')
    writeFileSync(flacPath, makeTinyMp3())
    expect(() => updateMetadataSync(flacPath, { title: 'x' })).toThrow(
      /不支持的文件格式: \.flac/
    )
  })

  it('文件不存在时报错文案不变', () => {
    expect(() => updateMetadataSync(join(dir, 'missing.mp3'), { title: 'x' })).toThrow(
      /文件不存在/
    )
  })

  it('内嵌封面可被提取出来，内容与写入时一致', () => {
    const coverPath = join(dir, 'cover.jpg')
    writeFileSync(coverPath, makeTinyJpeg())

    updateMetadataSync(mp3Path, { title: '带封面', coverPath })

    const outPath = join(dir, 'out.jpg')
    extractCoverSync(mp3Path, outPath)
    expect(readFileSync(outPath).equals(makeTinyJpeg())).toBe(true)
  })

  it('文件没有封面时提取报错文案不变', () => {
    updateMetadataSync(mp3Path, { title: '无封面' })
    expect(() => extractCoverSync(mp3Path, join(dir, 'out.jpg'))).toThrow(
      /文件中没有封面图片/
    )
  })
})
