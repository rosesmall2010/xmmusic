import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const settingsDir = app.getPath('userData')
const settingsFile = join(settingsDir, 'xmmusic-settings.json')

function ensureDir() {
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true })
  }
}

export function loadSettingsFromFile<T extends Record<string, any> = Record<string, any>>(): T {
  try {
    ensureDir()
    if (!existsSync(settingsFile)) {
      return {} as T
    }
    const raw = readFileSync(settingsFile, 'utf-8')
    return JSON.parse(raw) as T
  } catch (error) {
    console.error('[settingsStore] Failed to load settings file:', error)
    return {} as T
  }
}

export function saveSettingsToFile(partial: Record<string, any>): void {
  try {
    const current = loadSettingsFromFile()
    const merged = { ...current, ...partial }
    ensureDir()
    writeFileSync(settingsFile, JSON.stringify(merged, null, 2), 'utf-8')
  } catch (error) {
    console.error('[settingsStore] Failed to save settings file:', error)
  }
}
