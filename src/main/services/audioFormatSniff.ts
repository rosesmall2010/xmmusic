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

/** ID3 后向前扫描窗口：跳过 padding / 垃圾字节找真实流 */
const POST_ID3_SCAN_BYTES = 8192

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

/**
 * 校验疑似 MPEG 帧头，降低随机 0xFF 误判。
 * 参考 ISO 11172-3 / 13818-3：layer≠00、bitrate≠1111、sampling≠11
 */
export function isLikelyMpegFrameHeader(b0: number, b1: number, b2: number): boolean {
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false
  const layer = (b1 >> 1) & 0x3
  if (layer === 0) return false
  const bitrate = (b2 >> 4) & 0xf
  if (bitrate === 0xf) return false
  const sampling = (b2 >> 2) & 0x3
  if (sampling === 0x3) return false
  return true
}

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
  if (magic.length >= 3 && isLikelyMpegFrameHeader(magic[0], magic[1], magic[2])) {
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

/** 扫描入库时，无魔数也仍应对这些扩展名回退 music-metadata（对齐 1.2.4，避免误标损坏） */
export const SCAN_FALLBACK_EXTENSIONS = new Set([
  'mp3',
  'mp2',
  'mpga',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'wav',
  'wma',
  'ape'
])

/**
 * 在窗口内找可信音频魔数。
 * 策略：起点 → 跳过 0x00 padding 再认 → 仅对强容器魔数有限扫描；
 * 不在整窗盲扫 0xFF（APIC 等二进制里极易误判 MPEG）。
 */
function findMimeInWindow(buf: Buffer): { mime: string; offset: number } | null {
  if (buf.length < 4) return null

  const at0 = sniffAudioMime(buf.subarray(0, Math.min(16, buf.length)))
  if (at0) return { mime: at0, offset: 0 }

  // ID3 后常见 padding：连续 0x00，跳过后再认（含 MPEG 帧头）
  let pad = 0
  while (pad < buf.length && buf[pad] === 0x00) pad++
  if (pad > 0 && pad <= buf.length - 4) {
    const afterPad = sniffAudioMime(buf.subarray(pad, Math.min(pad + 16, buf.length)))
    if (afterPad) return { mime: afterPad, offset: pad }
  }

  // 强容器：全文窗扫描，但带附加校验，降低撞进封面二进制的概率
  const start = pad > 0 ? pad : 1
  for (let i = start; i <= buf.length - 4; i++) {
    const b0 = buf[i]
    if (b0 === 0x66) {
      // fLaC
      if (
        buf[i + 1] === 0x4c &&
        buf[i + 2] === 0x61 &&
        buf[i + 3] === 0x43 &&
        i + 4 < buf.length
      ) {
        // 下一字节为 METADATA_BLOCK header：最高位 last-block，低 7 位类型 0–6 常见
        const blockType = buf[i + 4] & 0x7f
        if (blockType <= 6) {
          return { mime: 'audio/flac', offset: i }
        }
      }
      // MP4 ftyp 在 i-4
      if (i >= 4) {
        const at = sniffAudioMime(buf.subarray(i - 4, Math.min(i - 4 + 16, buf.length)))
        if (at === 'audio/mp4') return { mime: at, offset: i - 4 }
      }
      continue
    }
    if (b0 === 0x4f) {
      // OggS + version==0
      if (
        buf[i + 1] === 0x67 &&
        buf[i + 2] === 0x67 &&
        buf[i + 3] === 0x53 &&
        i + 4 < buf.length &&
        buf[i + 4] === 0x00
      ) {
        return { mime: 'audio/ogg', offset: i }
      }
      continue
    }
    if (b0 === 0x52 && i + 12 <= buf.length) {
      const at = sniffAudioMime(buf.subarray(i, Math.min(i + 16, buf.length)))
      if (at === 'audio/wav') return { mime: at, offset: i }
      continue
    }
    if (b0 === 0x4d) {
      const at = sniffAudioMime(buf.subarray(i, Math.min(i + 16, buf.length)))
      if (at === 'audio/ape') return { mime: at, offset: i }
      continue
    }
    if (b0 === 0x30 && i + 8 <= buf.length) {
      const at = sniffAudioMime(buf.subarray(i, Math.min(i + 16, buf.length)))
      if (at === 'audio/x-ms-wma') return { mime: at, offset: i }
    }
  }

  return null
}

/**
 * 读取文件头嗅探真实音频类型。
 * 非 MP3 却挂了 ID3 时返回 dataOffset 指向真实流起点。
 * ID3 后若有 padding，向前扫描再认魔数（避免误判「无魔数→损坏」）。
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

    const id3Len = getId3v2PrefixLength(head)
    let searchFrom = 0
    let id3Prefix = 0
    if (id3Len != null && id3Len > 0 && id3Len < fileSize) {
      searchFrom = id3Len
      id3Prefix = id3Len
    }

    // 从 0 或 ID3 结束后起扫一段窗口（多数文件起点即命中，几乎不额外读）
    const windowLen = Math.min(POST_ID3_SCAN_BYTES, fileSize - searchFrom)
    if (windowLen < 4) return null

    const window = Buffer.alloc(windowLen)
    const m = readSync(fd, window, 0, windowLen, searchFrom)
    if (m < 4) return null

    const found = findMimeInWindow(window.subarray(0, m))
    if (!found) return null

    const mime = found.mime
    const ext = MIME_TO_EXT[mime] || 'bin'
    const absoluteOffset = searchFrom + found.offset
    // 真 MP3（含合法 ID3）从文件头开始喂解码器；伪 ID3 + FLAC/Ogg 等跳到真实流
    const dataOffset =
      id3Prefix > 0 && mime !== 'audio/mpeg' ? absoluteOffset : 0
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
