import type { Mat, OpenCv } from './opencv'

// Mean intensity over the four border rows/columns of a single-channel image, used to choose the
// threshold polarity so the part/card comes out white whichever way the contrast falls.
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
