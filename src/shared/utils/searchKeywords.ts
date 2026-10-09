/**
 * 顶栏搜索关键字解析：按空白、英文逗号、中文逗号拆分，去空、去重（保留首次出现的写法）
 * 去重只忽略 ASCII 大小写，与 SQLite LIKE 的大小写规则一致
 */
export function parseSearchKeywords(query: string): string[] {
  const seen = new Set<string>()
  const keywords: string[] = []
  for (const part of (query || '').split(/[\s,，]+/)) {
    const kw = part.trim()
    if (!kw) continue
    const key = kw.replace(/[A-Z]/g, (c) => c.toLowerCase())
    if (seen.has(key)) continue
    seen.add(key)
    keywords.push(kw)
  }
  return keywords
}
