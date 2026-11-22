// Copies the hand-tracking engine (MediaPipe, WebAssembly) and its model into /public/mediapipe, so the camera games
// run fully on the device from this website — no outside service, and the camera picture never leaves the device.
import { copyFileSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const dir = join(dirname(require.resolve('@mediapipe/tasks-vision')), 'wasm');
const out = new URL('../public/mediapipe/', import.meta.url);
mkdirSync(new URL('wasm/', out), { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) copyFileSync(join(dir, f), new URL(`wasm/${f}`, out));
copyFileSync(new URL('../assets/mediapipe/hand_landmarker.task', import.meta.url), new URL('hand_landmarker.task', out));
