<!-- Order: a mock-up only. The real flow (Kirby creates a Revolut Business checkout, Revolut confirms the
     payment to Kirby, only then is the design accepted for production) is described in AGENTS.md. -->
<template>
  <dialog ref="dialog" class="card order" aria-labelledby="order-title" @click.self="close">
    <h2 id="order-title" class="serif">Order your cup</h2>
    <dl>
      <dt>Cup</dt>
      <dd>1 cup with your drawing</dd>
      <dt>Making</dt>
      <dd>About {{ weeks }} weeks: printing, glazing, and firing</dd>
      <dt>Price</dt>
      <dd>€{{ price }}</dd>
    </dl>
    <button class="primary" disabled>Pay with Revolut</button>
    <p class="note">This is a prototype. Payment opens when the shop launches.</p>
    <button class="quiet icon close" aria-label="Close" @click="close"><Icon name="x" /></button>
  </dialog>
</template>

<script setup>
import { ref } from "vue";
import Icon from "./Icon.vue";

defineProps({
  weeks: { type: Number, required: true },
  price: { type: Number, required: true },
});
const dialog = ref(null);
const close = () => dialog.value.close();
defineExpose({ open: () => dialog.value.showModal() });
</script>

<style scoped>
.order {
  width: min(420px, calc(100vw - 32px));
  padding: 20px 20px 18px;
  color: var(--ink);
}
.order::backdrop { background: rgb(32 33 34 / 0.4); }
h2 { margin: 0 0 12px; font-size: 24px; line-height: 1.3; }
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  margin: 0 0 18px;
  padding: 12px 0;
  border-block: 1px solid var(--line-subtle);
}
dt { color: var(--muted); }
dd { margin: 0; }
.primary { width: 100%; min-height: 40px; }
.note { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
.close { position: absolute; top: 12px; right: 12px; }
</style>
