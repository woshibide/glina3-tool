<!-- Numeric v-model with optional v-model:limits. min/max are hard domain limits; editable limits are independent. Invalid drafts stay local; Enter/blur restores a valid value. -->
<style scoped>
.number-field {
  min-width: 0;
}
.value-control {
  min-width: 0;
}
.value-control.with-steppers {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
@media (max-width: 767px) {
  .value-control.with-steppers {
    gap: 3px;
  }
}
.field-label {
  margin-bottom: 5px;
}
input {
  font-variant-numeric: tabular-nums;
}
.number-field input.bounded-value[type="number"] {
  width: 100%;
  height: 40px;
  padding: 5px 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: center;
  font:
    500 18px/1.3 ui-monospace,
    monospace;
  appearance: textfield;
}
.bounded-value::-webkit-inner-spin-button,
.bounded-value::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input.bounded-value:focus-visible {
  outline-width: 2px;
  outline-offset: 1px;
  border-radius: 2px;
}
</style>
<template>
  <div class="number-field">
    <label :for="id" class="field-label">{{ label }}</label>
    <component
      :is="limits ? LimitsEditor : 'div'"
      v-bind="
        limits
          ? {
              modelValue: limits,
              label,
              integer: Number(step) === 1,
              hardMin: managedLimits ? (limitMin ?? SAFE_MIN) : min,
              hardMax: managedLimits ? (limitMax ?? SAFE_MAX) : max,
            }
          : {}
      "
      @update:model-value="limits = $event"
    >
      <div
        class="value-control"
        :class="{ 'with-steppers': $slots.decrease || $slots.increase }"
      >
        <slot name="decrease" />
        <input
          :id="id"
          :name="id"
          autocomplete="off"
          type="number"
          class="number-scrub"
          :title="NUMBER_SCRUB_HINT"
          :aria-description="NUMBER_SCRUB_HINT"
          :class="{ 'bounded-value': limits }"
          :style="
            limits && String(model).length > 7
              ? { fontSize: '12px' }
              : undefined
          "
          :value="draft"
          :min="effective.min"
          :max="effective.max"
          :step="step"
          :disabled="disabled"
          :aria-invalid="invalid"
          required
          v-on="scrubber.events"
          @focus="editing = true"
          @input="input"
          @blur="commit"
          @change="commit"
          @keydown.enter="commit"
          @keydown.esc="commit"
        />
        <slot name="increase" />
      </div>
    </component>
  </div>
</template>
<script setup>
import { ref, watch, useId, computed, nextTick, onBeforeUnmount } from "vue";
import LimitsEditor from "./LimitsEditor.vue";
import { createNumberScrubber, NUMBER_SCRUB_HINT } from "../lib/number-scrub.js";
import {
  effectiveLimits,
  clampToLimits,
  SAFE_MIN,
  SAFE_MAX,
} from "../lib/numeric-limits.js";
const model = defineModel({ type: Number, required: true });
const limits = defineModel("limits", { type: Object });
const props = defineProps({
  label: { type: String, required: true },
  min: { type: Number, default: SAFE_MIN },
  max: { type: Number, default: SAFE_MAX },
  step: { type: [Number, String], default: "any" },
  disabled: Boolean,
  managedLimits: Boolean,
  limitMin: Number,
  limitMax: Number,
});
const effective = computed(() =>
  effectiveLimits(
    limits.value ?? { min: null, max: null },
    props.min,
    props.max,
  ),
);
const id = useId(),
  draft = ref(model.value),
  invalid = ref(false),
  editing = ref(false);
const scrubber = createNumberScrubber({
  read: () => ({
    value: model.value,
    ...effective.value,
    step: props.step,
    disabled: props.disabled,
  }),
  write: (value) => {
    editing.value = false;
    invalid.value = false;
    draft.value = value;
    model.value = value;
    // Composite controls can further constrain the accepted value (e.g. aspect lock).
    nextTick(() => { draft.value = model.value; });
  },
  onEnd: (dragged) => { if (dragged) nextTick(commit); },
});
onBeforeUnmount(scrubber.dispose);
watch(model, (value) => {
  if (!editing.value) draft.value = value;
});
watch(
  effective,
  (bounds) => {
    if (!limits.value || props.managedLimits) return;
    const value = clampToLimits(model.value, bounds);
    if (value !== model.value) model.value = value;
  },
  { immediate: true },
);
function input(event) {
  editing.value = true;
  draft.value = event.target.value;
  invalid.value =
    !event.target.validity.valid ||
    !Number.isFinite(event.target.valueAsNumber);
  if (!invalid.value) model.value = event.target.valueAsNumber;
}
function commit() {
  editing.value = false;
  draft.value = model.value;
  invalid.value = false;
}
</script>
