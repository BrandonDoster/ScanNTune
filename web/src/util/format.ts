// Display formatting helpers for the UI.

// Fixed-decimal with an explicit leading '+' for positives (matches the C# "+0.000;-0.000;0.000").
export function signedFixed(value: number, digits: number): string {
  const text = value.toFixed(digits)
  return value > 0 ? `+${text}` : text
}

export function signedPercent(value: number, digits = 3): string {
  return `${signedFixed(value, digits)} %`
}

export function signedDegrees(value: number, digits = 3): string {
  return `${signedFixed(value, digits)}°`
}
