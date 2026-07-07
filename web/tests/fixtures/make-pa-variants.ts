// One-off local helper: render extra synthetic PA scans for manual UI testing.
// Run from web/: npx tsx tests/fixtures/make-pa-variants.ts <outputDir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { renderPaScan } from '../helpers/paRender'

const outDir = process.argv[2] ?? '.'
mkdirSync(outDir, { recursive: true })

const variants: Array<{ name: string; truePa: number; rotationDegrees: number; flipped: boolean }> = [
  { name: 'pa_scan_low_0.012.png', truePa: 0.012, rotationDegrees: 5, flipped: false },
  { name: 'pa_scan_mid_0.030.png', truePa: 0.03, rotationDegrees: 3, flipped: false },
  { name: 'pa_scan_high_0.048_flipped.png', truePa: 0.048, rotationDegrees: 88, flipped: true },
]

for (const v of variants) {
  const img = renderPaScan({ truePa: v.truePa, rotationDegrees: v.rotationDegrees, flipped: v.flipped })
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  writeFileSync(join(outDir, v.name), PNG.sync.write(png))
  console.log(`${v.name}: truePa=${v.truePa}`)
}
