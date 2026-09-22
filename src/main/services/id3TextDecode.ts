/**
 * ID3 文本编码自动识别（移植自 xmtools/mp3info.ts，并补齐 UTF-8/GBK 碰撞择优）
 *
 * 策略：同时评估 UTF-8 / GB18030 / Latin1 原样 / Latin1 乱码还原 / Big5 乱码还原，
 * 按评分择优，避免「合法但错误」的 UTF-8（如 GBK「薛之谦」→「Ѧ֮ǫ」）被误采纳。
 */

/** 控制字符、私有区、替换符——出现即说明解码结果不可信 */
const RE_BAD_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uE000-\uF8FF\uFFFD]/
const RE_CJK = /[\u3400-\u9FFF\uAC00-\uD7AF]/
/** 常用汉字区（评分用，比宽 CJK 更能代表中文标签） */
const RE_CJK_COMMON = /[\u4e00-\u9fff]/g
/** Big5→GBK 常见副作用：注音、兼容区、PUA、假名 */
const RE_BIG5_SUSPECT =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-�︰-﹏ㄅ-ㄯ豈-﫿\u3040-\u30FF]/
/** UTF-8 误解 GBK 时常见的西里尔字母 */
const RE_CYRILLIC = /[\u0400-\u04FF]/g
const RE_COMBINING = /[\u0300-\u036F]/g
const RE_KANA = /[\u3040-\u30FF]/g
const RE_FFFD = /\uFFFD/g

const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const gb18030 = new TextDecoder('gb18030')
const big5Decoder = new TextDecoder('big5')

/**
 * 解码结果评分：越高越好。用于 UTF-8/GBK 碰撞与 Big5 还原择优。
 */
export function scoreDecodedText(text: string): number {
  if (!text) return 0
  let score = 0
  if (RE_BAD_TEXT.test(text)) score -= 100
  score += (text.match(RE_CJK_COMMON) || []).length * 4
  score -= (text.match(RE_CYRILLIC) || []).length * 6
  score -= (text.match(RE_COMBINING) || []).length * 4
  score -= (text.match(RE_KANA) || []).length * 2
  score -= (text.match(RE_FFFD) || []).length * 20
  // 可打印 ASCII 轻微加分（英文标签 / Café 等）
  const ascii = (text.match(/[\x20-\x7E]/g) || []).length
  score += Math.min(ascii, 8) * 0.15
  // Latin-1 西欧字母轻微加分（无 CJK 意图时保留 Café/Björk）
  if (!(text.match(RE_CJK_COMMON) || []).length) {
    const latin1 = (text.match(/[\u00C0-\u024F]/g) || []).length
    score += latin1 * 0.5
  }
  return score
}

/**
 * 把「GBK 字节被当成 ISO-8859-1 解码」的乱码还原回原文。
 */
export function repairLatin1Mojibake(text: string): string {
  if (!text) return text
  let high = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) as number
    if (c > 0xff) return text
    if (c >= 0x80) high++
  }
  if (high / text.length < 0.5) return text
  const raw = Buffer.from([...text].map((c) => c.codePointAt(0) as number))
  const fixed = gb18030.decode(raw)
  if (RE_BAD_TEXT.test(fixed) || !RE_CJK.test(fixed)) return text
  return scoreDecodedText(fixed) > scoreDecodedText(text) ? fixed : text
}

/** Big5 反查表：字符 → 原始 Big5 字节对（懒加载） */
let big5Reverse: Map<string, number> | null = null

function getBig5Reverse(): Map<string, number> {
  if (big5Reverse) return big5Reverse
  big5Reverse = new Map<string, number>()
  for (let lead = 0xa1; lead <= 0xf9; lead++) {
    for (let trail = 0x40; trail <= 0xfe; trail++) {
      if (trail > 0x7e && trail < 0xa1) continue
      const ch = gb18030.decode(Buffer.from([lead, trail]))
      if ([...ch].length !== 1) continue
      big5Reverse.set(ch, big5Reverse.has(ch) ? -1 : (lead << 8) | trail)
    }
  }
  for (const [k, v] of big5Reverse) {
    if (v === -1) big5Reverse.delete(k)
  }
  return big5Reverse
}

/**
 * 把「Big5 字节被当 GBK 解码」的乱码还原回繁体原文。
 * ASCII 透传以支持「歌手 feat. xxx」混排；仅当评分提升时采纳。
 */
export function repairBig5Mojibake(text: string): string {
  if (!text) return text
  const rev = getBig5Reverse()
  const bytes: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number
    // Big5 中 ASCII 为单字节
    if (cp >= 0x20 && cp <= 0x7e) {
      bytes.push(cp)
      continue
    }
    const b = rev.get(ch)
    if (b === undefined) return text
    bytes.push(b >> 8, b & 0xff)
  }
  const fixed = big5Decoder.decode(Buffer.from(bytes))
  if (RE_BAD_TEXT.test(fixed) || !RE_CJK.test(fixed)) return text
  const better = scoreDecodedText(fixed) > scoreDecodedText(text)
  const suspect = RE_BIG5_SUSPECT.test(text)
  // 可疑信号命中且修好有汉字，或评分明显更好时采纳
  if (better || (suspect && scoreDecodedText(fixed) >= scoreDecodedText(text))) {
    return fixed
  }
  return text
}

function pickBest(candidates: Array<{ text: string; enc: string }>): { text: string; enc: string } {
  let best = candidates[0]
  let bestScore = scoreDecodedText(best.text)
  for (let i = 1; i < candidates.length; i++) {
    const s = scoreDecodedText(candidates[i].text)
    if (s > bestScore) {
      best = candidates[i]
      bestScore = s
    }
  }
  return best
}

