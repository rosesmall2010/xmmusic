import { Howl } from 'howler'
import { usePlayerStore } from '@/stores/player'
import type { MusicItem } from '@shared/types/music'

// 自动播放下一首（在usePlayer函数内部定义）

let howl: Howl | null = null
let progressTimer: NodeJS.Timeout | null = null
let audioElement: HTMLAudioElement | null = null
let useNativeAudio = false

export function usePlayer() {
  const playerStore = usePlayerStore()

  const playWithNativeAudio = async (music: MusicItem) => {
    console.log('🔄 尝试使用原生 Audio 播放')

    // 停止并清理旧的音频
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
      audioElement = null
    }

    let hasStartedPlaying = false
    let loadTimeout: NodeJS.Timeout | null = null

    // 创建新的 Audio 元素
    audioElement = new Audio()
    // 使用自定义协议访问本地文件
    const localFileUrl = `local-file://${encodeURIComponent(music.filePath)}`
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
        console.error('❌ 原生 Audio 播放失败:', e)
        // 不立即弹窗，等待一下看是否能恢复
        if (loadTimeout) clearTimeout(loadTimeout)
        loadTimeout = setTimeout(() => {
          if (!hasStartedPlaying) {
            console.error('确认播放失败，显示错误提示')
            playerStore.isPlaying = false
            stopProgressUpdate()
          }
        }, 1000)
      }
    }

    try {
      await audioElement.play()
      playerStore.currentMusic = music
      useNativeAudio = true
    } catch (error) {
      console.error('播放失败:', error)
      if (!hasStartedPlaying) {
        throw error // 让外层捕获，尝试 Howler.js
      }
    }
  }

  const play = async (music: MusicItem) => {
    // 停止当前播放
    if (howl) {
      howl.unload()
      howl = null
    }
    if (audioElement) {
      audioElement.pause()
      audioElement.src = ''
      audioElement = null
    }

    // 记录播放
    await window.electronAPI.recordPlay(music.id)

    console.log('🎵 播放音乐:', music.title)
    console.log('📁 原始路径:', music.filePath)
    console.log('📝 文件扩展名:', music.fileExtension)

    // 先尝试使用原生 Audio（更兼容）
    try {
      await playWithNativeAudio(music)
      console.log('✅ 使用原生 Audio 播放成功')
      return
    } catch (error) {
      console.log('⚠️ 原生 Audio 失败，尝试 Howler.js:', error)
    }

    // 备用：使用 Howler.js
    const localFileUrl = `local-file://${encodeURIComponent(music.filePath)}`
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
      onloaderror: (id, error) => {
        console.error('❌ Howler 加载失败，错误代码:', error)

        let errorMsg = '未知错误'
        switch(error) {
          case 1: errorMsg = '中止加载'; break
          case 2: errorMsg = '网络错误'; break
          case 3: errorMsg = '解码错误'; break
          case 4: errorMsg = '不支持的格式或文件损坏'; break
        }

        alert(`无法加载音乐:\n${music.title}\n\n错误: ${errorMsg}\n\n该文件可能已损坏或使用了不标准的编码格式`)
        playerStore.isPlaying = false
        stopProgressUpdate()
      }
    })

    howl.play()
    playerStore.currentMusic = music
    useNativeAudio = false
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
    setVolume
  }
}
