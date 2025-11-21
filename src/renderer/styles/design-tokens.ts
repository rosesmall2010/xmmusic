/**
 * 设计系统 - Design Tokens
 * 定义整个应用的设计规范，包括颜色、间距、字体、阴影等
 * 参考 QQ 音乐的设计风格
 */

// ==================== 颜色系统 ====================

export const colors = {
  // 主色调 - QQ音乐风格的绿色
  primary: {
    DEFAULT: '#31c27c',
    light: '#4dd796',
    dark: '#28a569',
    50: '#f0fdf7',
    100: '#dcfce9',
    200: '#bbf7d4',
    300: '#86efb0',
    400: '#4dd796',
    500: '#31c27c',
    600: '#28a569',
    700: '#228456',
    800: '#1f6845',
    900: '#1c563a',
  },

  // 辅助色
  accent: {
    red: '#ff4757',
    orange: '#ffa502',
    yellow: '#ffd32a',
    blue: '#3742fa',
    purple: '#a55eea',
  },

  // 中性色
  neutral: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },

  // 语义化颜色
  success: '#31c27c',
  warning: '#ffa502',
  error: '#ff4757',
  info: '#3742fa',

  // 浅色主题
  light: {
    background: {
      primary: '#ffffff',
      secondary: '#f8f9fa',
      tertiary: '#f5f5f5',
    },
    text: {
      primary: '#1f1f1f',
      secondary: '#666666',
      tertiary: '#999999',
      disabled: '#cccccc',
    },
    border: {
      primary: '#e0e0e0',
      secondary: '#f0f0f0',
    },
    hover: '#e9ecef',
    active: '#dee2e6',
  },

  // 深色主题
  dark: {
    background: {
      primary: '#1a1a1a',
      secondary: '#2d2d2d',
      tertiary: '#1e1e1e',
    },
    text: {
      primary: '#f5f5f5',
      secondary: '#bbbbbb',
      tertiary: '#888888',
      disabled: '#555555',
    },
    border: {
      primary: '#444444',
      secondary: '#333333',
    },
    hover: '#3d3d3d',
    active: '#4d4d4d',
  },
}

// ==================== 间距系统 ====================

export const spacing = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
  24: '6rem',    // 96px
}

// ==================== 字体系统 ====================

export const typography = {
  fontFamily: {
    base: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    mono: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
  },

  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },

  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeight: {
    none: 1,
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },
}

// ==================== 圆角系统 ====================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',   // 4px
  base: '0.5rem',  // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.5rem',    // 24px
  '2xl': '2rem',   // 32px
  full: '9999px',
}

// ==================== 阴影系统 ====================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
}

// ==================== 动画系统 ====================

export const transitions = {
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  timing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
}

// ==================== Z-Index 层级 ====================

export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  toast: 1080,
}

// ==================== 布局尺寸 ====================

export const layout = {
  // 侧边栏宽度
  sidebarWidth: '200px',
  sidebarWidthCollapsed: '60px',

  // Header 高度
  headerHeight: '60px',

  // Footer/Player Bar 高度
  footerHeight: '80px',

  // 最大内容宽度
  maxContentWidth: '1920px',

  // 断点
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
}

// ==================== 导出默认主题 ====================

export const theme = {
  colors,
  spacing,
  typography,
  borderRadius,
  shadows,
  transitions,
  zIndex,
  layout,
}

export default theme
