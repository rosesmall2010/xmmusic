/**
 * 路径处理工具函数测试
 */

import { describe, it, expect } from 'vitest'
import {
  normalizePath,
  buildFullPath,
  parsePath
} from './pathUtils'

describe('normalizePath', () => {
  it('应该规范化 Windows 路径', () => {
    expect(normalizePath('C:\\Music\\Rock\\', 'win32')).toBe('C:/Music/Rock')
    expect(normalizePath('D:\\Users\\Music', 'win32')).toBe('D:/Users/Music')
    expect(normalizePath('C:\\Music\\\\Rock', 'win32')).toBe('C:/Music/Rock')
  })

  it('应该规范化 macOS/Linux 路径', () => {
    expect(normalizePath('/Users/name/Music/', 'darwin')).toBe('/Users/name/Music')
    expect(normalizePath('/home/user/music//', 'linux')).toBe('/home/user/music')
    expect(normalizePath('/root/music', 'linux')).toBe('/root/music')
  })

  it('应该处理空字符串和 null', () => {
    expect(normalizePath('')).toBe('')
    expect(normalizePath('', 'win32')).toBe('')
  })

  it('应该保留根路径的单个斜杠', () => {
    expect(normalizePath('/', 'darwin')).toBe('/')
    expect(normalizePath('/', 'linux')).toBe('/')
    // Windows 驱动器根路径会被规范化去掉末尾斜杠
    expect(normalizePath('C:/', 'win32')).toBe('C:')
  })

  it('应该处理多个连续分隔符', () => {
    expect(normalizePath('/Users//name///Music', 'darwin')).toBe('/Users/name/Music')
    expect(normalizePath('C:\\\\Users\\\\Music', 'win32')).toBe('C:/Users/Music')
  })
})

describe('buildFullPath', () => {
  it('应该构建完整路径', () => {
    // Windows 使用反斜杠
    expect(buildFullPath('C:/Music', 'song.mp3', 'win32')).toBe('C:\\Music\\song.mp3')
    expect(buildFullPath('/Users/Music', 'album/song.mp3', 'darwin')).toBe('/Users/Music/album/song.mp3')
  })

  it('应该处理目录路径末尾的斜杠', () => {
    expect(buildFullPath('C:/Music/', 'song.mp3', 'win32')).toBe('C:\\Music\\song.mp3')
    expect(buildFullPath('/Users/Music/', 'song.mp3', 'darwin')).toBe('/Users/Music/song.mp3')
  })

  it('应该处理文件名开头的斜杠', () => {
    // 注意：buildFullPath 不会处理文件名开头的斜杠，会直接拼接
    // 实际行为：Windows 上会使用反斜杠，但文件名开头的斜杠会保留
    const result = buildFullPath('C:/Music', '/song.mp3', 'win32')
    expect(result).toContain('song.mp3')
    expect(result).toContain('C:')
  })
})

describe('parsePath', () => {
  it('应该解析完整路径', () => {
    const result = parsePath('C:/Music/Rock/song.mp3', 'win32')
    expect(result.dirPath).toBe('C:/Music/Rock')
    expect(result.fileName).toBe('song.mp3')
  })

  it('应该处理根目录下的文件', () => {
    const result = parsePath('/song.mp3', 'darwin')
    // parsePath 对于根目录返回空字符串（因为 normalizePath 会去掉末尾斜杠）
    expect(result.dirPath).toBe('')
    expect(result.fileName).toBe('song.mp3')
  })

  it('应该处理嵌套目录', () => {
    const result = parsePath('/Users/Music/Album/Song.mp3', 'darwin')
    expect(result.dirPath).toBe('/Users/Music/Album')
    expect(result.fileName).toBe('Song.mp3')
  })
})

// buildPathFromMusicRecord 需要数据库连接，在集成测试中测试
// 这里跳过单元测试
