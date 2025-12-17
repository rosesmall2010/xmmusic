#!/usr/bin/env node

/**
 * 从 pic/appicon.png 生成 macOS ICNS 图标文件
 * 使用 macOS 内置的 sips 和 iconutil 工具
 */

const { execSync } = require('child_process')
const { join } = require('path')
const { existsSync, mkdirSync, rmSync } = require('fs')

const projectRoot = process.cwd()
const sourceIcon = join(projectRoot, 'pic', 'appicon2.png')
const iconsetDir = join(projectRoot, 'build', 'icon.iconset')
const outputIcns = join(projectRoot, 'build', 'icon.icns')

// 检查源文件是否存在
if (!existsSync(sourceIcon)) {
  console.error(`❌ 源图标文件不存在: ${sourceIcon}`)
  process.exit(1)
}

console.log('🔧 开始生成 ICNS 图标...')
console.log(`📂 源文件: ${sourceIcon}`)
console.log(`📂 输出文件: ${outputIcns}`)

try {
  // 清理旧的 iconset 目录
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true })
  }

  // 创建 iconset 目录
  mkdirSync(iconsetDir, { recursive: true })

  // macOS ICNS 需要的图标尺寸列表
  const sizes = [
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

  console.log('📐 生成各种尺寸的图标...')

  // 使用 sips 命令调整图片大小
  for (const { name, size } of sizes) {
    const outputPath = join(iconsetDir, name)
    try {
      execSync(`sips -z ${size} ${size} "${sourceIcon}" --out "${outputPath}"`, {
        stdio: 'inherit'
      })
      console.log(`  ✅ ${name} (${size}x${size})`)
    } catch (error) {
      console.error(`  ❌ 生成 ${name} 失败:`, error.message)
      throw error
    }
  }

  // 使用 iconutil 生成 ICNS 文件
  console.log('🔨 生成 ICNS 文件...')
  execSync(`iconutil -c icns "${iconsetDir}" -o "${outputIcns}"`, {
    stdio: 'inherit'
  })

  // 清理临时目录
  rmSync(iconsetDir, { recursive: true, force: true })

  console.log('✅ ICNS 图标生成成功!')
  console.log(`📦 输出文件: ${outputIcns}`)

} catch (error) {
  console.error('❌ 生成 ICNS 图标失败:', error.message)

  // 清理临时目录
  if (existsSync(iconsetDir)) {
    rmSync(iconsetDir, { recursive: true, force: true })
  }

  process.exit(1)
}
