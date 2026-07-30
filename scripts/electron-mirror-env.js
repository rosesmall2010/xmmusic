/**
 * 为中国大陆加速 Electron / electron-builder 二进制下载。
 * 通过 .npmrc 的 node-options --require 注入，或被 install/打包脚本显式 require。
 * 若已在环境中设置同名变量，则不覆盖（便于临时改回官方源）。
 */
const ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
const ELECTRON_BUILDER_BINARIES_MIRROR =
  'https://npmmirror.com/mirrors/electron-builder-binaries/'

if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = ELECTRON_MIRROR
}
if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR = ELECTRON_BUILDER_BINARIES_MIRROR
}

module.exports = {
  ELECTRON_MIRROR,
  ELECTRON_BUILDER_BINARIES_MIRROR
}
