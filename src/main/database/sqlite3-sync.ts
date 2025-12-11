/**
 * SQLite3 同步 API 包装器
 * 使用 better-sqlite3 替代 @vscode/sqlite3 + deasync
 * 保持接口兼容，无需修改 db.ts
 */
import BetterSqlite3 from 'better-sqlite3'
import { EventEmitter } from 'events'

export interface RunResult {
  lastInsertRowid: number | bigint
  changes: number
}

export class Database extends EventEmitter {
  private db: BetterSqlite3.Database
  private _name: string

  constructor(filename: string, _mode?: number) {
    super()
    this._name = filename
    // better-sqlite3 构造函数是同步的
    this.db = new BetterSqlite3(filename)
  }

  get name(): string {
    return this._name
  }

  pragma(pragma: string): any {
    return this.db.pragma(pragma)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): Statement {
    return new Statement(this.db.prepare(sql))
  }

  transaction<T extends any[], R>(fn: (...args: T) => R): (...args: T) => R {
    // better-sqlite3 的 transaction 返回一个事务包装函数
    const transactionFn = this.db.transaction(fn)
    return (...args: T) => {
      return transactionFn(...args)
    }
  }

  close(): void {
    this.db.close()
  }
}

export class Statement {
  private stmt: BetterSqlite3.Statement

  constructor(stmt: BetterSqlite3.Statement) {
    this.stmt = stmt
  }

  run(...params: any[]): RunResult {
    const result = this.stmt.run(...params)
    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.changes
    }
  }

  get(...params: any[]): any {
    return this.stmt.get(...params)
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params)
  }

  finalize(): void {
    // better-sqlite3 不需要显式 finalize，语句会自动清理
    // 保留空方法以保持 API 兼容
  }
}

// 导出 Database 作为默认导出
export default Database
