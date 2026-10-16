// Standalone preview of the background cup (npm run start); the website mounts it the same way.
import { mountCup } from "./background.js";

const canvas = document.querySelector("canvas");
mountCup(canvas, { onReady: () => canvas.classList.add("ready") });
