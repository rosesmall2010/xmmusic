import { Howl } from 'howler'
import { usePlayerStore } from '@/stores/player'
import { useEqualizer } from '@/composables/useEqualizer'
import { toLocalFileUrl } from '@/utils/media'
import type { MusicItem } from '@shared/types/music'

/**
 * 播放引擎对齐 EchoVault（Electron 38，Win11 可播）：
 * - 单个永久 <audio>，切歌只换 src，绝不销毁重建
 * - 启动即 createMediaElementSource，始终经 AudioContext → destination 出声
 * - 播放前 audioCtx.resume()，再 audio.play()
 */
let howl: Howl | null = null
let progressTimer: NodeJS.Timeout | null = null
let audioElement: HTMLAudioElement | null = null
let useNativeAudio = false
let isPlaybackInProgress = false
let handlersBound = false

export function usePlayer() {
  const playerStore = usePlayerStore()
  const equalizer = useEqualizer()

  /** 确保永久 Audio 已创建，并立刻挂上 Web Audio 图（EchoVault 同款） */
  const ensurePersistentAudio = () => {
    if (!audioElement) {
      const existing = document.getElementById('xmmusic-audio-player') as HTMLAudioElement | null
      if (existing) {
        audioElement = existing
      } else {
        audioElement = new Audio()
        audioElement.id = 'xmmusic-audio-player'
        audioElement.style.display = 'none'
        audioElement.preload = 'auto'
        audioElement.crossOrigin = 'anonymous'
        document.body.appendChild(audioElement)
        console.log('✅ 永久音频元素已创建（EchoVault 模式）')
      }
    }

    audioElement.crossOrigin = 'anonymous'
    // 始终接管：关 EQ 时图为 source→destination 直通，开 EQ 时经滤波器
    equalizer.initAudioContext(audioElement)
    bindAudioHandlers()
    return audioElement
  }

  const bindAudioHandlers = () => {
    if (!audioElement || handlersBound) return
    handlersBound = true

    audioElement.onloadedmetadata = () => {
      if (!audioElement) return
      console.log('✅ 原生 Audio 加载成功, duration=', audioElement.duration)
      playerStore.duration = audioElement.duration
    }

    audioElement.onplay = () => {
      console.log('▶️ 原生 Audio 开始播放')
      playerStore.isPlaying = true
      startProgressUpdate()
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
        if (next.index >= 0) playerStore.setCurrentQueueIndex(next.index)
        setTimeout(async () => {
          await play(next.music)
        }, 500)
      }
    }

    audioElement.onerror = () => {
      const error = audioElement?.error
      console.error('❌ 原生 Audio 错误', {
        code: error?.code,
        message: error?.message,
        src: audioElement?.src
      })
    }
  }

  const playWithNativeAudio = async (
    music: MusicItem,
    options?: { resumeAt?: number; autoplay?: boolean }
  ) => {
    console.log('🔄 EchoVault 模式播放')
    const el = ensurePersistentAudio()
    const resumeAt = options?.resumeAt
    const autoplay = options?.autoplay !== false
    const localFileUrl = toLocalFileUrl(music.filePath)

    console.log('🔗 使用协议:', localFileUrl)
    console.log('📁 原始路径:', music.filePath)

    // 对齐 EchoVault playTrack：pause → 换 src → load → resume ctx → play
    el.pause()
    el.crossOrigin = 'anonymous'
    el.src = localFileUrl
    el.load()
    el.volume = playerStore.volume / 100

    // 元数据就绪后再 seek（断点续播）
    if (typeof resumeAt === 'number' && resumeAt > 0 && Number.isFinite(resumeAt)) {
      await new Promise<void>((resolve) => {
        const onMeta = () => {
          el.removeEventListener('loadedmetadata', onMeta)
          try {
            el.currentTime = Math.min(resumeAt, el.duration || resumeAt)
            playerStore.currentTime = el.currentTime
          } catch {
            // ignore
          }
          resolve()
        }
        if (el.readyState >= 1) onMeta()
        else el.addEventListener('loadedmetadata', onMeta)
        // 避免永久挂起
        setTimeout(resolve, 3000)
      })
    }

    playerStore.currentMusic = music
    useNativeAudio = true

    await equalizer.resumeContext()

    if (autoplay) {
      await el.play()
    } else {
      playerStore.isPlaying = false
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
            if (next.index >= 0) playerStore.setCurrentQueueIndex(next.index)
            setTimeout(async () => {
              await play(next.music)
            }, 500)
          }
        },
        onloaderror: async (_id, error) => {
          console.error('❌ Howler 加载失败', error)
          let errorMsg = '未知错误'
          switch (error) {
            case 1: errorMsg = '中止加载'; break
            case 2: errorMsg = '网络错误（可能是路径问题）'; break
            case 3: errorMsg = '解码错误'; break
            case 4: errorMsg = '不支持的格式或文件损坏'; break
          }

          try {
            await window.electronAPI.updateMusicPlayStatus(music.id, false, errorMsg)
          } catch (err) {
            console.error('❌ 更新播放状态失败:', err)
          }

          playerStore.isPlaying = false
          stopProgressUpdate()
          isPlaybackInProgress = false

          const next = playerStore.getNextSkippingCurrent()
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
      playerStore.isPlaying = false
      stopProgressUpdate()
      isPlaybackInProgress = false

      const next = playerStore.getNextSkippingCurrent()
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

  const resume = async () => {
    if (useNativeAudio && audioElement) {
      await equalizer.resumeContext()
      await audioElement.play()
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
    } else {
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
    /** 兼容旧调用：EchoVault 模式下无需重建元素，仅确保图已挂接并 resume */
    restoreNativeAudioPath: async () => {
      const el = ensurePersistentAudio()
      await equalizer.resumeContext()
      if (playerStore.isPlaying && el.paused) {
        try {
          await el.play()
        } catch {
          // ignore
        }
      }
    },
    getAudioElement: () => audioElement
  }
}
