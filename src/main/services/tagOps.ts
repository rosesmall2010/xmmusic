/**
 * ID3 标签的底层读写实现
 *
 * 被两处共用，保证行为完全一致：
 * - `workers/tagWorker.ts`（正常路径，跑在 worker 线程，不阻塞主进程）
 * - `services/metadataEditor.ts` 的兜底路径（worker 启动失败时退回主线程同步执行）
 *
 * 关键点：写盘一律走「读整文件 → 在内存里改标签 → 同目录临时文件 → rename 原子替换」，
 * 而不是 node-id3 的 `write(tags, filePath)`（原地覆盖）。这样进程在任何时刻被打断，
 * 磁盘上要么是旧文件、要么是新文件，绝不会出现写坏一半的 MP3。
 */
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, statSync } from 'fs'
import { extname, dirname, join, basename } from 'path'
import { randomUUID } from 'crypto'
import type { TagMetadataUpdate } from '../../shared/types/tagWorker'

/** 动态加载 node-id3（与原实现一致，失败时给出统一文案） */
const getNodeID3 = () => {
  try {
    return require('node-id3')
  } catch (error) {
    throw new Error('无法加载 node-id3 库')
  }
}

const assertMp3 = (filePath: string) => {
  const ext = extname(filePath).toLowerCase()
  // 只支持 MP3 格式
  if (ext !== '.mp3') {
    throw new Error(`不支持的文件格式: ${ext}，目前只支持 MP3 格式`)
  }
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }
}

/** 由封面文件扩展名推断 MIME（与原实现一致） */
const mimeForCover = (coverPath: string): string => {
  const ext = extname(coverPath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * 更新音乐文件的 ID3 标签（同步实现，调用方负责放到 worker 线程或主线程兜底）
 * 抛错文案保持与原 metadataEditor.updateMetadata 一致
 */
export function updateMetadataSync(filePath: string, updates: TagMetadataUpdate): void {
  assertMp3(filePath)

  try {
    const nodeID3 = getNodeID3()

    // 读取现有标签
    const existingTags = nodeID3.read(filePath) || {}

    // 构建新的标签对象
    const tags: any = {
      ...existingTags,
      title: updates.title !== undefined ? updates.title : existingTags.title,
      artist: updates.artist !== undefined ? updates.artist : existingTags.artist,
      album: updates.album !== undefined ? updates.album : existingTags.album,
      year: updates.year !== undefined ? String(updates.year) : existingTags.year,
      genre: updates.genre !== undefined ? updates.genre : existingTags.genre
    }

    // 处理封面图片
    if (updates.coverPath !== undefined) {
      if (updates.coverPath && existsSync(updates.coverPath)) {
        tags.image = {
          mime: mimeForCover(updates.coverPath),
          type: {
            id: 3, // Front cover
            name: 'Cover (front)'
          },
          description: 'Cover',
          imageBuffer: readFileSync(updates.coverPath)
        }
      } else {
        // 删除封面
        tags.image = undefined
      }
    }

    writeTagsAtomically(nodeID3, filePath, tags)
  } catch (error: any) {
    throw new Error(`更新元数据失败: ${error.message}`)
  }
}

/**
 * 用 node-id3 在内存中改标签，再原子替换原文件
 *
 * 这里刻意复刻 node-id3 内部 `writeSync` 的两步：
 *   removeTagsFromBuffer(原文件) → Buffer.concat([create(tags), 去标签后的音频])
 * 只是把最后的 `writeFileSync(filePath)` 换成「写临时文件 + rename」。
 * 因此产物与原来的 `nodeID3.write(tags, filePath)` **逐字节相同**，行为完全一致，
 * 但进程在任何时刻被打断都不会留下写坏一半的 MP3。
 */
function writeTagsAtomically(nodeID3: any, filePath: string, tags: any): void {
  const original = readFileSync(filePath)

  // 与 node-id3 的 writeInBuffer 一致：去不掉旧标签（返回 false）就保留原 buffer
  const stripped = nodeID3.removeTagsFromBuffer(original)
  const audioBody = stripped || original
  const updated = Buffer.concat([nodeID3.create(tags), audioBody])

  const mode = statSync(filePath).mode
  const tmpPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`)

  try {
    writeFileSync(tmpPath, updated, { mode })
    // Windows 不支持 rename 覆盖已存在的目标文件（macOS/Linux 的 rename(2) 是原子覆盖，Windows 不是）。
    // 先乐观尝试 rename；若报 EPERM/EEXIST（Windows 的覆盖限制），则删原文件再 rename。
    // 删与 rename 之间有极窄时间窗，但比让用户看到 EPERM 报错好得多。
    try {
      renameSync(tmpPath, filePath)
    } catch (renameErr: any) {
      if (renameErr.code === 'EPERM' || renameErr.code === 'EEXIST') {
        unlinkSync(filePath)
        renameSync(tmpPath, filePath)
      } else {
        throw renameErr
      }
    }
  } catch (error) {
    // 失败时清掉临时文件，别在用户音乐目录里留垃圾
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw error
  }
}

/**
 * 从文件读取内嵌封面并写到指定位置
 * 抛错文案保持与原 metadataEditor.extractCover 一致
 */
export function extractCoverSync(filePath: string, outputPath: string): void {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.mp3') {
    throw new Error(`不支持的文件格式: ${ext}`)
  }

  try {
    const nodeID3 = getNodeID3()
    const tags = nodeID3.read(filePath)

    if (!tags || !tags.image) {
      throw new Error('文件中没有封面图片')
    }

    const imageBuffer = tags.image.imageBuffer
    if (!imageBuffer) {
      throw new Error('无法读取封面图片数据')
    }

    writeFileSync(outputPath, imageBuffer)
  } catch (error: any) {
    throw new Error(`提取封面失败: ${error.message}`)
  }
}
