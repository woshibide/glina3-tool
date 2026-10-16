// Bakes the cup surface off the main thread; the bake takes about two seconds on a laptop.
// Posts { progress } while working, then { bake } with its buffers transferred.
import { bakeSurface } from "./surface.js";

self.onmessage = ({ data }) => {
  const bake = bakeSurface({ ...data, onProgress: (progress) => self.postMessage({ progress }) });
  self.postMessage({ bake }, [bake.albedo.buffer, bake.normal.buffer, bake.orm.buffer, bake.height.buffer]);
};
