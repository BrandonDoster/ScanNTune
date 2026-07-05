import type { Mat, OpenCv } from './opencv'

// Mean intensity over the four border rows/columns of a single-channel image, used by the card
// measurer to choose the threshold polarity so the card comes out white whichever way the contrast
// falls. The coupon path deliberately does NOT use it: a backing sheet smaller than the scan bed
// leaves bright lid margins on the border, so ring detection validates both polarities against the
// coupon grid instead (see ringDetector/couponAnalyzer).
// The HSV value channel (V = max(B, G, R)) as a fresh single-channel Mat the caller deletes. A
// single-channel input is copied as-is. Note: this build of OpenCV.js does not export extractChannel,
// so the channel is taken via split; MatVector.get(i) hands out a wrapper sharing the vector's native
// memory, so the channel must be cloned before the vector is deleted.
export function valueChannel(cv: OpenCv, image: Mat): Mat {
  if (image.channels() === 1) return image.clone()
  const hsv = new cv.Mat()
  cv.cvtColor(image, hsv, cv.COLOR_BGR2HSV)
  const channels = new cv.MatVector()
  cv.split(hsv, channels)
  const channel = channels.get(2)
  const v = channel.clone()
  channel.delete()
  channels.delete()
  hsv.delete()
  return v
}

export function borderMean(cv: OpenCv, mat: Mat): number {
  const top = mat.row(0)
  const bottom = mat.row(mat.rows - 1)
  const left = mat.col(0)
  const right = mat.col(mat.cols - 1)
  const mean = (cv.mean(top)[0] + cv.mean(bottom)[0] + cv.mean(left)[0] + cv.mean(right)[0]) / 4.0
  top.delete()
  bottom.delete()
  left.delete()
  right.delete()
  return mean
}
