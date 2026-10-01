/**
 * 游标分页（keyset）正确性自检 —— 跑真实的 MusicDatabase.getLocalMusicPage
 *
 * 为什么要单独一个脚本：better-sqlite3 按 Electron ABI 编译，纯 node / vitest 加载不了，
 * 所以 db.ts 的逻辑没法进常规测试套件。这里起一个真实 Electron 主进程来跑。
 *
 * 守的是什么：getLocalMusicPage 按 (lm.added_at DESC, lm.music_id DESC) 游标翻页。
 * 查询用了 `SELECT am.*`，而 all_music 自己也有 added_at 列，会遮蔽 lm.added_at。
 * 一旦漏了 `lm.added_at AS lm_added_at` 别名，游标就会读到错值 —— 表现为重复读同一页
 * 或整段跳过。fixture 刻意让两张表的 added_at 不同，使这个 bug 必然暴露。
 *
 * 用法：npm run check:pagination
 */
const { app } = require('electron')
const { join } = require('path')
const { mkdtempSync, rmSync } = require('fs')
const { tmpdir } = require('os')

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}
const pass = (msg) => console.log(`✓ ${msg}`)

app.whenReady().then(() => {
  try {
    run()
  } catch (e) {
    // 不吞异常：否则 Electron 会在无窗口状态下一直挂着，CI 里表现为超时
    console.error('✗ 自检异常:', e && e.stack ? e.stack : e)
    app.exit(1)
    return
  }
})

function run() {
  const workDir = mkdtempSync(join(tmpdir(), 'xmmusic-pagination-'))
  // initialize() 内部会读 app.getPath('userData')，改到临时目录避免碰真实库
  app.setPath('userData', workDir)

  let MusicDatabase
  try {
    MusicDatabase = require(join(__dirname, '..', 'dist', 'electron', 'main', 'database', 'db')).default
  } catch (e) {
    console.error('加载 dist/electron/main/database/db 失败，请先 npm run build:electron')
    console.error(e.message)
    app.exit(1)
    return
  }

  const db = MusicDatabase.getInstance()
  db.initialize(join(workDir, 'check.db'))
  const sqlite = db.getDatabase()

  // ---- fixture ----
  // 关键：all_music.added_at 与 local_music.added_at 刻意不同。
  // 若 SELECT am.* 遮蔽了 lm.added_at，游标会拿 all_music 的值，翻页立刻错乱。
  const N = 250
  sqlite.exec(`INSERT INTO music_dir (id, path) VALUES (1, '/fixture')`)
  const insMusic = sqlite.prepare(`
    INSERT INTO all_music
      (id, dir_id, file_name, title, artist, added_at, is_exists, is_duplicate,
       file_size, file_hash, file_extension)
    VALUES (?, 1, ?, ?, 'A', ?, 1, 0, 1024, ?, 'mp3')`)
  const insLocal = sqlite.prepare(`INSERT INTO local_music (music_id, added_at) VALUES (?, ?)`)
  sqlite.transaction(() => {
    for (let i = 1; i <= N; i++) {
      // all_music.added_at 用相反的时间走向，制造遮蔽时的错序
      insMusic.run(
        i,
        `t${i}.mp3`,
        `Track ${i}`,
        `2020-01-01 00:00:${String(i % 60).padStart(2, '0')}`,
        `hash-${i}`
      )
      // 大量 added_at 相同 → 强制走 (added_at = ? AND music_id < ?) 这条 ties 分支
      insLocal.run(i, `2030-06-0${1 + (i % 5)} 12:00:00`)
    }
  })()

  // ---- 基准：一次性按同一排序取全量 ----
  const expected = db.getLocalMusicPaginated(0, N * 2).map((m) => m.id)
  if (expected.length !== N) fail(`基准全量取到 ${expected.length} 行，期望 ${N}`)

  // ---- 游标翻页，多种批大小都要与基准逐行一致 ----
  for (const limit of [1, 7, 50, N]) {
    const seq = []
    let cursor = null
    let guard = 0
    do {
      const page = db.getLocalMusicPage(cursor, limit)
      if (page.items.length === 0) break
      for (const it of page.items) seq.push(it.id)
      cursor = page.nextCursor
      if (++guard > N + 10) {
        fail(`批大小 ${limit}：翻页次数超出上限，游标没有推进（典型为 lm.added_at 被 am.* 遮蔽）`)
        break
      }
    } while (cursor)

    const same = seq.length === expected.length && seq.every((v, i) => v === expected[i])
    const uniq = new Set(seq).size === seq.length
    if (!same) fail(`批大小 ${limit}：游标序列与基准不一致（取到 ${seq.length} 行，期望 ${expected.length}）`)
    else if (!uniq) fail(`批大小 ${limit}：游标序列有重复行`)
    else pass(`批大小 ${limit}：${seq.length} 行，顺序与基准一致、无重复`)
  }

  // ---- 末页语义：正好取满时仍给游标（不多查一次无从判断到底），下一页才为空 ----
  const fullPage = db.getLocalMusicPage(null, N)
  if (fullPage.items.length !== N) fail(`整表一次取应得 ${N} 行，实得 ${fullPage.items.length}`)
  if (fullPage.nextCursor === null) fail('正好取满一页时应仍返回游标，交由下一次查询判定到底')
  else {
    const after = db.getLocalMusicPage(fullPage.nextCursor, N)
    if (after.items.length !== 0 || after.nextCursor !== null) {
      fail('取满后的下一页应为空且 nextCursor 为 null')
    } else {
      pass('末页语义正确：取满给游标，下一页空且游标为 null')
    }
  }

  // ---- 不足一页时直接判定到底 ----
  const partial = db.getLocalMusicPage(null, N + 10)
  if (partial.nextCursor !== null) fail('不足一页时 nextCursor 应为 null')
  else pass('不足一页时直接给出 null 游标')

  // ---- 空表 ----
  sqlite.exec('DELETE FROM local_music')
  const empty = db.getLocalMusicPage(null, 10)
  if (empty.items.length !== 0 || empty.nextCursor !== null) fail('空表应返回空 items 与 null 游标')
  else pass('空表返回空结果')

  try {
    db.close()
  } catch {
    /* ignore */
  }
  rmSync(workDir, { recursive: true, force: true })

  console.log(process.exitCode ? '\n游标分页自检失败' : '\n游标分页自检通过')
  app.exit(process.exitCode || 0)
}
