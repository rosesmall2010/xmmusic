import type { ScanProgress, ScanState } from '@shared/types/music'

class ScanManager {
  private state: ScanState = {
    isScanning: false,
    isPaused: false,
    isCancelled: false,
    progress: null,
    currentPath: null
  }

  getState(): ScanState {
    return { ...this.state }
  }

  setScanning(scanning: boolean): void {
    this.state.isScanning = scanning
    if (!scanning) {
      this.state.isPaused = false
      this.state.isCancelled = false
    }
  }

  setPaused(paused: boolean): void {
    this.state.isPaused = paused
  }

  setCancelled(cancelled: boolean): void {
    this.state.isCancelled = cancelled
    this.state.isScanning = false
    this.state.isPaused = false
  }

  setProgress(progress: ScanProgress | null): void {
    this.state.progress = progress
  }

  pause(): void {
    if (this.state.isScanning && !this.state.isPaused) {
      this.state.isPaused = true
    }
  }

  resume(): void {
    if (this.state.isPaused) {
      this.state.isPaused = false
    }
  }

  cancel(): void {
    if (this.state.isScanning) {
      this.state.isCancelled = true
      this.state.isPaused = false
      this.state.isScanning = false
    }
  }
}

export default new ScanManager()
