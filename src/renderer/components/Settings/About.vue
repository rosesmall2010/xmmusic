<template>
  <div class="about">
    <div class="app-info">
      <h1 class="app-name">xmmusic</h1>
      <p class="app-version">版本 1.0.0</p>
      <p class="app-desc">基于 Electron + Vue + TypeScript 的跨平台音乐播放器</p>
    </div>

    <div class="tech-stack">
      <h3>技术栈</h3>
      <ul>
        <li>Electron 32.3.3</li>
        <li>Vue 3.5.24</li>
        <li>TypeScript 5.9</li>
        <li>SQLite (better-sqlite3)</li>
      </ul>
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
