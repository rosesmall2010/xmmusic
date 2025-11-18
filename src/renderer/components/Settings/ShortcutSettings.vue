<template>
  <div class="shortcut-settings">
    <h2>快捷键设置</h2>
    <p class="description">配置全局快捷键，可在应用外使用</p>

    <div class="shortcut-list">
      <div
        v-for="shortcut in shortcutList"
        :key="shortcut.action"
        class="shortcut-item"
      >
        <div class="shortcut-label">
          <span class="label-text">{{ shortcut.label }}</span>
          <span v-if="shortcut.description" class="label-desc">{{ shortcut.description }}</span>
        </div>
        <div class="shortcut-input-wrapper">
          <input
            :ref="el => { if (el) inputRefs[shortcut.action] = el as HTMLInputElement }"
            v-model="shortcuts[shortcut.action]"
            type="text"
            class="shortcut-input"
            :class="{
              'editing': editingAction === shortcut.action,
              'conflict': conflicts[shortcut.action]
            }"
            :placeholder="shortcut.placeholder"
            readonly
            @click="startEditing(shortcut.action)"
            @keydown.prevent="handleKeyDown($event, shortcut.action)"
            @blur="stopEditing(shortcut.action)"
          />
          <button
            v-if="editingAction === shortcut.action"
            class="btn-clear"
            @click="clearShortcut(shortcut.action)"
            title="清除"
          >
            ✕
          </button>
        </div>
        <div v-if="conflicts[shortcut.action]" class="conflict-warning">
          ⚠️ 快捷键冲突
        </div>
      </div>
    </div>

    <div class="shortcut-actions">
      <button class="btn-secondary" @click="resetToDefaults">重置为默认</button>
      <button class="btn-secondary" @click="exportShortcuts">导出配置</button>
      <button class="btn-secondary" @click="importShortcuts">导入配置</button>
    </div>

    <div class="shortcut-hint">
      <p><strong>提示：</strong></p>
      <ul>
        <li>点击输入框后按下组合键来设置快捷键</li>
        <li>支持的修饰键：Ctrl (⌘), Alt (⌥), Shift (⇧)</li>
        <li>媒体键（播放/暂停、上一首/下一首）会自动使用系统媒体键</li>
        <li>如果快捷键冲突，会显示警告</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import type { ShortcutConfig } from '@shared/types/settings'

const shortcuts = reactive<Record<string, string>>({})
const editingAction = ref<string | null>(null)
const conflicts = reactive<Record<string, boolean>>({})
const inputRefs: Record<string, HTMLInputElement> = {}

const shortcutList = [
  {
    action: 'play-pause',
    label: '播放/暂停',
    description: '切换播放状态',
    placeholder: '按组合键设置...'
  },
  {
    action: 'previous',
    label: '上一首',
    description: '播放上一首歌曲',
    placeholder: '按组合键设置...'
  },
  {
    action: 'next',
    label: '下一首',
    description: '播放下一首歌曲',
    placeholder: '按组合键设置...'
  },
  {
    action: 'volume-up',
    label: '音量增加',
    description: '增加音量',
    placeholder: '按组合键设置...'
  },
  {
    action: 'volume-down',
    label: '音量减少',
    description: '减少音量',
    placeholder: '按组合键设置...'
  },
  {
    action: 'toggle-window',
    label: '显示/隐藏窗口',
    description: '切换窗口显示状态',
    placeholder: '按组合键设置...'
  },
  {
    action: 'toggle-favorite',
    label: '收藏/取消收藏',
    description: '切换当前歌曲收藏状态',
    placeholder: '按组合键设置...'
  }
]

onMounted(async () => {
  await loadShortcuts()
})

async function loadShortcuts() {
  try {
    const config = await window.electronAPI.getShortcutConfig()
    if (config && Object.keys(config).length > 0) {
      // 转换格式为显示格式
      const displayConfig: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(config)) {
        displayConfig[action] = parseAccelerator(accelerator as string)
      }
      Object.assign(shortcuts, displayConfig)
    } else {
      // 使用默认快捷键
      const defaults = await window.electronAPI.getDefaultShortcuts()
      const displayDefaults: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(defaults)) {
        displayDefaults[action] = parseAccelerator(accelerator)
      }
      Object.assign(shortcuts, displayDefaults)
    }
    await checkConflicts()
  } catch (error) {
    console.error('加载快捷键配置失败:', error)
  }
}

