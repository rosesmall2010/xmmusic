/** 应用内快捷键动作清单（不含 toggle-window） */
export const APP_SHORTCUT_ACTIONS = [
  'play-pause',
  'previous',
  'next',
  'volume-up',
  'volume-down',
  'toggle-favorite'
] as const

export type AppShortcutAction = (typeof APP_SHORTCUT_ACTIONS)[number]
