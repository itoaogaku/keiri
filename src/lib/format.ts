/** ¥1,234 形式 */
export function yen(n: number): string {
  const v = Math.round(n)
  return (v < 0 ? '-¥' : '¥') + Math.abs(v).toLocaleString('ja-JP')
}

/** YYYY-MM-DD → YYYY年M月D日 */
export function jpDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

/** Date → YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 当月末日を YYYY-MM-DD で返す */
export function endOfMonth(base: Date): string {
  return toISODate(new Date(base.getFullYear(), base.getMonth() + 1, 0))
}

/** 翌月末日を YYYY-MM-DD で返す */
export function endOfNextMonth(base: Date): string {
  return toISODate(new Date(base.getFullYear(), base.getMonth() + 2, 0))
}

/** YYYYMMDD */
export function compactDate(d: Date): string {
  return toISODate(d).replace(/-/g, '')
}
