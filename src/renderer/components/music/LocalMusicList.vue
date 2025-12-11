<template>
  <div class="local-music-list">
    <div class="list-header">
      <div>
        <h1 class="page-title">本地音乐</h1>
        <div class="stats">{{ totalCount }} 首歌曲</div>
      </div>
      <div class="header-actions">
        <button class="btn-secondary" @click="handleClearAll" :disabled="totalCount === 0">
          清除所有
        </button>
        <button class="btn-primary" @click="handlePlayAll" :disabled="totalCount === 0">
          播放全部
        </button>
        <button class="btn-primary" @click="handleScan" :disabled="isScanning">
          {{ isScanning ? '扫描中...' : '扫描音乐' }}
        </button>
        <button class="btn-secondary" @click="openDirManageDialog">
          扫描目录管理
        </button>
      </div>
    </div>

    <!-- 扫描进度条 -->
    <div v-if="isScanning && scanProgress" class="scan-progress-bar">
      <div class="progress-info">
        <span class="current-file" :title="scanProgress.currentFile">正在扫描: {{ scanProgress.currentFile }}</span>
        <span class="progress-stats">{{ scanProgress.current }} / {{ scanProgress.total }} ({{ scanProgress.percentage.toFixed(1) }}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${scanProgress.percentage}%` }"></div>
      </div>
    </div>

    <div class="music-list-container">
      <SongList :songs="musicList" @play="playMusic" @load-more="loadMore" @songs-updated="handleSongsUpdated">
        <template #empty>
          <p>暂无音乐</p>
          <button class="btn-link" @click="handleScan">扫描音乐文件夹</button>
        </template>
      </SongList>
    </div>

    <!-- 扫描目录管理对话框 -->
    <div v-if="showDirManageDialog" class="dialog-overlay" @click.self="closeDirManageDialog">
      <div class="dir-manage-dialog">
        <div class="dialog-header">
          <h3 class="dialog-title">扫描目录管理</h3>
          <button class="dialog-close" @click="closeDirManageDialog" title="关闭">×</button>
        </div>
        <div class="dialog-body">
          <div class="dir-manage-actions">
            <button
              class="btn-primary"
              @click="showAddDirDialog = true"
              :disabled="dirStore.directories.length >= 20"
            >
              <Plus :size="16" />
              添加目录
            </button>
            <div class="dir-limit-hint" v-if="dirStore.directories.length >= 20">
              已达到最大数量限制（20个）
            </div>
          </div>

          <div v-if="dirStore.loading" class="dir-loading">加载中...</div>
          <div v-else-if="dirStore.directories.length === 0" class="dir-empty">
            暂无扫描目录，请添加音乐目录
          </div>
          <div v-else class="dir-list">
            <div
              v-for="dir in dirStore.directories"
              :key="dir.id"
              class="dir-item"
              :class="{ disabled: !dir.enabled }"
            >
              <div class="dir-content">
                <div class="dir-path">{{ dir.path }}</div>
                <div class="dir-meta">
                  <span class="dir-order">顺序: {{ dir.display_order }}</span>
                  <span class="dir-status" :class="{ enabled: dir.enabled, disabled: !dir.enabled }">
                    {{ dir.enabled ? '已启用' : '已禁用' }}
                  </span>
                </div>
              </div>
              <div class="dir-actions">
                <button
                  class="btn-icon"
                  @click="toggleDirEnabled(dir)"
                  :title="dir.enabled ? '禁用' : '启用'"
                >
                  <Power v-if="dir.enabled" :size="16" />
                  <PowerOff v-else :size="16" />
                </button>
                <button class="btn-icon" @click="editDir(dir)" title="编辑">
                  <Edit :size="16" />
                </button>
                <button class="btn-icon danger" @click="deleteDir(dir)" title="删除">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteConfirmDialog" class="dialog-overlay" @click.self="cancelDelete">
      <div class="dialog-content delete-confirm-dialog">
        <h3 class="dialog-title">确认删除</h3>
        <div class="dialog-body">
          <p class="delete-confirm-text">
            确定要从扫描目录列表中删除 "<strong>{{ dirToDelete?.path }}</strong>" 吗？
          </p>
          <p class="delete-confirm-hint">
            注意：此操作只会从扫描目录列表中移除该目录，不会删除已扫描的音乐文件。
          </p>
        </div>
        <div class="dialog-actions">
          <button class="btn-secondary" @click="cancelDelete">取消</button>
          <button class="btn-primary btn-danger" @click="confirmDelete">确定删除</button>
        </div>
      </div>
    </div>

    <!-- 添加/编辑目录对话框 -->
    <div v-if="showAddDirDialog" class="dialog-overlay" @click.self="closeAddDirDialog">
      <div class="dialog-content">
        <h3 class="dialog-title">{{ editingDir ? '编辑目录' : '添加目录' }}</h3>
        <div class="dialog-body">
          <div class="form-group">
            <label class="form-label">目录路径</label>
            <input
              v-model="newDirPath"
              type="text"
              class="form-input form-input-full"
              :class="{ 'form-input-error': isDirExists }"
              placeholder="请输入或选择目录路径"
              @keyup.enter="editingDir ? handleSaveEdit() : handleAddDir()"
              @input="checkDirExists"
            />
            <div v-if="isDirExists && !editingDir" class="form-error-hint">
              该目录已存在，请选择其他目录
            </div>
            <button
              class="btn-secondary form-input-btn"
              @click="selectDirPath"
              title="选择目录"
            >
              浏览
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-secondary" @click="closeAddDirDialog">取消</button>
          <button
            class="btn-primary"
            @click="editingDir ? handleSaveEdit() : handleAddDir()"
            :disabled="isDirExists || !newDirPath.trim()"
          >
            {{ editingDir ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Plus, Power, PowerOff, Edit, Trash2 } from 'lucide-vue-next'
import { useMusicStore } from '@/stores/music'
import { usePlayerStore } from '@/stores/player'
import { usePlayer } from '@/composables/usePlayer'
import { useLocalMusicDirStore } from '@/stores/localMusicDir'
import SongList from '@/components/music/SongList.vue'
import type { MusicItem, ScanProgress } from '@shared/types/music'

const musicStore = useMusicStore()
const playerStore = usePlayerStore()
const dirStore = useLocalMusicDirStore()
const { play } = usePlayer()

const musicList = computed(() => musicStore.musicList)
const totalCount = computed(() => musicStore.totalCount)

// 扫描状态
const isScanning = ref(false)
const scanProgress = ref<ScanProgress | null>(null)

// 目录管理对话框状态
const showDirManageDialog = ref(false)
const showAddDirDialog = ref(false)
const editingDir = ref<{ id: number; path: string; display_order: number; enabled: boolean } | null>(null)
const newDirPath = ref('')

// 删除确认对话框状态
const showDeleteConfirmDialog = ref(false)
const dirToDelete = ref<{ id: number; path: string } | null>(null)

// 检查目录是否已存在
const isDirExists = computed(() => {
  if (!newDirPath.value.trim() || editingDir.value) {
    return false // 编辑模式或空路径时不检查
  }
  const trimmedPath = newDirPath.value.trim()
  return dirStore.directories.some(d => d.path === trimmedPath)
})

onMounted(async () => {
  // Initial load of 20 items
  await musicStore.loadMusic(0, 20)

  // 加载目录列表
  try {
    await dirStore.loadDirectories()
  } catch (error) {
    console.error('加载目录列表失败:', error)
  }

  // Start background loading
  startBackgroundLoading()

  // 监听元数据更新事件
  window.addEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)

  // 监听扫描进度
  window.electronAPI.onScanProgress((progress) => {
    isScanning.value = true
    scanProgress.value = progress
  })

  // 监听扫描状态变化
  window.electronAPI.onScanStateChanged((state) => {
    isScanning.value = state.isScanning
    if (!state.isScanning) {
      scanProgress.value = null
      // 扫描结束后刷新列表
      musicStore.loadMusic(0, 20, true)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('music-metadata-updated', handleMetadataUpdate as EventListener)
  window.electronAPI.removeScanProgress()
  window.electronAPI.removeScanStateChanged()
})

const startBackgroundLoading = async () => {
  // Check if there are more items to load
  if (musicStore.hasMore) {
    // Use requestIdleCallback or setTimeout to avoid blocking main thread
    setTimeout(async () => {
      if (musicStore.hasMore && !musicStore.loading) {
        await musicStore.loadMusic(musicStore.currentOffset, 20)
        // Continue loading next batch
        startBackgroundLoading()
      }
    }, 100) // Small delay between batches
  }
}

// 监听后端事件
onMounted(() => {
  // 监听单曲更新
  window.electronAPI.on('music-updated', async (_event: any, filePath: string) => {
    // 重新加载当前视图的数据
    // 简单起见，我们刷新整个列表，或者尝试只更新特定项
    // 由于我们使用了分页和虚拟滚动，精确定位比较麻烦，这里先尝试重新加载第一页并后台加载
    // 但为了不打断用户浏览，最好是只更新内存中的数据

    // 查找并更新 store 中的数据
    const index = musicStore.musicList.findIndex(m => m.filePath === filePath)
    if (index !== -1) {
      // 获取最新数据（可以通过重新加载或后端传递）
      // 这里简单触发重新加载，或者如果能获取到 ID，就只更新那个 ID
      // 暂时重新加载列表
      await musicStore.loadMusic(0, 20, true)
      startBackgroundLoading()
    }
  })

  // 监听列表刷新
  window.electronAPI.on('music-list-refresh', async () => {
    await musicStore.loadMusic(0, 20, true)
    startBackgroundLoading()
  })

  // 监听扫描进度
  window.electronAPI.onScanProgress((progress) => {
    scanProgress.value = progress
  })

  window.electronAPI.onScanStateChanged((state: any) => {
    // state 可能是对象或字符串，根据实际情况处理
    const status = typeof state === 'string' ? state : state?.status
    isScanning.value = status === 'scanning'
    if (!isScanning.value) {
      scanProgress.value = null
    }
  })
})

onUnmounted(() => {
  window.electronAPI.removeAllListeners('music-updated')
  window.electronAPI.removeAllListeners('music-list-refresh')
  window.electronAPI.removeAllListeners('scan-progress')
  window.electronAPI.removeAllListeners('scan-state-changed')
})

const loadMore = async () => {
  // This is now handled by background loading, but we keep it for manual trigger if needed
  if (!musicStore.loading && musicStore.hasMore) {
    await musicStore.loadMusic(musicStore.currentOffset, 20)
  }
}

const handleScan = async () => {
  try {
    // 1. 重新加载目录列表以确保状态同步
    await dirStore.loadDirectories()

    // 2. 获取所有启用的目录（直接从后端获取最新数据，确保数据一致性）
    // 如果第一次获取不到，稍等片刻再试一次（处理数据库写入延迟）
    let enabledDirs = await dirStore.getEnabledDirectories()
    if (!enabledDirs || enabledDirs.length === 0) {
      // 等待一小段时间，确保数据库写入完成
      await new Promise(resolve => setTimeout(resolve, 100))
      enabledDirs = await dirStore.getEnabledDirectories()
    }

    // 3. 检查是否有启用的目录
    if (!enabledDirs || enabledDirs.length === 0) {
      alert('请先添加扫描目录\n\n点击"扫描目录管理"按钮添加音乐目录')
      return
    }

    // 4. 直接开始扫描所有启用的目录
    isScanning.value = true
    try {
      await window.electronAPI.scanAllDirectories({
        concurrency: 10,
        fileTypes: ['.mp3', '.flac', '.aac', '.wav', '.ogg', '.m4a', '.ape', '.wma'],
        excludePaths: [],
        forceRescan: false
      })

      // 扫描完成后刷新列表
      await musicStore.loadMusic(0, 20, true)
      startBackgroundLoading()
    } catch (error: any) {
      if (error.message !== '扫描已取消') {
        alert(`扫描失败: ${error.message}`)
      }
    } finally {
      isScanning.value = false
      scanProgress.value = null
    }
  } catch (error: any) {
    console.error('扫描过程出错:', error)
    alert(`操作失败: ${error.message || '未知错误'}`)
    isScanning.value = false
    scanProgress.value = null
  }
}

const handleClearAll = async () => {
  if (!confirm('确定要清除所有本地音乐吗？\n\n这将清空本地音乐列表。\n不会影响收藏夹、歌单和播放历史。\n\n此操作不可恢复！')) {
    return
  }

  try {
    await window.electronAPI.clearLocalMusic()
    // 刷新列表
    await musicStore.loadMusic(0, 20, true)
  } catch (error: any) {
    alert(`清除失败: ${error.message}`)
  }
}

const handlePlayAll = async () => {
  if (totalCount.value === 0) return

  try {
    // 获取所有歌曲
    const allSongs = await window.electronAPI.getMusicList(0, totalCount.value)
    playerStore.queue = allSongs
    playerStore.setCurrentQueueIndex(0)
    await play(allSongs[0])
  } catch (error) {
    console.error('播放全部失败:', error)
  }
}

const handleSongsUpdated = () => {
  // 这个是从 SongList 发出的事件，只需要触发数据更新
  // 实际的更新由 music-metadata-updated 事件处理
}

// 监听元数据更新事件，只更新被修改的歌曲
const handleMetadataUpdate = (event: CustomEvent) => {
  const updatedMusic = event.detail
  if (!updatedMusic) return

  // 在当前列表中查找并更新这首歌
  const index = musicStore.musicList.findIndex(m => m.id === updatedMusic.id)
  if (index !== -1) {
    // 直接更新列表中的这首歌
    musicStore.musicList[index] = { ...musicStore.musicList[index], ...updatedMusic }
  }
}

const playMusic = async (music: MusicItem) => {
  // 检查歌曲是否已在队列中
  const existingIndex = playerStore.queue.findIndex(m => m.id === music.id)
  
  if (existingIndex >= 0) {
    // 如果已在队列中，直接切换到该歌曲并播放
    playerStore.setCurrentQueueIndex(existingIndex)
    await play(music)
  } else {
    // 如果不在队列中，只添加这一首歌曲到队列并播放
    playerStore.addToQueue(music)
    const newIndex = playerStore.queue.length - 1
    playerStore.setCurrentQueueIndex(newIndex)
    await play(music)
  }
}

// ========== 目录管理相关函数 ==========

// 打开目录管理对话框
const openDirManageDialog = async () => {
  showDirManageDialog.value = true
  try {
    await dirStore.loadDirectories({ sortBy: 'display_order', order: 'ASC' })
  } catch (error) {
    console.error('加载目录列表失败:', error)
  }
}

// 关闭目录管理对话框
const closeDirManageDialog = () => {
  showDirManageDialog.value = false
}

// 添加目录
const handleAddDir = async () => {
  if (!newDirPath.value.trim()) {
    alert('请输入目录路径')
    return
  }

  // 如果目录已存在，不应该执行到这里（按钮已禁用），但为了安全还是检查一下
  if (isDirExists.value) {
    alert('该目录已存在，请选择其他目录')
    return
  }

  try {
    // 验证路径
    const validation = await dirStore.validatePath(newDirPath.value.trim())
    if (!validation.valid) {
      alert(validation.error || '路径无效')
      return
    }

    // 再次检查是否已存在（防止并发问题）
    const existing = dirStore.directories.find(d => d.path === newDirPath.value.trim())
    if (existing) {
      alert('该目录已存在')
      return
    }

    // 检查数量限制
    if (dirStore.directories.length >= 20) {
      alert('最多只能添加20个扫描目录')
      return
    }

    await dirStore.addDirectory(newDirPath.value.trim())
    // 确保目录已保存到数据库后再继续
    await dirStore.loadDirectories()
    newDirPath.value = ''
    showAddDirDialog.value = false
  } catch (error: any) {
    alert(error.message || '添加目录失败')
  }
}

// 编辑目录
const editDir = (dir: { id: number; path: string; display_order: number; enabled: boolean }) => {
  editingDir.value = { ...dir }
  newDirPath.value = dir.path
  showAddDirDialog.value = true
}

// 保存编辑
const handleSaveEdit = async () => {
  if (!editingDir.value || !newDirPath.value.trim()) {
    alert('请输入目录路径')
    return
  }

  try {
    const validation = await dirStore.validatePath(newDirPath.value.trim())
    if (!validation.valid) {
      alert(validation.error || '路径无效')
      return
    }

    // 检查是否与其他目录重复
    const existing = dirStore.directories.find(
      d => d.path === newDirPath.value.trim() && d.id !== editingDir.value!.id
    )
    if (existing) {
      alert('该目录已存在')
      return
    }

    await dirStore.updateDirectory(editingDir.value.id, {
      path: newDirPath.value.trim()
    })
    newDirPath.value = ''
    editingDir.value = null
    showAddDirDialog.value = false
    alert('目录更新成功')
  } catch (error: any) {
    alert(error.message || '更新目录失败')
  }
}

// 删除目录
const deleteDir = (dir: { id: number; path: string }) => {
  dirToDelete.value = dir
  showDeleteConfirmDialog.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!dirToDelete.value) return

  try {
    // 只删除目录配置，不删除已扫描的音乐文件
    await dirStore.deleteDirectory(dirToDelete.value.id, { removeScannedFiles: false })
    alert('目录删除成功')
    cancelDelete()
  } catch (error: any) {
    alert(error.message || '删除目录失败')
  }
}

// 取消删除
const cancelDelete = () => {
  showDeleteConfirmDialog.value = false
  dirToDelete.value = null
}

// 切换启用/禁用
const toggleDirEnabled = async (dir: { id: number; enabled: boolean }) => {
  try {
    await dirStore.updateDirectory(dir.id, { enabled: !dir.enabled })
  } catch (error: any) {
    alert(error.message || '更新目录状态失败')
  }
}

// 关闭添加/编辑目录对话框
const closeAddDirDialog = () => {
  showAddDirDialog.value = false
  editingDir.value = null
  newDirPath.value = ''
}

// 检查目录是否存在（用于实时检查）
const checkDirExists = () => {
  // 通过 computed 自动检查，这里可以添加额外逻辑
}

// 选择目录路径
const selectDirPath = async () => {
  try {
    const paths = await window.electronAPI.selectMusicFolder()
    if (paths && paths.length > 0) {
      newDirPath.value = paths[0]
      // 选择后自动检查是否存在
      // computed 会自动更新
    }
  } catch (error) {
    console.error('选择目录失败:', error)
  }
}
</script>

<style scoped>
.local-music-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.list-header {
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: var(--font-size-4xl);
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.stats {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.btn-primary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-primary:hover {
  background: var(--color-primary-light);
  transform: translateY(-1px);
}

.btn-primary:disabled {
  background: var(--color-primary-light);
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  padding: var(--spacing-md) var(--spacing-lg);
  background: transparent;
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-base) var(--transition-timing);
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  text-decoration: underline;
  margin-top: var(--spacing-sm);
}

.music-list-container {
  flex: 1;
  overflow: hidden;
}

/* 扫描进度条样式 */
.scan-progress-bar {
  padding: var(--spacing-md) var(--spacing-xl);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.current-file {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}

.progress-track {
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.2s ease;
}

/* 目录管理对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dir-manage-dialog {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  min-width: 750px;
  max-width: 1000px;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xl);
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.dialog-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-base);
  transition: all var(--transition-base);
}

.dialog-close:hover {
  background: var(--bg-secondary);
  color: var(--text-color);
}

.dialog-body {
  padding: var(--spacing-xl);
  overflow-y: auto;
  flex: 1;
}

.dir-manage-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.dir-limit-hint {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.dir-loading,
.dir-empty {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.dir-list {
  margin-top: var(--spacing-md);
}

.dir-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  border: 1px solid var(--border-color);
  transition: all var(--transition-base);
}

.dir-item:hover {
  border-color: var(--color-primary);
  background: var(--hover-bg);
}

.dir-item.disabled {
  opacity: 0.6;
}

.dir-content {
  flex: 1;
  min-width: 0;
}

.dir-path {
  font-size: var(--font-size-sm);
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
  word-break: break-all;
}

.dir-meta {
  display: flex;
  gap: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.dir-status.enabled {
  color: var(--color-success);
}

.dir-status.disabled {
  color: var(--text-secondary);
}

.dir-actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-left: var(--spacing-md);
}

.btn-icon {
  padding: var(--spacing-xs);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-base);
  color: var(--text-color);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: var(--hover-bg);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.btn-icon.danger:hover {
  border-color: var(--color-error);
  color: var(--color-error);
}

/* 添加/编辑目录对话框 */
.dialog-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  min-width: 500px;
  max-width: 700px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 删除确认对话框 */
.delete-confirm-dialog {
  min-width: 450px;
  max-width: 600px;
}

.delete-confirm-text {
  font-size: var(--font-size-base);
  color: var(--text-color);
  margin-bottom: var(--spacing-md);
  line-height: 1.6;
}

.delete-confirm-text strong {
  color: var(--text-color);
  word-break: break-all;
}

.delete-confirm-hint {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.btn-danger {
  background: var(--color-primary);
  color: white;
}

.btn-danger:hover {
  background: var(--color-primary-light);
  opacity: 0.9;
}

.form-group {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: var(--spacing-xs);
}

.form-input-group {
  display: flex;
  gap: var(--spacing-sm);
}

.form-input {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-base);
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  outline: none;
  width: 100%;
}

.form-input-full {
  width: 100%;
  margin-bottom: var(--spacing-sm);
}

.form-input-btn {
  width: 100%;
}

.form-input:focus {
  border-color: var(--color-primary);
}

.form-input-error {
  border-color: var(--color-error);
}

.form-input-error:focus {
  border-color: var(--color-error);
}

.form-error-hint {
  color: var(--color-error);
  font-size: var(--font-size-xs);
  margin-top: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
}
</style>
