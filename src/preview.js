// Keep the counter visible while Three.js downloads and the surface worker runs.
import "./preview.css";
import artworkUrl from "../artwork/2.png?url&no-inline";

export async function showCup(canvas, loader) {
  loader.hidden = false;
  const number = loader.querySelector("span");
  try {
    const { mountCup } = await import("./background.js");
    mountCup(canvas, {
      artworkUrl,
      onProgress(fraction) {
        const percent = Math.min(99, Math.floor(fraction * 100));
        number.textContent = percent;
        loader.setAttribute("aria-valuenow", percent);
      },
      onReady() {
        number.textContent = "100";
        loader.setAttribute("aria-valuenow", 100);
        canvas.classList.add("is-ready");
        requestAnimationFrame(() => loader.classList.add("is-ready"));
      },
      onError(error) {
        loader.hidden = true;
        console.error(error);
      },
    });
  } catch (error) {
    loader.hidden = true;
    console.error(error);
  }
}