async function startEditing(action: string) {
  if (editingAction.value === action) return

  // 停止之前的编辑
  if (editingAction.value) {
    await stopEditing(editingAction.value)
  }

  editingAction.value = action
  conflicts[action] = false

  await nextTick()
  const input = inputRefs[action]
  if (input) {
    input.focus()
    input.select()
  }
}

// 将 Electron accelerator 格式转换为显示格式
function parseAccelerator(accelerator: string): string {
  if (!accelerator) return ''

  return accelerator
    .replace(/CommandOrControl/g, process.platform === 'darwin' ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, process.platform === 'darwin' ? '⌥' : 'Alt')
    .replace(/Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' + ')
}

async function stopEditing(action: string) {
  if (editingAction.value !== action) return

  editingAction.value = null

  // 保存快捷键
  if (shortcuts[action]) {
    // 将显示格式转换为 Electron accelerator 格式
    const accelerator = shortcuts[action].replace(/\s*\+\s*/g, '+')
      .replace(/⌘/g, isMac ? 'Command' : 'Control')
      .replace(/⌥/g, 'Alt')
      .replace(/⇧/g, 'Shift')
      .replace(/Ctrl/g, isMac ? 'Command' : 'Control')

    // 统一使用 CommandOrControl
    const normalizedAccelerator = accelerator.replace(/Command|Control/g, 'CommandOrControl')

    const success = await window.electronAPI.registerShortcut(action, normalizedAccelerator)
    if (!success) {
      conflicts[action] = true
      // 恢复之前的快捷键
      const config = await window.electronAPI.getShortcutConfig()
      if (config[action]) {
        shortcuts[action] = parseAccelerator(config[action])
      }
    } else {
      conflicts[action] = false
      await saveShortcuts()
    }
  } else {
    // 清除快捷键
    await window.electronAPI.unregisterShortcut(action)
    await saveShortcuts()
  }

  await checkConflicts()
}

function handleKeyDown(event: KeyboardEvent, action: string) {
  if (editingAction.value !== action) return

  const keys: string[] = []

  // 检测修饰键
  if (event.metaKey || event.ctrlKey) {
    keys.push(isMac ? 'Command' : 'Control')
  }
  if (event.altKey) {
    keys.push('Alt')
  }
  if (event.shiftKey) {
    keys.push('Shift')
  }

  // 检测主键（排除修饰键）
  const key = event.key.toLowerCase()
  if (key !== 'control' && key !== 'meta' && key !== 'alt' && key !== 'shift') {
    // 处理特殊键
    let mainKey = key
    if (key === 'arrowup') mainKey = 'Up'
    else if (key === 'arrowdown') mainKey = 'Down'
    else if (key === 'arrowleft') mainKey = 'Left'
    else if (key === 'arrowright') mainKey = 'Right'
    else if (key === ' ') mainKey = 'Space'
    else if (key.length === 1) mainKey = key.toUpperCase()

    keys.push(mainKey)
  }

  if (keys.length > 0) {
    const accelerator = keys.join('+')
    shortcuts[action] = accelerator

    // 格式化显示
    const formatted = formatAccelerator(accelerator)
    shortcuts[action] = formatted
  }
}

function formatAccelerator(accelerator: string): string {
  return accelerator
    .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' + ')
}

async function clearShortcut(action: string) {
  shortcuts[action] = ''
  await stopEditing(action)
}

async function checkConflicts() {
  for (const action of Object.keys(shortcuts)) {
    if (shortcuts[action]) {
      // 转换显示格式为 Electron accelerator 格式
      const accelerator = shortcuts[action].replace(/\s*\+\s*/g, '+')
        .replace(/⌘/g, isMac ? 'Command' : 'Control')
        .replace(/⌥/g, 'Alt')
        .replace(/⇧/g, 'Shift')
        .replace(/Ctrl/g, isMac ? 'Command' : 'Control')
      const normalizedAccelerator = accelerator.replace(/Command|Control/g, 'CommandOrControl')

      const isAvailable = await window.electronAPI.checkShortcutAvailable(normalizedAccelerator)
      conflicts[action] = !isAvailable
    } else {
      conflicts[action] = false
    }
  }
}

