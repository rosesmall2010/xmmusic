/**
 * 标签重活 worker 入口
 *
 * 跑在独立线程里，独占所有「读整首 MP3 + 重写」的同步 IO 与 node-id3 计算，
 * 让主进程只负责调度，批量匹配时界面不再假死。
 *
 * 请求串行处理（一个队列），语义与原先 coverMatchService 的 enqueueHeavySync 等价，
 * 但不再占用主线程 —— 这正是「取消可以立即回执」的前提。
 */
import { parentPort } from 'worker_threads'
import type { TagWorkerRequest, TagWorkerResponse } from '../../shared/types/tagWorker'
import { updateMetadataSync, extractCoverSync } from '../services/tagOps'

if (!parentPort) {
  throw new Error('tagWorker 必须在 worker 线程中运行')
}

const port = parentPort

/** 串行队列：保证同一时刻只有一个文件在被读写 */
let chain: Promise<void> = Promise.resolve()

const handle = async (req: TagWorkerRequest): Promise<void> => {
  switch (req.kind) {
    case 'updateMetadata':
      updateMetadataSync(req.filePath, req.updates || {})
      return
    case 'extractCover':
      if (!req.outputPath) throw new Error('缺少输出路径')
      extractCoverSync(req.filePath, req.outputPath)
      return
  }
}

port.on('message', (req: TagWorkerRequest) => {
  chain = chain.then(async () => {
    let res: TagWorkerResponse
    try {
      await handle(req)
      res = { id: req.id, ok: true }
    } catch (error: any) {
      // Error 对象不可结构化克隆，只回传 message
      res = { id: req.id, ok: false, error: error?.message || String(error) }
    }
    port.postMessage(res)
  })
})
