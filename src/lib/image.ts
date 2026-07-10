/**
 * 画像の四隅の色を背景色とみなし、その色に近い部分を透明にする。
 * 白でも薄いグレー・オフホワイトでも対応。四隅が暗い場合は
 * 印影を守るため加工しない（すでに透過済み等）。
 * 失敗時は元の dataURL をそのまま返す。
 */
export function knockoutBackground(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(dataUrl)
      return
    }
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const w = c.width
        const h = c.height
        const id = ctx.getImageData(0, 0, w, h)
        const d = id.data
        const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4]
        let cr = 0
        let cg = 0
        let cb = 0
        let ca = 0
        corners.forEach((k) => {
          cr += d[k]
          cg += d[k + 1]
          cb += d[k + 2]
          ca += d[k + 3]
        })
        cr /= 4
        cg /= 4
        cb /= 4
        ca /= 4
        // すでに四隅が透明、または背景が暗い場合は加工しない
        if (ca < 20 || Math.min(cr, cg, cb) < 170) {
          resolve(dataUrl)
          return
        }
        for (let i = 0; i < d.length; i += 4) {
          const dist = Math.sqrt(
            (d[i] - cr) ** 2 + (d[i + 1] - cg) ** 2 + (d[i + 2] - cb) ** 2
          )
          if (dist < 45) d[i + 3] = 0
          else if (dist < 90)
            d[i + 3] = Math.min(d[i + 3], Math.round(((dist - 45) / 45) * 255))
        }
        ctx.putImageData(id, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
