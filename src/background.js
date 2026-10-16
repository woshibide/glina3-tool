// The cup as a page background: the baked cup turns slowly and leans towards the mouse, or the phone's tilt.
// No controls and no pointer capture, so the page above it stays fully usable.
//
//   const stop = mountCup(canvas, { onReady });   // canvas: sized by CSS; onReady: first frame with the bake
//   stop();                                       // ends the loop and frees the GPU memory
import { DEFAULT_CAMERA, createStage } from "./scene/stage.js";
import { bakeInWorker } from "./scene/materials.js";

const TURN_SECONDS = 24;
const MAX_PIXEL_RATIO = 2;
// At zoom 1 the cup fills about half the view's height; narrower views zoom out so it keeps clear of the sides.
const FIT_ASPECT = 0.7;
// Section arc length and outer circumference of the cup in millimetres, rounded up.
const SECTION_MM = 253;
const AROUND_MM = 236;

// Bake resolution for a view this many device pixels tall: about one texel per device pixel on the cup,
// which is about half the view's height for 90 mm. Multiples of 256 from 1024 up to maxTexture (and 4096).
export function bakeSize(viewHeightPx, maxTexture = 4096) {
  const perMm = (viewHeightPx * 0.5) / 90;
  const fit = (mm) => Math.min(maxTexture, 4096, Math.max(1024, Math.ceil((mm * perMm) / 256) * 256));
  return { columns: fit(AROUND_MM), rows: fit(SECTION_MM) };
}

// Phone tilt as -1..1 on both axes, held upright at about 45 degrees; null when the screen is turned sideways.
export function tiltFrom({ beta, gamma }, screenAngle = 0) {
  if (beta === null || gamma === null || screenAngle % 180 !== 0) return null;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return { x: clamp(gamma / 30), y: clamp((beta - 45) / 30) };
}

export function mountCup(canvas, { onReady } = {}) {
  const stage = createStage(canvas);
  stage.setCamera(DEFAULT_CAMERA);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const view = { rotation: 0, offset: 0, tilt: [0, 0] };
  const target = { x: 0, y: 0 };
  const controller = new AbortController();
  const { signal } = controller;
  let ready = false;
  let needsRender = true;
  let request = 0;
  let last = 0;

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    stage.setSize(width, height, Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1));
    stage.setFrame({ zoom: Math.min(1, width / height / FIT_ASPECT) });
    needsRender = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const approach = (current, goal, factor) => (Math.abs(goal - current) < 1e-4 ? goal : current + (goal - current) * factor);
  function frame(now) {
    request = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!ready || document.hidden) return;
    const still = reducedMotion.matches;
    const ease = still ? 1 : 1 - Math.exp(-dt / 0.4);
    const follow = still ? { x: 0, y: 0 } : target;
    const before = [view.offset, ...view.tilt].join();
    if (!still) view.rotation = (view.rotation + (dt * Math.PI * 2) / TURN_SECONDS) % (Math.PI * 2);
    view.offset = approach(view.offset, follow.x * 0.35, ease);
    view.tilt[0] = approach(view.tilt[0], follow.y * 0.1, ease);
    view.tilt[1] = approach(view.tilt[1], -follow.x * 0.05, ease);
    if (!still || [view.offset, ...view.tilt].join() !== before) needsRender = true;
    if (!needsRender) return;
    stage.render(
      { background: { hex: "#000000", alpha: 0 }, rotation: view.rotation + view.offset, tilt: view.tilt },
      { transparent: true },
    );
    needsRender = false;
  }
  request = requestAnimationFrame(frame);

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    target.x = (event.clientX / window.innerWidth) * 2 - 1;
    target.y = (event.clientY / window.innerHeight) * 2 - 1;
  }, { signal });
  window.addEventListener("deviceorientation", (event) => {
    const tilt = tiltFrom(event, screen.orientation?.angle ?? 0);
    if (tilt) Object.assign(target, tilt);
  }, { signal });
  // iOS reports tilt only after a permission prompt, which it allows only from a tap. Ask on the first tap
  // that is not on a link or control, so the prompt never gets in the way of an email or phone link.
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const ask = (event) => {
      if (event.target.closest?.("a, button, input, select, textarea, label")) return;
      document.removeEventListener("click", ask);
      DeviceOrientationEvent.requestPermission().catch(() => {});
    };
    document.addEventListener("click", ask, { signal });
  }

  const { columns, rows } = bakeSize(
    window.screen.height * Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1),
    stage.renderer.capabilities.maxTextureSize,
  );
  bakeInWorker(stage.section, null, { signal, columns, rows })
    .then((surface) => {
      stage.setSurface(surface);
      ready = true;
      needsRender = true;
      // The first frame with the glaze is drawn before the page is told, so a fade-in never shows plain clay.
      requestAnimationFrame(() => onReady?.());
    })
    .catch((error) => {
      if (error.name !== "AbortError") console.error(error);
    });

  return function stop() {
    controller.abort();
    cancelAnimationFrame(request);
    observer.disconnect();
    stage.dispose();
  };
}
