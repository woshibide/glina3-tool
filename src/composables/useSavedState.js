import { ref, watch } from "vue";
import { clone } from "../lib/values.js";
// Gallery-only persistence. Components know nothing about storage or other instances.
export function useSavedState(key, defaults, validators) {
  const status = ref("Values save locally in this browser.");
  const state = ref(clone(defaults));
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (
      saved?.version === 1 &&
      saved.values &&
      typeof saved.values === "object"
    ) {
      for (const name of Object.keys(defaults))
        if (validators[name](saved.values[name]))
          state.value[name] = clone(saved.values[name]);
    }
  } catch {
    status.value = "Local storage unavailable or invalid; using defaults.";
  }
  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, values: value }),
        );
      } catch {
        status.value =
          "Local storage unavailable; changes last for this session.";
      }
    },
    { deep: true },
  );
  return { state, status };
}
