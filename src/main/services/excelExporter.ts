import { dialog } from 'electron'
import { writeFileSync } from 'fs'
import ExcelJS from 'exceljs'
import MusicDatabase from '../database/db'
import type { MusicItem } from '@shared/types/music'

interface ExportOptions {
  columns?: string[]
  includeHeaders?: boolean
  format?: 'xlsx' | 'csv'
}

export default class ExcelExporter {
  private db: MusicDatabase

  constructor(db: MusicDatabase) {
    this.db = db
  }

  /**
   * 导出音乐列表到Excel
   */
  async exportMusicList(
    musicList: MusicItem[],
    options: ExportOptions = {}
  ): Promise<{ type: 'csv' | 'xlsx'; data: any }> {
    const {
      columns = ['title', 'artist', 'album', 'year', 'genre', 'duration', 'filePath', 'fileHash'],
      includeHeaders = true,
      format = 'xlsx'
    } = options

    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('音乐列表')

      // 定义列映射
      const columnMap: Record<string, { header: string; key: string; width?: number }> = {
        title: { header: '标题', key: 'title', width: 30 },
        artist: { header: '艺术家', key: 'artist', width: 20 },
        album: { header: '专辑', key: 'album', width: 25 },
        year: { header: '年份', key: 'year', width: 10 },
        genre: { header: '流派', key: 'genre', width: 15 },
        duration: { header: '时长(秒)', key: 'duration', width: 12 },
        filePath: { header: '文件路径', key: 'filePath', width: 50 },
        fileHash: { header: 'MD5', key: 'fileHash', width: 35 },
        fileName: { header: '文件名', key: 'fileName', width: 30 },
        fileSize: { header: '文件大小(字节)', key: 'fileSize', width: 15 },
        bitrate: { header: '比特率(kbps)', key: 'bitrate', width: 15 },
        sampleRate: { header: '采样率(Hz)', key: 'sampleRate', width: 15 },
        channels: { header: '声道数', key: 'channels', width: 12 },
        playCount: { header: '播放次数', key: 'playCount', width: 12 },
        favorite: { header: '收藏', key: 'favorite', width: 10 }
      }

      // 设置列
      const excelColumns = columns.map(col => columnMap[col] || { header: col, key: col })
      worksheet.columns = excelColumns

      // 添加数据
      musicList.forEach(music => {
        const row: any = {}
        columns.forEach(col => {
          const key = columnMap[col]?.key || col
          let value = (music as any)[key]

          // 格式化特殊字段
          if (col === 'duration' && value) {
            value = this.formatDuration(value)
          } else if (col === 'fileSize' && value) {
            value = this.formatSize(value)
          } else if (col === 'favorite') {
            value = value ? '是' : '否'
          } else if (col === 'year' && !value) {
            value = ''
          }

          row[key] = value
        })
        worksheet.addRow(row)
      })

      // 设置表头样式
      if (includeHeaders) {
        worksheet.getRow(1).font = { bold: true }
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        }
      }

      // 生成文件路径
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const extension = format === 'csv' ? 'csv' : 'xlsx'
      const fileName = `音乐列表_${timestamp}.${extension}`

      // 保存文件
      if (format === 'csv') {
        const csv = this.convertToCSV(musicList, columns, columnMap)
        return { type: 'csv', data: csv }
      } else {
        const buffer = await workbook.xlsx.writeBuffer()
        return { type: 'xlsx', data: buffer }
      }
    } catch (error: any) {
      throw new Error(`导出失败: ${error.message}`)
    }
  }

  /**
   * 格式化时长
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * 转换为CSV
   */
  private convertToCSV(
    musicList: MusicItem[],
    columns: string[],
    columnMap: Record<string, any>
  ): string {
    const headers = columns.map(col => columnMap[col]?.header || col)
    const rows = musicList.map(music => {
      return columns.map(col => {
        const key = columnMap[col]?.key || col
        let value = (music as any)[key] || ''

        // 格式化
        if (col === 'duration' && value) {
          value = this.formatDuration(value)
        } else if (col === 'fileSize' && value) {
          value = this.formatSize(value)
        } else if (col === 'favorite') {
          value = value ? '是' : '否'
        }

        // CSV转义
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = `"${value.replace(/"/g, '""')}"`
        }

        return value
      })
    })

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }
}
