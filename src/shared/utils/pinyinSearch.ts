import { pinyin } from 'pinyin-pro'

/** 搜索查询分流：纯字母走拼音旁路，含汉字走 FTS，混合两者都用 */
export type SearchQueryMode = 'fts' | 'pinyin' | 'mixed'

/** 判断查询应走哪条搜索路径 */
export function classifySearchQuery(query: string): SearchQueryMode {
  const q = query.trim()
  if (!q) return 'mixed'
  const hasHan = /[\u4e00-\u9fff]/.test(q)
  const isAsciiLetters = /^[a-zA-Z]+$/.test(q)
  if (isAsciiLetters) return 'pinyin'
  if (hasHan) return 'fts'
  return 'mixed'
}

/** 转义 FTS5 MATCH 特殊字符，避免语法错误 */
export function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .replace(/["'*()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 文本转全拼（无声调、小写、无分隔） */
export function toFullPinyin(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  try {
    return pinyin(raw, { toneType: 'none', type: 'array' }).join('').toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

/** 文本转声母串（小写） */
export function toInitials(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  try {
    return pinyin(raw, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

/** 为 DB 预计算列生成全拼与声母（字段用 | 拼接便于子串匹配） */
export function buildSearchPinyinFields(
  title: string,
  artist: string,
  album: string | null | undefined,
  fileName: string
): { searchPinyin: string; searchInitials: string } {
  const parts = [title, artist, album || '', fileName].map((s) => (s || '').trim()).filter(Boolean)
  const searchPinyin = parts.map(toFullPinyin).filter(Boolean).join('|')
  const searchInitials = parts.map(toInitials).filter(Boolean).join('|')
  return { searchPinyin, searchInitials }
}
