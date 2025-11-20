#!/usr/bin/env node
const { spawnSync } = require('child_process')

const isMac = process.platform === 'darwin'
const env = { ...process.env }

if (isMac && !env.PYTHON) {
  env.PYTHON = '/opt/homebrew/bin/python3.11'
}

const result = spawnSync('npx', ['electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
  env
})

if (result.error) {
  console.error(result.error)
  process.exit(result.status ?? 1)
}

process.exit(result.status ?? 0)
