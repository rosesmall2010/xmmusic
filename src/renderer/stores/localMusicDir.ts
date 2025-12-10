import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface LocalMusicDir {
  id: number
  path: string
  display_order: number
  enabled: boolean
  created_at: string
}

export const useLocalMusicDirStore = defineStore('localMusicDir', () => {
  const directories = ref<LocalMusicDir[]>([])
  const loading = ref(false)

  // 计算属性：启用的目录
  const enabledDirs = computed(() => {
    return directories.value
      .filter(dir => dir.enabled)
      .sort((a, b) => a.display_order - b.display_order)
  })

  // 计算属性：禁用的目录
  const disabledDirs = computed(() => {
    return directories.value
      .filter(dir => !dir.enabled)
      .sort((a, b) => a.display_order - b.display_order)
  })

  // 加载所有目录
  async function loadDirectories(options?: {
    enabled?: boolean
    sortBy?: 'display_order' | 'created_at' | 'path'
    order?: 'ASC' | 'DESC'
  }) {
    loading.value = true
    try {
      directories.value = await window.electronAPI.getAllLocalMusicDirs(options)
    } catch (error) {
      console.error('加载目录列表失败:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 添加目录
  async function addDirectory(path: string, displayOrder?: number) {
    try {
      const id = await window.electronAPI.addLocalMusicDir(path, displayOrder)
      await loadDirectories() // 重新加载列表
      return id
    } catch (error) {
      console.error('添加目录失败:', error)
      throw error
    }
  }

  // 删除目录
  async function deleteDirectory(id: number, options?: { removeScannedFiles?: boolean }) {
    try {
      await window.electronAPI.deleteLocalMusicDir(id, options)
      await loadDirectories() // 重新加载列表
    } catch (error) {
      console.error('删除目录失败:', error)
      throw error
    }
  }

  // 更新目录
  async function updateDirectory(
    id: number,
    updates: { path?: string; display_order?: number; enabled?: boolean }
  ) {
    try {
      await window.electronAPI.updateLocalMusicDir(id, updates)
      await loadDirectories() // 重新加载列表
    } catch (error) {
      console.error('更新目录失败:', error)
      throw error
    }
  }

  // 更新目录顺序
  async function updateOrders(orders: Record<number, number>) {
    try {
      await window.electronAPI.updateLocalMusicDirOrders(orders)
      await loadDirectories() // 重新加载列表
    } catch (error) {
      console.error('更新目录顺序失败:', error)
      throw error
    }
  }

  // 验证目录路径
  async function validatePath(path: string) {
    try {
      return await window.electronAPI.validateLocalMusicDir(path)
    } catch (error) {
      console.error('验证路径失败:', error)
      return { valid: false, error: '验证失败' }
    }
  }

  // 获取启用的目录（用于扫描）
  async function getEnabledDirectories() {
    try {
      return await window.electronAPI.getEnabledLocalMusicDirs()
    } catch (error) {
      console.error('获取启用的目录失败:', error)
      throw error
    }
  }

  return {
    directories,
    loading,
    enabledDirs,
    disabledDirs,
    loadDirectories,
    addDirectory,
    deleteDirectory,
    updateDirectory,
    updateOrders,
    validatePath,
    getEnabledDirectories
  }
})
