// Converts the flattened black-background JPG logo into transparent PNGs for light and dark surfaces.
const path = require('path')
const sharp = require('sharp')

const dir = path.join(__dirname, '..', 'public', 'images')

;(async () => {
  const { data, info } = await sharp(path.join(dir, 'fixora-logo.jpg'))
    .median(3)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const variants = [
    ['fixora-logo-dark.png', [17, 17, 17]],
    ['fixora-logo-light.png', [255, 255, 255]],
  ]
  for (const [name, ink] of variants) {
    const out = Buffer.alloc(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 3]
      const g = data[i * 3 + 1]
      const b = data[i * 3 + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const sat = mx ? (mx - mn) / mx : 0
      let a
      let c
      if (sat > 0.6 && mx > 130 && g > 70) {
        a = 255 * Math.min(1, (mx - 110) / 70)
        c = [255, Math.min(255, Math.round((g * 255) / mx)), 0]
      } else if (sat > 0.6 && mx > 90) {
        a = 0
        c = ink
      } else {
        a = Math.min(255, Math.max(0, (mx - 9) * 40))
        c = ink
      }
      out[i * 4] = c[0]
      out[i * 4 + 1] = c[1]
      out[i * 4 + 2] = c[2]
      out[i * 4 + 3] = a
    }
    const raw = { raw: { width: W, height: H, channels: 4 } }
    await sharp(out, raw).extract({ left: 140, top: 165, width: 910, height: 300 }).png().toFile(path.join(dir, name))
    if (name.includes('dark')) {
      await sharp(out, raw).extract({ left: 140, top: 165, width: 300, height: 280 }).png().toFile(path.join(dir, 'fixora-mark.png'))
    }
  }
  console.log('done')
})()
