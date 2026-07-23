/**
 * PDF保存時の初期ファイル名を指定して印刷するフック。
 * ブラウザは <title> を既定のファイル名に使うため、印刷直前だけ差し替える。
 */
export function usePrintFilename() {
  return (name: string) => {
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').trim()
    const prev = document.title
    const restore = () => {
      document.title = prev
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    document.title = safe
    window.print()
    // afterprint が発火しない環境向けの保険
    setTimeout(restore, 1000)
  }
}
