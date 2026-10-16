<!-- Lucide UI icons; licenses and attribution: ../../THIRD_PARTY_NOTICES.txt. -->
<style scoped>
svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: none;
}
</style>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="name === 'pause'">
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </template>
    <path v-else :d="paths[name]" />
  </svg>
</template>

<script setup>
defineProps({
  name: {
    type: String,
    required: true,
    validator: (value) =>
      ["play", "pause", "reset", "plus", "minus", "copy", "check", "sliders", "panel-close", "panel-right-close", "spline", "chevron-left", "download", "x"].includes(value),
  },
});
const paths = {
  play: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
  reset: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5",
  plus: "M5 12h14 M12 5v14",
  copy: "M9 9h12v12H9z M5 15H3V3h12v2",
  minus: "M5 12h14",
  check: "M20 6 9 17l-5-5",
  sliders: "M10 5H3 M12 19H3 M14 3v4 M16 17v4 M21 12h-9 M21 19h-5 M21 5h-7 M8 10v4 M8 12H3",
  "panel-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18 M16 15l-3-3 3-3",
  "panel-right-close": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M15 3v18 M8 9l3 3-3 3",
  spline: "M17 5a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M3 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M5 17A12 12 0 0 1 17 5",
  "chevron-left": "m15 18-6-6 6-6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  x: "M18 6 6 18 M6 6l12 12",
};
</script>
