/**
 * The exact vendor profile folder names shipped under OrcaSlicer's
 * `resources/profiles/` directory, transcribed verbatim from a real install. A concrete
 * copyable parent-path hint is only ever emitted when a preset name resolves to one of these,
 * so an unknown vendor intentionally degrades to the honest filename-search fallback rather than
 * fabricating a folder that does not exist on disk.
 */
export const KNOWN_ORCA_VENDORS: readonly string[] = [
  'Afinia',
  'Anker',
  'Anycubic',
  'Artillery',
  'BBL',
  'BIQU',
  'Blocks',
  'CONSTRUCT3D',
  'Chuanying',
  'Co Print',
  'CoLiDo',
  'Comgrow',
  'Creality',
  'Cubicon',
  'Custom',
  'DeltaMaker',
  'Dremel',
  'Elegoo',
  'Eryone',
  'FLSun',
  'Flashforge',
  'FlyingBear',
  'Folgertech',
  'Geeetech',
  'Ginger Additive',
  'InfiMech',
  'Kingroon',
  'LH',
  'LONGER',
  'Lulzbot',
  'M3D',
  'MagicMaker',
  'Mellow',
  'OpenEYE',
  'OrcaArena',
  'OrcaFilamentLibrary',
  'Peopoly',
  'Phrozen',
  'Positron3D',
  'Prusa',
  'Qidi',
  'RH3D',
  'Raise3D',
  'Ratrig',
  'RolohaunDesign',
  'SecKit',
  'SeeMeCNC',
  'Snapmaker',
  'Sovol',
  'Tiertime',
  'Tronxy',
  'TwoTrees',
  'UltiMaker',
  'Vivedino',
  'Volumic',
  'Voron',
  'Voxelab',
  'Vzbot',
  'WEMAKE3D',
  'Wanhao France',
  'Wanhao',
  'WonderMaker',
  'Z-Bolt',
  'iQ',
  're3D',
]

/**
 * Returns the longest known Orca vendor folder name that `name` starts with on a word boundary
 * (case-sensitive), or null when none match. The longest-match rule lets a multi-word vendor win
 * over a shorter prefix of it: 'Wanhao France X1' matches 'Wanhao France', not 'Wanhao'. The word
 * boundary means the vendor is followed by end-of-string or whitespace, so 'Chubechanger' does not
 * match 'Chuanying' and 'Voronia' does not match 'Voron'.
 */
export function matchOrcaVendor(name: string): string | null {
  const trimmed = name.trim()
  let best: string | null = null
  for (const vendor of KNOWN_ORCA_VENDORS) {
    if (trimmed !== vendor && !trimmed.startsWith(`${vendor} `)) continue
    if (best === null || vendor.length > best.length) best = vendor
  }
  return best
}
