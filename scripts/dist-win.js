#!/usr/bin/env node
/**
 * 打 Windows x64 安装包（可在 macOS / Linux 上交叉打包）
 *
 * better-sqlite3 等原生模块由 electron-builder 按目标平台下载官方预编译二进制（不从源码编译），
 * 但它会原地覆盖 node_modules 里的 .node；打完（无论成败）必须恢复宿主平台二进制，
 * 否则本机 npm run dev 会加载到 Windows 版 .node 直接崩。
 */
require('./electron-mirror-env')
const { spawnSync } = require('child_process')
const path = require('path')

const isWindows = process.platform === 'win32'
const npxCommand = isWindows ? 'npx.cmd' : 'npx'
const env = { ...process.env, NODE_ENV: 'production' }

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env, shell: isWindows })
  if (result.error) console.error(result.error)
  return result.status ?? 1
}

const status = run(npxCommand, ['electron-builder', '--win', '--x64', '-c.npmRebuild=true'])

// 宿主就是 Windows x64 时，重建出的已是本机二进制，无需恢复
if (!(isWindows && process.arch === 'x64')) {
  console.log('\n♻️  恢复宿主平台原生模块二进制…')
  const restore = run(process.execPath, [path.join(__dirname, 'install-app-deps.js')])
  if (restore !== 0) {
    console.error('⚠️ 恢复失败，请手动执行 npm run rebuild')
    process.exit(restore)
  }
}

process.exit(status)