/**
 * 像西欧人名/标题的 Latin1（Café、Björk）：高位字节占比低，且无 CJK/假名。
 * GBK 中文乱码通常几乎全是高位字节（占比 ≥ 0.5）。
 */
function isLikelyWesternLatin1(text: string): boolean {
  if (!text) return false
  if (RE_CJK.test(text) || RE_KANA.test(text) || /[ㄅ-ㄯ]/.test(text)) return false
  let high = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) as number
    if (c > 0xff) return false
    if (c < 0x20 && c !== 0x09) return false
    if (c >= 0x80) high++
  }
  return high / text.length < 0.5
}

/**
 * 解码一段 ID3 文本字节：多候选择优（UTF-8 / GB18030 / Latin1 / 乱码还原）
 */
export function decodeText(buf: Buffer): { text: string; enc: string } {
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const latin1 = Buffer.from(bytes).toString('latin1')

  // 西欧短标签优先原样，避免被 GBK/Big5 误修成「Caf谷」「Bj鰎k」
  if (isLikelyWesternLatin1(latin1)) {
    return { text: latin1, enc: 'latin1' }
  }

  const candidates: Array<{ text: string; enc: string }> = []

  try {
    candidates.push({ text: strictUtf8.decode(bytes), enc: 'utf8' })
  } catch {
    // 非严格 UTF-8
  }

  const gb = gb18030.decode(bytes)
  candidates.push({ text: gb, enc: 'gbk' })
  candidates.push({ text: latin1, enc: 'latin1' })

  const l1Fixed = repairLatin1Mojibake(latin1)
  if (l1Fixed !== latin1) {
    candidates.push({ text: l1Fixed, enc: 'latin1乱码还原' })
  }

  // Big5 只作用于已有汉字/可疑信号的候选，避免拉丁串被「还原」出汉字
  for (const base of [gb, l1Fixed]) {
    if (!RE_CJK.test(base) && !RE_BIG5_SUSPECT.test(base)) continue
    const b5 = repairBig5Mojibake(base)
    if (b5 !== base) {
      candidates.push({ text: b5, enc: 'big5乱码还原' })
    }
  }

  return pickBest(candidates)
}

/** 按 ID3v2 编码字节解码帧正文（已去掉首字节编码标识） */
export function decodeFrameText(encoding: number, body: Buffer): { text: string; enc: string } {
  // 拷贝后再 swap，避免原地修改共享 Buffer
  if (encoding === 1) {
    let text: string
    if (body.length >= 2 && body[0] === 0xfe && body[1] === 0xff) {
      text = Buffer.from(body.subarray(2)).swap16().toString('utf16le')
    } else if (body.length >= 2 && body[0] === 0xff && body[1] === 0xfe) {
      text = body.subarray(2).toString('utf16le')
    } else {
      text = Buffer.from(body).toString('utf16le')
    }
    return { text, enc: 'utf16' }
  }
  if (encoding === 2) {
    return { text: Buffer.from(body).swap16().toString('utf16le'), enc: 'utf16' }
  }
  if (encoding === 3) {
    return decodeText(body)
  }
  // encoding 0（含历史遗留的 GBK 误标）
  return decodeText(body)
}

function tidy(text: string): string {
  const cleaned = text.replace(/\u0000+$/, '').trim()
  return /^(null|undefined)$/i.test(cleaned) ? '' : cleaned
}

/**
 * 对 node-id3 已读出的字符串做自动识别。
 * - 高码点：先试 Big5 还原，再保留干净 CJK/原文
 * - 低码点：按字节走 decodeText 多候选择优
 */
export function autoDecodeTagString(value: string): { text: string; enc: string } {
  if (!value) return { text: '', enc: 'utf8' }

  const hasHighCodepoint = [...value].some((c) => (c.codePointAt(0) ?? 0) > 0xff)
  if (hasHighCodepoint) {
    const b5 = repairBig5Mojibake(value)
    if (b5 !== value) {
      return { text: b5, enc: 'big5乱码还原' }
    }
    return { text: value, enc: 'utf8' }
  }

  const buf = Buffer.from([...value].map((c) => c.codePointAt(0) as number))
  return decodeText(buf)
}

export interface DecodedId3Tags {
  title: string
  artist: string
  album: string
  year?: string
  genre?: string
  /** 各字段实测编码（便于调试） */
  encodings: {
    title: string
    artist: string
    album: string
    year?: string
    genre?: string
  }
}

/**
 * 对一组已由 node-id3 读出的标签做整包自动识别转码（字段独立择优）。
 */
export function autoDecodeId3Tags(raw: {
  title?: string
  artist?: string
  album?: string
  year?: string
  genre?: string
}): DecodedId3Tags {
  const title = autoDecodeTagString(raw.title || '')
  const artist = autoDecodeTagString(raw.artist || '')
  const album = autoDecodeTagString(raw.album || '')
  const year = raw.year != null && raw.year !== '' ? autoDecodeTagString(raw.year) : undefined
  const genre = raw.genre != null && raw.genre !== '' ? autoDecodeTagString(raw.genre) : undefined

  return {
    title: tidy(title.text),
    artist: tidy(artist.text),
    album: tidy(album.text),
    year: year ? tidy(year.text) || undefined : undefined,
    genre: genre ? tidy(genre.text) || undefined : undefined,
    encodings: {
      title: title.enc,
      artist: artist.enc,
      album: album.enc,
      year: year?.enc,
      genre: genre?.enc
    }
  }
}
