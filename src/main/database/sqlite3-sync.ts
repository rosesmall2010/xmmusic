/**
 * 同步包装器，将 @vscode/sqlite3 的异步 API 转换为同步 API
 * 以兼容 better-sqlite3 的同步接口
 */
import * as sqlite3 from '@vscode/sqlite3'
import { EventEmitter } from 'events'

// 同步等待辅助函数 - 使用 deasync 库
// deasync 是一个原生模块，可以将异步操作转换为同步操作
const deasync = require('deasync')

function syncWait<T>(fn: (callback: (err: Error | null, result?: T) => void) => void): T {
  let result: T | undefined
  let error: Error | null = null
  let done = false

  // 启动异步操作
  fn((err, res) => {
    error = err
    result = res
    done = true
  })

  // 使用 deasync 同步等待
  while (!done) {
    deasync.sleep(10) // 等待 10ms，然后检查是否完成
  }

  if (error) {
    throw error
  }

  return result as T
}

export interface RunResult {
  lastInsertRowid: number
  changes: number
}

export class Database extends EventEmitter {
  private db: sqlite3.Database
  private _name: string

  constructor(filename: string, mode?: number) {
    super()
    this._name = filename

    // @vscode/sqlite3 的构造函数返回实例，并在回调中报告错误
    // 我们需要保存实例并等待回调确认没有错误
    let dbInstance: sqlite3.Database
    syncWait<void>((callback) => {
      if (mode !== undefined) {
        dbInstance = new sqlite3.Database(filename, mode, (err) => {
          callback(err, undefined)
        })
      } else {
        dbInstance = new sqlite3.Database(filename, (err) => {
          callback(err, undefined)
        })
      }
    })

    // 如果没有抛出错误，说明数据库创建成功
    this.db = dbInstance!
  }

  get name(): string {
    return this._name
  }

  pragma(pragma: string): any {
    const parts = pragma.split('=')
    const key = parts[0].trim()
    const value = parts.length > 1 ? parts[1].trim() : undefined

    if (value !== undefined) {
      // SET pragma
      return syncWait<any>((callback) => {
        this.db.run(`PRAGMA ${key} = ${value}`, (err) => {
          if (err) {
            callback(err)
          } else {
            callback(null, {})
          }
        })
      })
    } else {
      // GET pragma
      return syncWait<any>((callback) => {
        this.db.get(`PRAGMA ${key}`, (err, row) => {
          if (err) {
            callback(err)
          } else {
            callback(null, row)
          }
        })
      })
    }
  }

  exec(sql: string): void {
    syncWait<void>((callback) => {
      this.db.exec(sql, (err: Error | null) => {
        callback(err || null)
      })
    })
  }

  prepare(sql: string): Statement {
    // @vscode/sqlite3 的 prepare 方法返回语句实例，并在回调中报告错误
    let stmtInstance: sqlite3.Statement
    syncWait<void>((callback) => {
      stmtInstance = this.db.prepare(sql, (err: Error | null) => {
        callback(err, undefined)
      })
    })
    return new Statement(stmtInstance!)
  }

  transaction<T extends any[]>(fn: (...args: T) => void): (...args: T) => void {
    // 返回一个函数，该函数在事务中执行原始函数
    return (...args: T) => {
      // 开始事务
      syncWait<void>((callback) => {
        this.db.run('BEGIN TRANSACTION', (err: Error | null) => {
          callback(err || null)
        })
      })

      try {
        // 执行函数
        fn(...args)
        // 提交事务
        syncWait<void>((callback) => {
          this.db.run('COMMIT', (err: Error | null) => {
            callback(err || null)
          })
        })
      } catch (error) {
        // 回滚事务
        syncWait<void>((callback) => {
          this.db.run('ROLLBACK', (err: Error | null) => {
            callback(err || null)
          })
        })
        throw error
      }
    }
  }

  close(): void {
    syncWait<void>((callback) => {
      this.db.close((err: Error | null) => {
        callback(err || null)
      })
    })
  }
}

export class Statement {
  private stmt: sqlite3.Statement

  constructor(stmt: sqlite3.Statement) {
    this.stmt = stmt
  }

  run(...params: any[]): RunResult {
    return syncWait<RunResult>((callback) => {
      this.stmt.run(...params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          callback(err)
        } else {
          callback(null, {
            lastInsertRowid: this.lastID,
            changes: this.changes
          })
        }
      })
    })
  }

  get(...params: any[]): any {
    return syncWait<any>((callback) => {
      this.stmt.get(...params, (err: Error | null, row?: any) => {
        if (err) {
          callback(err)
        } else {
          callback(null, row)
        }
      })
    })
  }

  all(...params: any[]): any[] {
    return syncWait<any[]>((callback) => {
      this.stmt.all(...params, (err: Error | null, rows?: any[]) => {
        if (err) {
          callback(err)
        } else {
          callback(null, rows || [])
        }
      })
    })
  }

  finalize(): void {
    syncWait<void>((callback) => {
      this.stmt.finalize((err: Error | null) => {
        callback(err || null)
      })
    })
  }
}

// 导出 Database 作为默认导出
export default Database
