/**
 * The two scanning choices shared by the coupon flows that print a scannable part: where the
 * scan happens (the removed part on the glass, or the whole build plate), and whether the
 * coupon prints in a single color or over a contrasting base color.
 */
export const SCAN_PLACES = ['part', 'plate'] as const
export type ScanPlace = (typeof SCAN_PLACES)[number]

export const PART_COLORS = ['single', 'base'] as const
export type PartColors = (typeof PART_COLORS)[number]
