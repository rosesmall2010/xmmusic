#!/usr/bin/env node

/**
 * 从 pic/appicon2.png 生成：
 * - build/icon.png（1024）及托盘常用尺寸
 * - build/icon.icns、pic/icon.icns（macOS 应用图标）
 * 使用 macOS 内置的 sips / iconutil
 */

const { execSync } = require('child_process')
const { join } = require('path')
const { existsSync, mkdirSync, rmSync, copyFileSync } = require('fs')

const projectRoot = process.cwd()
const sourceIcon = join(projectRoot, 'pic', 'appicon2.png')
const iconsetDir = join(projectRoot, 'build', 'icon.iconset')
const outputIcnsBuild = join(projectRoot, 'build', 'icon.icns')
const outputIcnsPic = join(projectRoot, 'pic', 'icon.icns')
const outputPng = join(projectRoot, 'build', 'icon.png')

if (!existsSync(sourceIcon)) {
  console.error(`❌ 源图标文件不存在: ${sourceIcon}`)
  process.exit(1)
}

console.log('🔧 开始生成应用 / 托盘图标...')
console.log(`📂 源文件: ${sourceIcon}`)

try {
  mkdirSync(join(projectRoot, 'build'), { recursive: true })

  // 主 PNG + 托盘尺寸（与当前 App 图标保持一致）
  const pngSizes = [
    { path: outputPng, size: 1024 },
    { path: join(projectRoot, 'build', 'icon-512.png'), size: 512 },
    { path: join(projectRoot, 'build', 'icon-256.png'), size: 256 },
    { path: join(projectRoot, 'build', 'icon-128.png'), size: 128 },
    { path: join(projectRoot, 'build', 'icon-64.png'), size: 64 },
    { path: join(projectRoot, 'build', 'icon-32.png'), size: 32 },
    { path: join(projectRoot, 'build', 'icon-16.png'), size: 16 }
  ]

  console.log('📐 生成 PNG 尺寸...')
  for (const { path, size } of pngSizes) {
    execSync(`sips -z ${size} ${size} "${sourceIcon}" --out "${path}"`, { stdio: 'inherit' })
    console.log(`  ✅ ${path.replace(projectRoot + '/', '')} (${size}x${size})`)
  }

  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true })
  }
  mkdirSync(iconsetDir, { recursive: true })

  const icnsSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 }
  ]

  console.log('📐 生成 ICNS 所需尺寸...')
  for (const { name, size } of icnsSizes) {
    const outputPath = join(iconsetDir, name)
    execSync(`sips -z ${size} ${size} "${sourceIcon}" --out "${outputPath}"`, { stdio: 'inherit' })
    console.log(`  ✅ ${name} (${size}x${size})`)
  }

  console.log('🔨 生成 ICNS...')
  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputIcnsBuild}"`, { stdio: 'inherit' })
  copyFileSync(outputIcnsBuild, outputIcnsPic)

  rmSync(iconsetDir, { recursive: true, force: true })

  console.log('✅ 图标生成成功!')
  console.log(`📦 ${outputPng}`)
  console.log(`📦 ${outputIcnsBuild}`)
  console.log(`📦 ${outputIcnsPic}`)
} catch (error) {
  console.error('❌ 生成图标失败:', error.message)
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true })
  }
  process.exit(1)
}
