import { shallowRef } from 'vue'

/** 改名后要跟着走的文件字段。不带收藏等界面状态，避免整行覆盖把爱心清掉 */
export interface MusicFilePatch {
  id: number
  fileName?: string
  filePath?: string
  lyricsPath?: string | null
}

const patches = new Map<number, MusicFilePatch>()

/** 有新的文件名补丁时递增，正在显示的列表靠它重新取文件名 */
export const musicFilePatchRevision = shallowRef(0)

const pickFilePatch = (detail: unknown): MusicFilePatch | null => {
  if (!detail || typeof detail !== 'object') return null
  const row = detail as Record<string, unknown>
  if (typeof row.id !== 'number') return null

  const patch: MusicFilePatch = { id: row.id }
  let touched = false
  if (typeof row.fileName === 'string') {
    patch.fileName = row.fileName
    touched = true
  }
  if (typeof row.filePath === 'string') {
    patch.filePath = row.filePath
    touched = true
  }
  if ('lyricsPath' in row) {
    patch.lyricsPath = typeof row.lyricsPath === 'string' ? row.lyricsPath : null
    touched = true
  }
  return touched ? patch : null
}

/** 记住这次改名。同一首歌后面分页拉到的旧文件名会用这份补丁盖回去 */
export function rememberMusicFilePatch(detail: unknown): MusicFilePatch | null {
  const patch = pickFilePatch(detail)
  if (!patch) return null

  const prev = patches.get(patch.id)
  const next: MusicFilePatch = { ...prev, ...patch }
  if (
    prev &&
    prev.fileName === next.fileName &&
    prev.filePath === next.filePath &&
    prev.lyricsPath === next.lyricsPath
  ) {
    return next
  }

  patches.set(patch.id, next)
  musicFilePatchRevision.value += 1
  return next
}

const applyFileFields = <T extends { id: number }>(item: T, patch: MusicFilePatch): T => {
  const next = { ...item } as T & MusicFilePatch
  let changed = false
  if (patch.fileName !== undefined && next.fileName !== patch.fileName) {
    next.fileName = patch.fileName
    changed = true
  }
  if (patch.filePath !== undefined && next.filePath !== patch.filePath) {
    next.filePath = patch.filePath
    changed = true
  }
  if (patch.lyricsPath !== undefined && next.lyricsPath !== patch.lyricsPath) {
    next.lyricsPath = patch.lyricsPath
    changed = true
  }
  return changed ? next : item
}

/** 把已记住的文件名盖到单曲上。没有补丁或字段相同则返回原对象 */
export function overlayMusicFile<T extends { id: number }>(item: T): T {
  const patch = patches.get(item.id)
  if (!patch) return item
  return applyFileFields(item, patch)
}

/** 分页、搜索结果落内存前调用，避免进行中的查询把旧文件名写回来 */
export function overlayMusicList<T extends { id: number }>(list: T[]): T[] {
  if (patches.size === 0) return list
  let changed = false
  const next = list.map((item) => {
    const patched = overlayMusicFile(item)
    if (patched !== item) changed = true
    return patched
  })
  return changed ? next : list
}

/**
 * 按 id 更新列表里每一条相同歌曲（播放队列里同一首可能出现多次）。
 * 同时记住文件名字段，供尚未加载的分页使用。
 */
export function mergeMusicUpdate<T extends { id: number }>(
  list: T[],
  detail: Partial<T> & { id: number }
): T[] | null {
  if (!detail?.id) return null
  rememberMusicFilePatch(detail)
  let hit = false
  const next = list.map((item) => {
    if (item.id !== detail.id) return item
    hit = true
    return { ...item, ...detail }
  })
  return hit ? next : null
}

/** 仅测试使用：清掉进程内补丁 */
export function resetMusicFilePatches(): void {
  patches.clear()
  musicFilePatchRevision.value = 0
}
