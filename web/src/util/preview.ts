// Read a picked file's bytes for the analysis worker.
export async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

// Build a downscaled preview data URL. Decoding straight to a bounded width keeps memory low on
// mobile (a full 35 MP decode would exhaust the heap), the lesson from the wasm build.
export async function makePreviewUrl(file: File, maxWidth = 900): Promise<string> {
  const bitmap = await createImageBitmap(file, { resizeWidth: maxWidth, resizeQuality: 'medium' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2D context')
    ctx.drawImage(bitmap, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    bitmap.close()
  }
}
