import { Howl } from 'howler'
import { usePlayerStore } from '@/stores/player'
import type { MusicItem } from '@shared/types/music'

// 自动播放下一首（在usePlayer函数内部定义）

let howl: Howl | null = null
let progressTimer: NodeJS.Timeout | null = null
let audioElement: HTMLAudioElement | null = null
let useNativeAudio = false
let isPlaybackInProgress = false // 播放锁，防止并发播放

export function usePlayer() {
  const playerStore = usePlayerStore()

  const playWithNativeAudio = async (music: MusicItem) => {
    console.log('🔄 尝试使用原生 Audio 播放')

    // 停止并清理旧的音频
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
      // 不从 DOM 移除，均衡器需要它保持在 DOM 中
    }

    let hasStartedPlaying = false
    let loadTimeout: NodeJS.Timeout | null = null

    // 创建新的 Audio 元素
    if (!audioElement) {
      audioElement = new Audio()
      // 设置固定 ID 供均衡器使用
      audioElement.id = 'xmmusic-audio-player'
      // 隐藏元素（均衡器需要它在 DOM 中）
      audioElement.style.display = 'none'

      // 添加到 DOM（如果还没有）
      if (!document.getElementById('xmmusic-audio-player')) {
        document.body.appendChild(audioElement)
        console.log('✅ 音频元素已添加到 DOM，供均衡器使用')
      }
    }

    // 使用自定义协议访问本地文件
    // 注意：不要使用 encodeURIComponent，因为它会把路径分隔符 / 也编码
    const localFileUrl = `local-file://${music.filePath}`
    console.log('🔗 使用协议:', localFileUrl)
    audioElement.src = localFileUrl
    audioElement.volume = playerStore.volume / 100

    audioElement.onloadedmetadata = () => {
      console.log('✅ 原生 Audio 加载成功')
      playerStore.duration = audioElement!.duration
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
    }

    audioElement.onpause = () => {
      playerStore.isPlaying = false
      stopProgressUpdate()
    }

    audioElement.onended = () => {
      playerStore.isPlaying = false
      stopProgressUpdate()
      // 自动播放下一首（根据播放模式）
      const next = playerStore.getNext()
      if (next) {
        const index = playerStore.queue.findIndex(m => m.id === next.id)
        if (index >= 0) {
          playerStore.setCurrentQueueIndex(index)
          setTimeout(async () => {
            await play(next)
          }, 500)
        }
      }
    }

    audioElement.onerror = (e) => {
      // 只在还没开始播放时才显示错误
      if (!hasStartedPlaying) {
        console.error('❌ 原生 Audio 加载失败:', e)
        // 不立即跳过，等待外层处理（会尝试 Howler.js）
        if (loadTimeout) clearTimeout(loadTimeout)
      }
    }

    try {
      await audioElement.play()
      playerStore.currentMusic = music
      useNativeAudio = true
    } catch (error) {
      console.error('❌ audioElement.play() 调用失败:', error)
      // 清理资源
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
      }
      // throw 让外层 play() 尝试 Howler.js
      throw error
    }
  }

  const play = async (music: MusicItem) => {
    // 检查播放锁，防止并发播放
    if (isPlaybackInProgress) {
      console.log('⏭️ 播放正在进行中，忽略此次请求')
      return
    }

    try {
      // 设置播放锁
      isPlaybackInProgress = true

      // 停止当前播放并清理资源
      if (howl) {
        howl.unload()
        howl = null
      }
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ''
        audioElement = null
      }
      stopProgressUpdate()
      playerStore.isPlaying = false

      // 记录播放
      await window.electronAPI.recordPlay(music.filePath)

      console.log('🎵 播放音乐:', music.title)
      console.log('📁 原始路径:', music.filePath)
      console.log('📝 文件扩展名:', music.fileExtension)

      // 先尝试使用原生 Audio（更兼容）
      try {
        await playWithNativeAudio(music)
        console.log('✅ 使用原生 Audio 播放成功')
        // 播放成功，释放锁
        isPlaybackInProgress = false
        return
      } catch (error) {
        console.log('⚠️ 原生 Audio 失败，尝试 Howler.js:', error)
      }

      // 备用：使用 Howler.js
      const localFileUrl = `local-file://${music.filePath}`
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
          // 播放开始成功，释放锁
          isPlaybackInProgress = false
        },
        onpause: () => {
          playerStore.isPlaying = false
          stopProgressUpdate()
        },
        onend: () => {
          playerStore.isPlaying = false
          stopProgressUpdate()
          // 自动播放下一首（根据播放模式）
          const next = playerStore.getNext()
          if (next) {
            const index = playerStore.queue.findIndex(m => m.id === next.id)
            if (index >= 0) {
              playerStore.setCurrentQueueIndex(index)
              setTimeout(async () => {
                await play(next)
              }, 500)
            }
          }
        },
        onloaderror: (_id, error) => {
          console.error('❌ Howler 加载失败，错误代码:', error)

          let errorMsg = '未知错误'
          switch(error) {
            case 1: errorMsg = '中止加载'; break
            case 2: errorMsg = '网络错误'; break
            case 3: errorMsg = '解码错误'; break
            case 4: errorMsg = '不支持的格式或文件损坏'; break
          }

          console.error(`跳过损坏文件: ${music.title} - ${errorMsg}`)
          playerStore.isPlaying = false
          stopProgressUpdate()

          // 释放播放锁
          isPlaybackInProgress = false

          // 自动播放下一首，增加延迟避免鬼畜
          const next = playerStore.getNext()
          if (next) {
            const index = playerStore.queue.findIndex(m => m.id === next.id)
            if (index >= 0) {
              playerStore.setCurrentQueueIndex(index)
              // 增加到 1000ms 延迟，给用户反应时间
              setTimeout(async () => {
                await play(next)
              }, 1000)
            }
          }
        }
      })

      howl.play()
      playerStore.currentMusic = music
      useNativeAudio = false
    } catch (error) {
      // 捕获所有未处理的错误（如 NotSupportedError）
      console.error('❌ 播放完全失败:', error)
      console.error('🔄 自动跳到下一首')

      playerStore.isPlaying = false
      stopProgressUpdate()

      // 释放播放锁
      isPlaybackInProgress = false

      // 自动播放下一首，增加延迟
      const next = playerStore.getNext()
      if (next) {
        const index = playerStore.queue.findIndex(m => m.id === next.id)
        if (index >= 0) {
          playerStore.setCurrentQueueIndex(index)
          setTimeout(async () => {
            await play(next)
          }, 1000)
        }
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
    // 供均衡器访问音频元素
    getAudioElement: () => audioElement
  }
}
