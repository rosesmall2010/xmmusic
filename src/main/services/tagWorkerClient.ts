/**
 * 标签重活 worker 的主进程侧客户端
 *
 * 懒启动一个长驻 worker，把 updateMetadata / extractCover 转发过去。
 * 职责：
 * - 复用同一个 worker，避免每次调用都付启动成本
 * - worker 崩溃时把在途请求回退到主线程执行，并在下次调用时重建
 * - 应用退出时 terminate
 */
import { Worker } from 'worker_threads'
import { join } from 'path'
import type { TagMetadataUpdate, TagWorkerRequest, TagWorkerResponse } from '../../shared/types/tagWorker'
import { updateMetadataSync, extractCoverSync } from './tagOps'

type Pending = {
  resolve: () => void
  reject: (e: Error) => void
}

/** worker 编译产物路径：src/main/workers/tagWorker.ts → dist/electron/main/workers/tagWorker.js */
const WORKER_PATH = join(__dirname, '..', 'workers', 'tagWorker.js')

class TagWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  /** worker 启动失败后不再重试，全程退回主线程同步执行 */
  private disabled = false
  /** 串行队列，保证与 worker 内部串行语义一致 */
  private chain: Promise<void> = Promise.resolve()

  private getWorker(): Worker | null {
    if (this.disabled) return null
    if (this.worker) return this.worker

    try {
      const worker = new Worker(WORKER_PATH)
      worker.on('message', (res: TagWorkerResponse) => {
        // 陈旧 worker 的消息不再属于当前实例
        if (this.worker === worker) this.onMessage(res)
      })
      worker.on('error', (err) => this.onWorkerFailure(err, worker))
      worker.on('exit', (code) => {
        if (code !== 0) this.onWorkerFailure(new Error(`标签 worker 退出，代码 ${code}`), worker)
      })
      this.worker = worker
      return worker
    } catch (error) {
      console.error('标签 worker 启动失败，退回主线程执行:', error)
      this.disabled = true
      return null
    }
  }

  /**
   * worker 挂了：把在途请求全部回退到主线程执行，并允许下次重建
   * source 用于忽略陈旧 worker 的迟到事件，避免把刚重建好的 worker 又清掉
   */
  private onWorkerFailure(err: Error, source?: Worker) {
    if (source && this.worker && this.worker !== source) return
    console.error('标签 worker 异常，退回主线程执行:', err)
    const failed = Array.from(this.pending.values())
    this.pending.clear()
    this.worker = null
    for (const p of failed) p.reject(err)
  }

  private onMessage(res: TagWorkerResponse) {
    const p = this.pending.get(res.id)
    if (!p) return
    this.pending.delete(res.id)
    if (res.ok) p.resolve()
    else p.reject(new Error(res.error))
  }

  /** 发一条请求，失败或 worker 不可用时用 fallback 在主线程执行 */
  private run(req: Omit<TagWorkerRequest, 'id'>, fallback: () => void): Promise<void> {
    const task = this.chain.then(async () => {
      const worker = this.getWorker()
      if (!worker) {
        fallback()
        return
      }
      const id = this.nextId++
      try {
        await new Promise<void>((resolve, reject) => {
          this.pending.set(id, { resolve, reject })
          worker.postMessage({ ...req, id } as TagWorkerRequest)
        })
      } catch {
        // worker 挂了：主线程兜底，保证功能不中断
        fallback()
      }
    })
    // 队列本身不能被单次失败打断
    this.chain = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  updateMetadata(filePath: string, updates: TagMetadataUpdate): Promise<void> {
    return this.run({ kind: 'updateMetadata', filePath, updates }, () =>
      updateMetadataSync(filePath, updates)
    )
  }

  extractCover(filePath: string, outputPath: string): Promise<void> {
    return this.run({ kind: 'extractCover', filePath, outputPath }, () =>
      extractCoverSync(filePath, outputPath)
    )
  }

  /** 应用退出时调用 */
  terminate() {
    if (!this.worker) return
    const worker = this.worker
    this.worker = null
    this.onWorkerFailure(new Error('标签 worker 已终止'))
    void worker.terminate()
  }
}

const tagWorkerClient = new TagWorkerClient()

export default tagWorkerClient
