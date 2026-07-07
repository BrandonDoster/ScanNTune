import { ref } from 'vue'

/** Clipboard copy for path chips, remembering the last copied path for a "copied" hint. */
export function useCopyPath() {
  const copiedPath = ref('')

  async function copyPath(path: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(path)
      copiedPath.value = path
    } catch (e) {
      console.error('Clipboard copy failed', e)
    }
  }

  return { copiedPath, copyPath }
}
