// Bakes the cup surface off the main thread; the bake takes about two seconds.
import { bakeSurface } from "./surface.js";

self.onmessage = ({ data }) => {
  const bake = bakeSurface(data);
  self.postMessage(bake, [bake.albedo.buffer, bake.normal.buffer, bake.orm.buffer, bake.height.buffer]);
};
