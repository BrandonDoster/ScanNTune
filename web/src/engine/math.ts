// Median of a list (average of the two central values for even length). Returns 0 for an empty list.
export function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2.0
}
