/**
 * 按文件头魔数识别真实音频格式（扩展名不可信时：FLAC/Ogg 却叫 .mp3）
 */
import { openSync, readSync, closeSync, statSync } from 'fs'

export interface AudioSniffResult {
  /** MIME，如 audio/flac */
  mime: string
  /** 不含点的扩展名提示，如 flac */
  ext: string
  /** 跳过伪 ID3 后的数据偏移；真 MP3 的合法 ID3 为 0 */
  dataOffset: number
}

/** ID3v2 头总长度（含 10 字节头；若有 footer 再加 10）；非 ID3 返回 null */
export function getId3v2PrefixLength(header: Buffer): number | null {
  if (header.length < 10) return null
  if (header[0] !== 0x49 || header[1] !== 0x44 || header[2] !== 0x33) return null
  const size =
    ((header[6] & 0x7f) << 21) |
    ((header[7] & 0x7f) << 14) |
    ((header[8] & 0x7f) << 7) |
    (header[9] & 0x7f)
  let total = 10 + size
  if (header[5] & 0x10) total += 10
  return total
}

/** ASF/WMA 文件头 GUID 前 8 字节 */
const ASF_HEADER = Buffer.from([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])

/** 根据魔数识别音频 MIME；无法识别返回 null */
export function sniffAudioMime(magic: Buffer): string | null {
  if (magic.length < 4) return null
  if (magic[0] === 0x66 && magic[1] === 0x4c && magic[2] === 0x61 && magic[3] === 0x43) {
    return 'audio/flac'
  }
  if (magic[0] === 0x4f && magic[1] === 0x67 && magic[2] === 0x67 && magic[3] === 0x53) {
    return 'audio/ogg'
  }
  // Monkey's Audio：'MAC '
  if (
    magic[0] === 0x4d &&
    magic[1] === 0x41 &&
    magic[2] === 0x43 &&
    magic[3] === 0x20
  ) {
    return 'audio/ape'
  }
  if (
    magic.length >= 12 &&
    magic[0] === 0x52 &&
    magic[1] === 0x49 &&
    magic[2] === 0x46 &&
    magic[3] === 0x46 &&
    magic[8] === 0x57 &&
    magic[9] === 0x41 &&
    magic[10] === 0x56 &&
    magic[11] === 0x45
  ) {
    return 'audio/wav'
  }
  if (
    magic.length >= 8 &&
    magic[4] === 0x66 &&
    magic[5] === 0x74 &&
    magic[6] === 0x79 &&
    magic[7] === 0x70
  ) {
    return 'audio/mp4'
  }
  // WMA / ASF
  if (magic.length >= 8 && magic.subarray(0, 8).equals(ASF_HEADER)) {
    return 'audio/x-ms-wma'
  }
  if (magic[0] === 0xff && (magic[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg'
  }
  return null
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ape': 'ape',
  'audio/x-ms-wma': 'wma'
}

/** Chromium 可直接播的容器（假扩展名时靠 Content-Type 纠正即可） */
export const TRUSTED_STREAM_CONTAINERS = new Set([
  'audio/flac',
  'audio/ogg',
  'audio/wav',
  'audio/mp4'
])

/**
 * 读取文件头嗅探真实音频类型。
 * 非 MP3 却挂了 ID3 时返回 dataOffset 指向真实流起点。
 */
export function sniffLocalAudio(filePath: string, size?: number): AudioSniffResult | null {
  const fileSize = size ?? statSync(filePath).size
  if (fileSize < 4) return null

  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const head = Buffer.alloc(16)
    const n = readSync(fd, head, 0, 16, 0)
    if (n < 4) return null

    let prefixLen = 0
    let magic = head.subarray(0, Math.min(n, 16))
    const id3Len = getId3v2PrefixLength(head)
    if (id3Len != null && id3Len > 0 && id3Len < fileSize) {
      const afterId3 = Buffer.alloc(16)
      const m = readSync(fd, afterId3, 0, 16, id3Len)
      if (m >= 4) {
        prefixLen = id3Len
        magic = afterId3.subarray(0, m)
      }
    }

    const mime = sniffAudioMime(magic)
    if (!mime) return null
    const ext = MIME_TO_EXT[mime] || 'bin'
    // 真 MP3（含合法 ID3）从文件头开始；伪 ID3 + FLAC/Ogg 等跳过前缀
    const dataOffset = prefixLen > 0 && mime !== 'audio/mpeg' ? prefixLen : 0
    return { mime, ext, dataOffset }
  } catch {
    return null
  } finally {
    if (fd != null) {
      try {
        closeSync(fd)
      } catch {
        /* ignore */
      }
    }
  }
}
