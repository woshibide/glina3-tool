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
      ["play", "pause", "reset", "plus", "minus", "copy", "check", "sliders", "panel-close", "panel-right-close", "spline", "chevron-left", "download", "x", "brush", "eraser", "undo", "redo", "trash", "rotate", "share", "chevron-down", "pencil", "flame"].includes(value),
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
  brush: "m11 10 3 3 M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",
  eraser: "M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21 M5.082 11.09l8.828 8.828",
  undo: "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
  redo: "m15 14 5-5-5-5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13",
  trash: "M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2 M10 11v6 M14 11v6",
  rotate: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8 M21 3v5h-5",
  share: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13",
  "chevron-down": "m6 9 6 6 6-6",
  pencil: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
};
</script>
