// Paints rock chunks off the main thread (rock.js), so chunks coming into view are ready without a hitch.
// Message in: { id, scene, cx, cy, gates: [{ kind, zone, open }] }; out: { id, px } (RGBA bytes, or null).
import * as M from './map.js';
import { paintChunk } from './rock.js';

onmessage = ({ data: { id, scene, cx, cy, gates } }) => {
  if (M.scene !== scene) M.setScene(scene);
  const px = paintChunk(cx, cy, g => gates.some(o => o.kind === g.kind && o.zone === g.zone && o.open));
  postMessage({ id, px }, px ? [px.buffer] : []);
};
