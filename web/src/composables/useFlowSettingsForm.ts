import { computed, reactive, toRefs, watch } from 'vue'
import type { ComputedRef, ToRefs } from 'vue'

/** The surface of a store built by `createFlowSettingsStore` that the form binding needs. */
export interface FlowSettingsStoreLike<S> {
  settings: S | null
  hasStored: boolean
  save(next: S): void
  reset(): void
}

function sameSettings<S extends Record<string, unknown>>(a: S, b: S): boolean {
  return Object.keys(a).every((key) => a[key] === b[key])
}

/**
 * Binds a page's settings form to its flow settings store. The returned refs start from the
 * stored entry when one exists, otherwise from the flow's computed defaults; every edit is
 * persisted immediately. When `context` is given (the selected printer profile id for the
 * per-profile flows), a context change re-applies that context's stored entry or defaults.
 */
export function useFlowSettingsForm<S extends Record<string, unknown>>(
  store: FlowSettingsStoreLike<S>,
  defaults: () => S,
  context?: () => unknown,
): { form: ToRefs<S>; hasStored: ComputedRef<boolean>; reset: () => void } {
  const form = reactive({ ...(store.settings ?? defaults()) }) as S

  // Persist edits as they happen. A snapshot equal to what would load anyway (the stored
  // entry, or the defaults when nothing is stored) is skipped, so re-applying values after a
  // reset or a context switch never creates a stored entry by itself.
  watch(
    () => ({ ...form }) as S,
    (next) => {
      const baseline = store.settings ?? defaults()
      if (!sameSettings(next, baseline)) store.save(next)
    },
  )

  function apply(values: S): void {
    Object.assign(form, values)
  }

  if (context) {
    watch(context, () => apply(store.settings ?? defaults()))
  }

  function reset(): void {
    store.reset()
    apply(defaults())
  }

  return { form: toRefs(form) as ToRefs<S>, hasStored: computed(() => store.hasStored), reset }
}
