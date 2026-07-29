import { Howl } from 'howler'
import { usePlayerStore } from '@/stores/player'
import { useEqualizer } from '@/composables/useEqualizer'
import { toLocalFileUrl } from '@/utils/media'
import type { MusicItem } from '@shared/types/music'

let howl: Howl | null = null
let progressTimer: NodeJS.Timeout | null = null
let audioElement: HTMLAudioElement | null = null
let useNativeAudio = false
let isPlaybackInProgress = false // 播放锁，防止并发播放
let restoreHookBound = false
let isRestoringNative = false

export function usePlayer() {
  const playerStore = usePlayerStore()
  const equalizer = useEqualizer()

  /** 绑定：关音效后重建未被捕获的 Audio，恢复系统级直出音质 */
  const bindRestoreNativeHook = () => {
    if (restoreHookBound || typeof window === 'undefined') return
    restoreHookBound = true
    window.addEventListener('xmmusic:restore-native-audio', () => {
      void restoreNativeAudioPath()
    })
  }
  bindRestoreNativeHook()

  const discardAudioElement = (el: HTMLAudioElement | null) => {
    if (!el) return
    try {
      el.pause()
      el.onplay = null
      el.onpause = null
      el.onended = null
      el.onerror = null
      el.onloadedmetadata = null
      el.removeAttribute('src')
      el.load()
      el.remove()
    } catch {
      // ignore
    }
  }

  /**
   * Web Audio 释放后，旧 media 元素无法再直出扬声器。
   * 重建元素并尽量从断点续播。
   */
  const restoreNativeAudioPath = async () => {
    if (isRestoringNative) return
    isRestoringNative = true
    try {
      if (equalizer.isCaptured()) {
        await equalizer.releaseCapture()
      }

      const old =
        audioElement ||
        (document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null)
      const music = playerStore.currentMusic
      const resumeAt = old?.currentTime ?? playerStore.currentTime ?? 0
      const wasPlaying = old ? !old.paused : playerStore.isPlaying

      discardAudioElement(old)
      audioElement = null
      useNativeAudio = true

      if (!music) return

      await playWithNativeAudio(music, { resumeAt, autoplay: wasPlaying })
      console.log('✅ 已恢复原生 Audio 直出路径')
    } catch (error) {
      console.error('❌ 恢复原生音频路径失败:', error)
    } finally {
      isRestoringNative = false
    }
  }

  const playWithNativeAudio = async (
    music: MusicItem,
    options?: { resumeAt?: number; autoplay?: boolean }
  ) => {
    console.log('🔄 尝试使用原生 Audio 播放')

    // 停止并清理旧的音频
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
    }

    let hasStartedPlaying = false
    let loadTimeout: NodeJS.Timeout | null = null
    const resumeAt = options?.resumeAt
    const autoplay = options?.autoplay !== false

    // 若当前 DOM 元素曾被 MediaElementSource 捕获，必须丢弃重建
    if (!audioElement) {
      const existing = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
      if (existing && equalizer.isCaptured()) {
        discardAudioElement(existing)
      } else if (existing) {
        audioElement = existing
      }
    }

    if (!audioElement) {
      audioElement = new Audio()
      audioElement.id = 'xmmusic-audio-player'
      audioElement.style.display = 'none'
      audioElement.preload = 'auto'
      document.body.appendChild(audioElement)
      console.log('✅ 音频元素已添加到 DOM')
    }

    // 未开音效时不设 crossOrigin，走原生直出；开启音效时由均衡器补 CORS 并接管
    const needWebAudio = equalizer.enabled.value
    const localFileUrl = toLocalFileUrl(music.filePath)
    console.log('🔗 使用协议:', localFileUrl)
    console.log('📁 原始路径:', music.filePath)

    if (needWebAudio) {
      audioElement.crossOrigin = 'anonymous'
    } else {
      audioElement.removeAttribute('crossorigin')
    }

    audioElement.preload = 'auto'
    audioElement.src = localFileUrl
    audioElement.volume = playerStore.volume / 100

    audioElement.onloadedmetadata = () => {
      console.log('✅ 原生 Audio 加载成功')
      playerStore.duration = audioElement!.duration
      if (typeof resumeAt === 'number' && resumeAt > 0 && Number.isFinite(resumeAt)) {
        try {
          audioElement!.currentTime = Math.min(resumeAt, audioElement!.duration || resumeAt)
          playerStore.currentTime = audioElement!.currentTime
        } catch {
          // ignore seek errors
        }
      }
      if (loadTimeout) {
        clearTimeout(loadTimeout)
        loadTimeout = null
      }
    }

    audioElement.onplay = () => {
      console.log('▶️ 原生 Audio 开始播放')
      hasStartedPlaying = true
      playerStore.isPlaying = true
      startProgressUpdate()
      if (loadTimeout) {
        clearTimeout(loadTimeout)
        loadTimeout = null
      }
      // 仅在音效开启时接管 Web Audio（避免频谱可视化拖垮音质）
      if (equalizer.enabled.value) {
        equalizer.initAudioContext(audioElement!)
      }
    }

    audioElement.onpause = () => {
      playerStore.isPlaying = false
      stopProgressUpdate()
    }

    audioElement.onended = () => {
      playerStore.isPlaying = false
      stopProgressUpdate()
      const next = playerStore.getNext()
      if (next) {
        playerStore.setCurrentQueueIndex(next.index)
        setTimeout(async () => {
          await play(next.music)
        }, 500)
      }
    }

    audioElement.onerror = () => {
      if (!hasStartedPlaying) {
        const error = audioElement?.error
        console.error('❌ 原生 Audio 加载失败')
        console.error('   错误代码:', error?.code)
        console.error('   错误消息:', error?.message)
        console.error('   文件路径:', music.filePath)
        console.error('   URL:', localFileUrl)
        if (error) {
          let errorMsg = '未知错误'
          switch (error.code) {
            case 1: errorMsg = 'MEDIA_ERR_ABORTED - 用户中止'; break
            case 2: errorMsg = 'MEDIA_ERR_NETWORK - 网络错误'; break
            case 3: errorMsg = 'MEDIA_ERR_DECODE - 解码错误'; break
            case 4: errorMsg = 'MEDIA_ERR_SRC_NOT_SUPPORTED - 格式不支持或文件损坏'; break
          }
          console.error('   错误详情:', errorMsg)
        }
        if (loadTimeout) clearTimeout(loadTimeout)
      }
    }

    try {
      playerStore.currentMusic = music
      useNativeAudio = true
      if (autoplay) {
        await audioElement.play()
      } else {
        playerStore.isPlaying = false
      }
    } catch (error) {
      console.error('❌ audioElement.play() 调用失败:', error)
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
      throw error
    }
  }

  const play = async (music: MusicItem) => {
    if (isPlaybackInProgress) {
      console.log('⏭️ 播放正在进行中，忽略此次请求')
      return
    }

    try {
      isPlaybackInProgress = true

      if (howl) {
        howl.unload()
        howl = null
      }
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
      stopProgressUpdate()
      playerStore.isPlaying = false

      await window.electronAPI.recordPlay(music.id)
      window.dispatchEvent(new Event('recent-plays-updated'))

      console.log('🎵 播放音乐:', music.title)
      console.log('📁 原始路径:', music.filePath)
      console.log('📝 文件扩展名:', music.fileExtension)

      try {
        await playWithNativeAudio(music)
        console.log('✅ 使用原生 Audio 播放成功')
        isPlaybackInProgress = false
        return
      } catch (error) {
        console.log('⚠️ 原生 Audio 失败，尝试 Howler.js:', error)
      }

      const localFileUrl = toLocalFileUrl(music.filePath)
      console.log('🔗 Howler 使用协议:', localFileUrl)
      console.log('📁 原始路径:', music.filePath)
      howl = new Howl({
        src: [localFileUrl],
        html5: true,
        format: [music.fileExtension.replace('.', '').toLowerCase()],
        volume: playerStore.volume / 100,
        onload: () => {
          console.log('✅ Howler 加载成功')
          playerStore.duration = howl!.duration()
        },
        onplay: () => {
          console.log('▶️ Howler 开始播放')
          playerStore.isPlaying = true
          startProgressUpdate()
          isPlaybackInProgress = false
        },
        onpause: () => {
          playerStore.isPlaying = false
          stopProgressUpdate()
        },
        onend: () => {
          playerStore.isPlaying = false
          stopProgressUpdate()
          const next = playerStore.getNext()
          if (next) {
            playerStore.setCurrentQueueIndex(next.index)
            setTimeout(async () => {
              await play(next.music)
            }, 500)
          }
        },
        onloaderror: async (_id, error) => {
          console.error('❌ Howler 加载失败')
          console.error('   错误代码:', error)
          console.error('   文件路径:', music.filePath)
          console.error('   URL:', localFileUrl)
          console.error('   文件扩展名:', music.fileExtension)

          let errorMsg = '未知错误'
          switch (error) {
            case 1: errorMsg = '中止加载'; break
            case 2: errorMsg = '网络错误（可能是路径问题）'; break
            case 3: errorMsg = '解码错误'; break
            case 4: errorMsg = '不支持的格式或文件损坏'; break
          }

          console.error(`跳过损坏文件: ${music.title} - ${errorMsg}`)

          try {
            await window.electronAPI.updateMusicPlayStatus(music.id, false, errorMsg)
            console.log(`✅ 已标记文件为不可播放: ${music.title} - ${errorMsg}`)
          } catch (err) {
            console.error('❌ 更新播放状态失败:', err)
          }

          playerStore.isPlaying = false
          stopProgressUpdate()
          isPlaybackInProgress = false

          const next = playerStore.getNext()
          if (next) {
            playerStore.setCurrentQueueIndex(next.index)
            setTimeout(async () => {
              await play(next.music)
            }, 1000)
          }
        }
      })

      howl.play()
      playerStore.currentMusic = music
      useNativeAudio = false
    } catch (error) {
      console.error('❌ 播放完全失败:', error)
      console.error('🔄 自动跳到下一首')

      playerStore.isPlaying = false
      stopProgressUpdate()
      isPlaybackInProgress = false

      const next = playerStore.getNext()
      if (next) {
        playerStore.setCurrentQueueIndex(next.index)
        setTimeout(async () => {
          await play(next.music)
        }, 1000)
      }
    }
  }

  const pause = () => {
    if (useNativeAudio && audioElement) {
      audioElement.pause()
    } else {
      howl?.pause()
    }
  }

  const resume = () => {
    if (useNativeAudio && audioElement) {
      audioElement.play()
    } else {
      howl?.play()
    }
  }

  const seek = (time: number) => {
    if (useNativeAudio && audioElement) {
      audioElement.currentTime = time
      playerStore.currentTime = time
    } else if (howl) {
      howl.seek(time)
      playerStore.currentTime = time
    }
  }

  const setVolume = (volume: number) => {
    if (useNativeAudio && audioElement) {
      audioElement.volume = volume / 100
      playerStore.volume = volume
    } else if (howl) {
      howl.volume(volume / 100)
      playerStore.volume = volume
    }
  }

  const startProgressUpdate = () => {
    stopProgressUpdate()
    progressTimer = setInterval(() => {
      if (useNativeAudio && audioElement && !audioElement.paused) {
        playerStore.currentTime = audioElement.currentTime
      } else if (howl && howl.playing()) {
        playerStore.currentTime = howl.seek() as number
      }
    }, 100)
  }

  const stopProgressUpdate = () => {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }

  return {
    play,
    pause,
    resume,
    seek,
    setVolume,
    restoreNativeAudioPath,
    getAudioElement: () => audioElement
  }
}
