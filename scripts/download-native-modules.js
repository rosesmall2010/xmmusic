#!/usr/bin/env node

/**
 * 下载 Windows 平台的原生模块预编译文件
 * 用于在 macOS 上交叉编译 Windows 版本
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createWriteStream, mkdirSync } = require('fs');

const TARGET_PLATFORM = process.argv[2] || 'win32';
const TARGET_ARCH = process.argv[3] || 'x64';

console.log(`📦 开始下载 ${TARGET_PLATFORM}-${TARGET_ARCH} 平台的原生模块...`);

// 读取 package.json 获取依赖版本
const packageJson = require('../package.json');
const electronVersion = packageJson.devDependencies.electron.replace('^', '');
const nodeAbi = getNodeAbi(electronVersion);

console.log(`🔧 Electron 版本: ${electronVersion}`);
console.log(`🔧 Node ABI: ${nodeAbi}`);

/**
 * 获取 Electron 版本对应的 Node ABI
 */
function getNodeAbi(electronVersion) {
  // Electron 39 使用 Node.js 132
  const abiMap = {
    '39': '132',
    '38': '131',
    '37': '130',
    '36': '129',
  };

  const major = electronVersion.split('.')[0];
  return abiMap[major] || '132';
}

/**
 * 下载文件
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`📥 下载: ${url}`);
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const file = createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        return downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ 下载完成: ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * 方案 1: 使用 Docker 容器构建（推荐但需要 Docker）
 */
async function buildWithDocker() {
  console.log('\n🐳 方案 1: 使用 Docker 构建（需要 Docker Desktop）\n');

  const dockerfile = `
FROM node:18-windowsservercore-ltsc2022
WORKDIR /app
COPY package*.json ./
RUN npm install --platform=win32 --arch=x64
CMD ["powershell"]
`;

  fs.writeFileSync(path.join(__dirname, '../Dockerfile.win'), dockerfile);

  console.log('Dockerfile 已创建，请运行：');
  console.log('1. docker build -f Dockerfile.win -t xmmusic-win-builder .');
  console.log('2. docker create --name xmmusic-temp xmmusic-win-builder');
  console.log('3. docker cp xmmusic-temp:/app/node_modules/@vscode/sqlite3/build ./node_modules/@vscode/sqlite3/');
  console.log('4. docker cp xmmusic-temp:/app/node_modules/deasync/bin ./node_modules/deasync/');
  console.log('5. docker rm xmmusic-temp');
}

/**
 * 方案 2: 从 GitHub Actions artifacts 下载
 */
async function downloadFromGitHub() {
  console.log('\n📦 方案 2: 从 GitHub Actions 下载预编译文件\n');
  console.log('需要先在 GitHub Actions 上构建一次，然后下载 artifacts');
}

/**
 * 方案 3: 手动安装 Windows 版本（实验性）
 */
async function manualInstall() {
  console.log('\n🔧 方案 3: 尝试手动安装 Windows 版本的原生模块\n');

  try {
    // 创建临时目录
    const tempDir = path.join(__dirname, '../.temp-win-modules');
    if (!fs.existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    console.log('📦 安装 Windows 版本的 @vscode/sqlite3...');

    // 在临时目录安装 Windows 版本
    process.chdir(tempDir);

    // 创建临时 package.json
    fs.writeFileSync('package.json', JSON.stringify({
      name: 'temp-win-build',
      version: '1.0.0',
      dependencies: {
        '@vscode/sqlite3': packageJson.dependencies['@vscode/sqlite3'],
        'deasync': packageJson.dependencies['deasync']
      }
    }, null, 2));

    console.log('⚠️  注意：此方法需要在 Windows 系统上预先构建并保存原生模块');
    console.log('');
    console.log('请在 Windows 系统上执行以下命令：');
    console.log('1. npm install');
    console.log('2. 将 node_modules/@vscode/sqlite3/build 目录打包');
    console.log('3. 将 node_modules/deasync/bin 目录打包');
    console.log('4. 将打包文件放到 .temp-win-modules 目录');

  } catch (error) {
    console.error('❌ 安装失败:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n='.repeat(60));
  console.log('跨平台原生模块构建工具');
  console.log('='.repeat(60));

  console.log('\n⚠️  当前限制：');
  console.log('- @vscode/sqlite3 和 deasync 使用 node-gyp 编译');
  console.log('- node-gyp 不支持交叉编译');
  console.log('- 必须在目标平台上编译原生模块');

  console.log('\n💡 可用的解决方案：\n');

  await buildWithDocker();
  await downloadFromGitHub();
  await manualInstall();

  console.log('\n='.repeat(60));
  console.log('推荐方案：使用 GitHub Actions CI/CD');
  console.log('详见：docs/CROSS_PLATFORM_BUILD.md');
  console.log('='.repeat(60));
}

main().catch(console.error);
