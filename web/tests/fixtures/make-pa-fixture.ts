// One-off generator for the e2e PA fixtures. Run from web/ with:
//   npx tsx tests/fixtures/make-pa-fixture.ts
// Renders synthetic PA coupon scans with ground truth PA 0.03, rotated 3 degrees, default noise:
// the default palette (dark lines on a light base) and an inverted palette (light lines on a dark
// base with a light scanner lid), written to web/e2e/fixtures/.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { renderPaScan } from '../helpers/paRender'
import type { PaRenderOptions } from '../helpers/paRender'

const fixtures: Array<{ file: string; options: Partial<PaRenderOptions> & { truePa: number } }> = [
  { file: 'pa_synthetic.png', options: { truePa: 0.03, rotationDegrees: 3 } },
  {
    file: 'pa_synthetic_inverted.png',
    options: { truePa: 0.03, rotationDegrees: 3, baseGray: 40, lineGray: 220, backgroundGray: 245 },
  },
]

for (const f of fixtures) {
  const img = renderPaScan(f.options)
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
  const out = fileURLToPath(new URL(`../../e2e/fixtures/${f.file}`, import.meta.url))
  writeFileSync(out, PNG.sync.write(png))
  console.log(`wrote ${out} (${img.width}x${img.height})`)
}
