#!/usr/bin/env node
const { mkdirSync, readdirSync, copyFileSync } = require('fs')
const { join } = require('path')

const srcDir = join(__dirname, '..', 'src', 'main', 'database', 'migrations')
const destDir = join(__dirname, '..', 'dist', 'electron', 'main', 'database', 'migrations')

mkdirSync(destDir, { recursive: true })

const files = readdirSync(srcDir).filter(file => file.endsWith('.sql'))

files.forEach(file => {
  copyFileSync(join(srcDir, file), join(destDir, file))
  console.log(`Copied ${file}`)
})
