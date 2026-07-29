/**
 * 全屏播放页特效舞台区域（频谱 / 火焰 / 闪电共用）
 * 底边对齐进度条上沿，不含控制栏；改这里各特效一起变，避免漂移
 */
export type NowPlayingStage = {
  paddingX: number
  usableW: number
  baselineY: number
  maxH: number
  topY: number
}

/** 相对画布高度的底线 / 柱高（与历史实现一致） */
export const NP_STAGE_BASELINE = 0.85
export const NP_STAGE_MAX_H = 0.62

export const getNowPlayingStage = (width: number, height: number): NowPlayingStage => {
  const paddingX = Math.max(18, width * 0.08)
  const baselineY = height * NP_STAGE_BASELINE
  const maxH = height * NP_STAGE_MAX_H
  return {
    paddingX,
    usableW: Math.max(1, width - paddingX * 2),
    baselineY,
    maxH,
    topY: baselineY - maxH
  }
}
