/**
 * 把批量匹配结果合并进内存里的歌曲列表
 *
 * 批量匹配（歌词 / 封面）结束后不再整表重拉，改为按 musicId 原位更新有变化的字段。
 * 结果对象里已经带了每首成功曲的路径，等价于「成功才更新，失败不动」：
 *
 * - `matched` / `linked_local` 带新路径 → 更新
 * - `failed` / `skipped_low_similarity` / `skipped_instrumental` / `skipped_cancelled`
 *   不带路径 → 自然被排除，内存保持原样
 * - `skipped_has_lyrics` / `skipped_has_cover` 带的是**原有**路径 → 靠值相等判断成为 no-op
 */
import type { MusicItem } from '@shared/types/music'

/** 与合并相关的字段；歌词与封面两种匹配结果都满足 */
export interface MatchPathResult {
  musicId: number
  lyricsPath?: string
  coverPath?: string
}

/**
 * @returns 变更后的新数组；没有任何变化时返回 null（调用方据此跳过赋值，避免无谓重渲染）
 */
export function mergeMatchPaths(
  list: MusicItem[],
  results: MatchPathResult[] | undefined
): MusicItem[] | null {
  if (!results?.length || list.length === 0) return null

  // 只收集带路径（即成功）的结果
  const patchById = new Map<number, { lyricsPath?: string; coverPath?: string }>()
  for (const r of results) {
    if (!r.lyricsPath && !r.coverPath) continue
    patchById.set(r.musicId, {
      ...(r.lyricsPath ? { lyricsPath: r.lyricsPath } : {}),
      ...(r.coverPath ? { coverPath: r.coverPath } : {})
    })
  }
  if (patchById.size === 0) return null

  let changed = false
  const next = list.map((m) => {
    const patch = patchById.get(m.id)
    if (!patch) return m
    // 值没变就不复制对象，避免无谓的列表重渲染
    if (
      (patch.lyricsPath === undefined || patch.lyricsPath === m.lyricsPath) &&
      (patch.coverPath === undefined || patch.coverPath === m.coverPath)
    ) {
      return m
    }
    changed = true
    return { ...m, ...patch }
  })

  return changed ? next : null
}
