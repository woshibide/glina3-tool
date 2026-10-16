<!-- Slider, ported from Baza's SliderControl: drag the number, step with the -/+ buttons, or type an exact
     value. Bounds are fixed here (the product caps them), so the editable-limits editor is left out. -->
<style scoped>
button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border-color: transparent;
  background: var(--surface);
}
button:hover:not(:disabled) {
  border-color: var(--muted);
}
button:active:not(:disabled) {
  background: var(--soft);
}
</style>
<template>
  <NumberField v-model="model" :label="label" :min="min" :max="max" :step="step" :disabled="disabled">
    <template #decrease
      ><button :disabled="disabled || model <= min" :aria-label="`Decrease ${label}`" @click="nudge(-1)">
        <Icon name="minus" /></button
    ></template>
    <template #increase
      ><button :disabled="disabled || model >= max" :aria-label="`Increase ${label}`" @click="nudge(1)">
        <Icon name="plus" /></button
    ></template>
  </NumberField>
</template>
<script setup>
import NumberField from "./NumberField.vue";
import Icon from "./Icon.vue";
import { clampToLimits } from "../lib/numeric-limits.js";
const model = defineModel({ type: Number, required: true });
const props = defineProps({
  label: { type: String, required: true },
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  step: { type: Number, default: 1 },
  disabled: Boolean,
});
function nudge(direction) {
  const snapped = Math.round(model.value / props.step + direction) * props.step;
  model.value = clampToLimits(snapped, { min: props.min, max: props.max });
}
</script>
