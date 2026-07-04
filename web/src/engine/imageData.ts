import type { Mat, OpenCv } from './opencv'

/** Decoded RGBA pixels (from a canvas ImageData or a PNG decoder). */
export interface RgbaImage {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

/**
 * Build a 3-channel BGR Mat, the layout Cv2.ImRead(Color) hands the engine on desktop, from RGBA
 * pixels. The caller owns the returned Mat and must delete() it.
 */
export function rgbaToBgrMat(cv: OpenCv, image: RgbaImage): Mat {
  const rgba = cv.matFromImageData({
    data: image.data,
    width: image.width,
    height: image.height,
  } as unknown as ImageData)
  const bgr = new cv.Mat()
  cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR)
  rgba.delete()
  return bgr
}
