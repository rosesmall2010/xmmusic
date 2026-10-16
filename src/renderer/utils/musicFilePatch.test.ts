import { describe, expect, it, beforeEach } from 'vitest'
import {
  mergeMusicUpdate,
  overlayMusicList,
  rememberMusicFilePatch,
  resetMusicFilePatches
} from './musicFilePatch'

describe('musicFilePatch', () => {
  beforeEach(() => {
    resetMusicFilePatches()
  })

  it('同一首歌在列表里出现多次时全部改掉', () => {
    const list = [
      { id: 1, fileName: 'a.mp3', filePath: '/m/a.mp3', title: '旧' },
      { id: 2, fileName: 'b.mp3', filePath: '/m/b.mp3', title: '别的' },
      { id: 1, fileName: 'a.mp3', filePath: '/m/a.mp3', title: '旧' }
    ]
    const next = mergeMusicUpdate(list, {
      id: 1,
      fileName: '歌手 - 歌名.mp3',
      filePath: '/m/歌手 - 歌名.mp3',
      lyricsPath: '/m/歌手 - 歌名.lrc'
    })
    expect(next?.map((item) => item.fileName)).toEqual([
      '歌手 - 歌名.mp3',
      'b.mp3',
      '歌手 - 歌名.mp3'
    ])
    expect(next?.[0].title).toBe('旧')
    expect(next?.[2].filePath).toBe('/m/歌手 - 歌名.mp3')
  })

  it('还没进列表的分页，拉到旧文件名时改用已记住的新文件名', () => {
    rememberMusicFilePatch({
      id: 7,
      fileName: '新.flac',
      filePath: '/m/新.flac',
      lyricsPath: null
    })
    const page = overlayMusicList([
      { id: 7, fileName: '旧.flac', filePath: '/m/旧.flac', lyricsPath: '/m/旧.lrc', favorite: true },
      { id: 8, fileName: '保持.mp3', filePath: '/m/保持.mp3', lyricsPath: null, favorite: false }
    ])
    expect(page[0].fileName).toBe('新.flac')
    expect(page[0].filePath).toBe('/m/新.flac')
    expect(page[0].lyricsPath).toBeNull()
    expect(page[0].favorite).toBe(true)
    expect(page[1].fileName).toBe('保持.mp3')
  })
})
