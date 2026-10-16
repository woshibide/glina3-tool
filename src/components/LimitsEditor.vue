<!-- Limits belong to the control they bound: scalar end caps, rail terminals, XY axes. Layout changes never change the stored limits. -->
<style scoped>
.limits-editor {
  position: relative;
  min-width: 0;
  display: grid;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
}
.end {
  position: relative;
  min-width: 0;
}
.control {
  position: relative;
  min-width: 0;
}
.scalar {
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--control-bg, var(--paper));
}
.scalar::before,
.scalar::after {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  width: 4px;
  border-block: 1px solid var(--_plot-axis);
  pointer-events: none;
}
.scalar::before {
  left: 5px;
  border-left: 1px solid var(--_plot-axis);
}
.scalar::after {
  right: 5px;
  border-right: 1px solid var(--_plot-axis);
}
.scalar .end {
  padding-inline: 4px;
}
.scalar:focus-within {
  border-color: var(--_plot-axis);
}
.scalar:has(.end input:focus) {
  background: var(--surface);
}
.rail {
  gap: 14px;
  padding-block: 0;
}
.rail .end {
  padding: 4px 6px;
  background: transparent;
  border-radius: 2px;
}
.rail .end:first-child {
  border-right: 1px solid var(--_plot-axis);
}
.rail .end:last-child {
  border-left: 1px solid var(--_plot-axis);
}
.rail .end::after {
  content: "";
  position: absolute;
  width: 14px;
  height: 1px;
  background: var(--line);
  top: 50%;
}
.rail .end:first-child::after {
  left: 100%;
}
.rail .end:last-child::after {
  right: 100%;
}
.axis-x {
  padding-top: 8px;
  border-top: 1px solid var(--_plot-axis);
  align-items: start;
}
.axis-x::before,
.axis-x::after {
  content: "";
  position: absolute;
  top: -5px;
  height: 9px;
  width: 1px;
  background: var(--_plot-axis);
}
.axis-x::before {
  left: 0;
}
.axis-x::after {
  right: 0;
}
.axis-x .control {
  text-align: center;
  align-self: center;
}
.axis-y {
  height: 100%;
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding-left: 9px;
  border-left: 1px solid var(--_plot-axis);
}
.axis-y::before,
.axis-y::after {
  content: "";
  position: absolute;
  left: -5px;
  height: 1px;
  width: 9px;
  background: var(--_plot-axis);
}
.axis-y::before {
  top: 0;
}
.axis-y::after {
  bottom: 0;
}
.axis-y :deep(.limit-value.maximum label) {
  align-items: flex-start;
  text-align: left;
}
.axis-y :deep(.limit-value.maximum input.limit-input) {
  text-align: left;
}
.axis-y :deep(.message) {
  left: auto;
  right: 0;
}
.axis-y .control {
  align-self: center;
  padding-left: 6px;
}
.axis-label {
  color: var(--_plot-label);
  font:
    11px ui-monospace,
    monospace;
}
@media (max-width: 767px) {
  .scalar {
    gap: 3px;
    padding: 5px;
  }
  .scalar .end {
    padding-inline: 2px;
  }
  .rail {
    gap: 10px;
  }
  .rail .end::after {
    width: 10px;
  }
}
</style>
<template>
  <div
    class="limits-editor"
    :class="layout"
    role="group"
    :aria-label="`${label} limits`"
  >
    <div class="end">
      <LimitValue
        v-model="model"
        side="min"
        :label="label"
        :integer="integer"
        :hard-min="hardMin"
        :hard-max="hardMax"
      />
    </div>
    <div class="control">
      <slot
        ><span v-if="axis" class="axis-label">{{ axis }}</span></slot
      >
    </div>
    <div class="end">
      <LimitValue
        v-model="model"
        side="max"
        :label="label"
        :integer="integer"
        :hard-min="hardMin"
        :hard-max="hardMax"
      />
    </div>
  </div>
</template>
<script setup>
import LimitValue from "./LimitValue.vue";
import { SAFE_MIN, SAFE_MAX } from "../lib/numeric-limits.js";
const model = defineModel({ type: Object, required: true });
defineProps({
  label: { type: String, required: true },
  layout: { type: String, default: "scalar" },
  axis: String,
  integer: Boolean,
  hardMin: { type: Number, default: SAFE_MIN },
  hardMax: { type: Number, default: SAFE_MAX },
});
</script>
