/**
 * 标签重活 worker 的消息协议
 * 主进程与 worker 之间的结构化克隆载荷，注意 Error 对象不可克隆，只传 message
 */

/** 标签写入内容（与 metadataEditor.MetadataUpdate 结构一致，独立一份避免共享层反向依赖 main） */
export interface TagMetadataUpdate {
  title?: string
  artist?: string
  album?: string
  year?: number
  genre?: string
  coverPath?: string | null
}

export type TagWorkerRequestKind = 'updateMetadata' | 'extractCover'

export interface TagWorkerRequest {
  id: number
  kind: TagWorkerRequestKind
  filePath: string
  /** updateMetadata 用 */
  updates?: TagMetadataUpdate
  /** extractCover 用 */
  outputPath?: string
}

export type TagWorkerResponse =
  | { id: number; ok: true }
  | { id: number; ok: false; error: string }
