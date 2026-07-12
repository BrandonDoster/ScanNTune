// One-off generator for the e2e extrusion-multiplier fixture. Run from web/ with:
//   npx tsx tests/fixtures/make-em-fixture.ts
// Renders a synthetic flow coupon scan with a ground-truth bead width of 0.42 mm at the 600 dpi
// class resolution the analyzer's measurement-resolution gate requires (a coarser scan is refused
// before analysis, the same as a real under-resolved flatbed scan), written to web/e2e/fixtures/.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { renderEmScan } from '../helpers/emRender'
import { defaultEmTestSpec } from '../../src/engine/em/types'
import { defaultPrinterProfile } from '../../src/engine/pa/types'

const PX_PER_MM = 24
const spec = defaultEmTestSpec(defaultPrinterProfile())

const img = renderEmScan({ spec, trueWidthMm: 0.42, pxPerMm: PX_PER_MM })
const png = new PNG({ width: img.width, height: img.height })
png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength)
const out = fileURLToPath(new URL('../../e2e/fixtures/em_synthetic.png', import.meta.url))
writeFileSync(out, PNG.sync.write(png))
console.log(`wrote ${out} (${img.width}x${img.height})`)
