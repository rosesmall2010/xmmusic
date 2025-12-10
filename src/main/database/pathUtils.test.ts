/**
 * 路径处理工具函数测试
 */

import { describe, it, expect } from 'vitest'
import {
  normalizePath,
  buildFullPath,
  parsePath,
  buildPathFromMusicRecord
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
    expect(normalizePath('C:/', 'win32')).toBe('C:/')
  })

  it('应该处理多个连续分隔符', () => {
    expect(normalizePath('/Users//name///Music', 'darwin')).toBe('/Users/name/Music')
    expect(normalizePath('C:\\\\Users\\\\Music', 'win32')).toBe('C:/Users/Music')
  })
})

describe('buildFullPath', () => {
  it('应该构建完整路径', () => {
    expect(buildFullPath('C:/Music', 'song.mp3', 'win32')).toBe('C:/Music/song.mp3')
    expect(buildFullPath('/Users/Music', 'album/song.mp3', 'darwin')).toBe('/Users/Music/album/song.mp3')
  })

  it('应该处理目录路径末尾的斜杠', () => {
    expect(buildFullPath('C:/Music/', 'song.mp3', 'win32')).toBe('C:/Music/song.mp3')
    expect(buildFullPath('/Users/Music/', 'song.mp3', 'darwin')).toBe('/Users/Music/song.mp3')
  })

  it('应该处理文件名开头的斜杠', () => {
    expect(buildFullPath('C:/Music', '/song.mp3', 'win32')).toBe('C:/Music/song.mp3')
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
    expect(result.dirPath).toBe('/')
    expect(result.fileName).toBe('song.mp3')
  })

  it('应该处理嵌套目录', () => {
    const result = parsePath('/Users/Music/Album/Song.mp3', 'darwin')
    expect(result.dirPath).toBe('/Users/Music/Album')
    expect(result.fileName).toBe('Song.mp3')
  })
})

describe('buildPathFromMusicRecord', () => {
  it('应该从音乐记录构建完整路径', () => {
    const record = {
      dir_path: 'C:/Music',
      file_name: 'song.mp3'
    }
    expect(buildPathFromMusicRecord(record, 'win32')).toBe('C:/Music/song.mp3')
  })

  it('应该处理目录路径末尾的斜杠', () => {
    const record = {
      dir_path: 'C:/Music/',
      file_name: 'song.mp3'
    }
    expect(buildPathFromMusicRecord(record, 'win32')).toBe('C:/Music/song.mp3')
  })

  it('应该处理根目录', () => {
    const record = {
      dir_path: '/',
      file_name: 'song.mp3'
    }
    expect(buildPathFromMusicRecord(record, 'darwin')).toBe('/song.mp3')
  })
})