async function saveShortcuts() {
  try {
    // 将显示格式转换为 Electron accelerator 格式保存
    const configToSave: Record<string, string> = {}
    for (const [action, displayAccelerator] of Object.entries(shortcuts)) {
      if (displayAccelerator) {
        const accelerator = displayAccelerator.replace(/\s*\+\s*/g, '+')
          .replace(/⌘/g, isMac ? 'Command' : 'Control')
          .replace(/⌥/g, 'Alt')
          .replace(/⇧/g, 'Shift')
          .replace(/Ctrl/g, isMac ? 'Command' : 'Control')
        configToSave[action] = accelerator.replace(/Command|Control/g, 'CommandOrControl')
      } else {
        configToSave[action] = ''
      }
    }
    await window.electronAPI.saveShortcutConfig(configToSave)
  } catch (error) {
    console.error('保存快捷键配置失败:', error)
  }
}

async function resetToDefaults() {
  if (confirm('确定要重置所有快捷键为默认值吗？')) {
    const defaults = await window.electronAPI.getDefaultShortcuts()
    // 转换为显示格式
    const displayDefaults: Record<string, string> = {}
    for (const [action, accelerator] of Object.entries(defaults)) {
      displayDefaults[action] = parseAccelerator(accelerator)
    }
    Object.assign(shortcuts, displayDefaults)

    // 重新注册所有快捷键（使用原始格式）
    await window.electronAPI.registerAllShortcuts(defaults)
    await saveShortcuts()
    await checkConflicts()
  }
}

async function exportShortcuts() {
  try {
    const filePath = await window.electronAPI.showSaveDialog({
      title: '导出快捷键配置',
      defaultPath: 'shortcuts.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    })

    if (filePath) {
      await window.electronAPI.writeFile(filePath, JSON.stringify(shortcuts, null, 2), 'utf-8')
      alert('导出成功！')
    }
  } catch (error: any) {
    console.error('导出失败:', error)
    alert(`导出失败: ${error.message}`)
  }
}

async function importShortcuts() {
  try {
    const filePath = await window.electronAPI.selectMusicFile()
    if (!filePath) return

    const content = await window.electronAPI.readFile(filePath, 'utf-8')
    if (!content || typeof content !== 'string') {
      throw new Error('文件内容无效')
    }

    let imported: any
    try {
      imported = JSON.parse(content)
    } catch (parseError) {
      throw new Error(`JSON 解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`)
    }

    if (confirm('确定要导入快捷键配置吗？这将覆盖当前配置。')) {
      // 转换导入的快捷键为显示格式
      const displayImported: Record<string, string> = {}
      for (const [action, accelerator] of Object.entries(imported)) {
        if (typeof accelerator === 'string') {
          displayImported[action] = parseAccelerator(accelerator)
        }
      }
      Object.assign(shortcuts, displayImported)

      // 注册快捷键（使用原始格式）
      await window.electronAPI.registerAllShortcuts(imported)
      await saveShortcuts()
      await checkConflicts()
      alert('导入成功！')
    }
  } catch (error: any) {
    console.error('导入失败:', error)
    alert(`导入失败: ${error.message}`)
  }
}
</script>

<style scoped>
.shortcut-settings {
  padding: 24px;
}

h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: var(--text-color);
}

.description {
  margin: 0 0 24px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.shortcut-list {
  margin-bottom: 24px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  padding: 16px;
  margin-bottom: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  gap: 16px;
}

.shortcut-label {
  flex: 1;
  min-width: 200px;
}

.label-text {
  display: block;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.label-desc {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
}

.shortcut-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 300px;
}

.shortcut-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
  font-family: monospace;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.shortcut-input:hover {
  border-color: var(--primary-color);
}

.shortcut-input.editing {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.2);
  cursor: text;
}

.shortcut-input.conflict {
  border-color: #ff4444;
  background: rgba(255, 68, 68, 0.1);
}

.btn-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  line-height: 1;
}

.btn-clear:hover {
  color: var(--text-color);
}

.conflict-warning {
  color: #ff4444;
  font-size: 12px;
  white-space: nowrap;
}

.shortcut-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--button-bg);
  color: var(--text-color);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.shortcut-hint {
  padding: 16px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcut-hint p {
  margin: 0 0 8px 0;
  font-weight: 500;
  color: var(--text-color);
}

.shortcut-hint ul {
  margin: 0;
  padding-left: 20px;
}

.shortcut-hint li {
  margin-bottom: 4px;
}
</style>
