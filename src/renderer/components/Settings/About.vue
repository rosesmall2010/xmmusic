<template>
  <div class="about">
    <div class="app-info">
      <h1 class="app-name">xmmusic</h1>
      <p class="app-version">版本 1.0.1</p>
      <p class="app-desc">基于 Electron + Vue + TypeScript 的跨平台音乐播放器</p>
    </div>

    <div class="tech-stack">
      <h3>技术栈</h3>
      <div class="tech-list">
        <div class="tech-item">
          <div class="tech-name">Electron 39.2.1</div>
          <div class="tech-desc">跨平台桌面应用框架</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">Vue 3.5.24</div>
          <div class="tech-desc">渐进式前端框架，构建用户界面</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">TypeScript 5.9.3</div>
          <div class="tech-desc">类型安全的 JavaScript 超集</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">Vite 7.2.2</div>
          <div class="tech-desc">极速前端构建工具</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">SQLite (@vscode/sqlite3 5.1.2)</div>
          <div class="tech-desc">轻量级本地数据库，存储音乐库信息</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">Pinia 3.0.4</div>
          <div class="tech-desc">Vue 官方状态管理库</div>
        </div>
        <div class="tech-item">
          <div class="tech-name">Howler.js 2.2.4</div>
          <div class="tech-desc">音频播放引擎，处理音乐播放</div>
        </div>
      </div>
    </div>

    <div class="links">
      <h3>链接</h3>
      <a href="#" @click.prevent="openGitHub">GitHub 仓库</a>
      <a href="#" @click.prevent="openIssues">反馈问题</a>
    </div>

    <div class="copyright">
      <p>© 2024 zdhsoft. All rights reserved.</p>
      <p>开源许可：MIT License</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const openGitHub = () => {
  // TODO: 打开GitHub链接
  console.log('打开GitHub')
}

const openIssues = () => {
  // TODO: 打开Issues链接
  console.log('打开Issues')
}
</script>

<style scoped>
.about {
  padding: 40px;
  max-width: 600px;
  margin: 0 auto;
}

.app-info {
  text-align: center;
  margin-bottom: 40px;
}

.app-name {
  font-size: 48px;
  font-weight: bold;
  color: #ff4757;
  margin-bottom: 10px;
}

.app-version {
  font-size: 18px;
  color: var(--secondary-text-color);
  margin-bottom: 10px;
}

.app-desc {
  font-size: 14px;
  color: var(--text-color);
}

.tech-stack,
.links {
  margin-bottom: 30px;
}

h3 {
  font-size: 18px;
  color: var(--text-color);
  margin-bottom: 15px;
}

.tech-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tech-item {
  padding: 12px 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
}

.tech-item:hover {
  border-color: #ff4757;
  transform: translateX(4px);
}

.tech-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
}

.tech-desc {
  font-size: 12px;
  color: var(--secondary-text-color);
}

ul {
  list-style: none;
  padding: 0;
}

li {
  padding: 8px 0;
  color: var(--text-color);
}

a {
  display: block;
  padding: 8px 0;
  color: #ff4757;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.copyright {
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.copyright p {
  font-size: 12px;
  color: var(--secondary-text-color);
  margin: 5px 0;
}
</style>
