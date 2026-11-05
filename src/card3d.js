// 포켓몬 탭's card, drawn in WebGL (three.js): a real slab with rounded corners and some thickness, its face a printed
// card in the Pokemon's type colours with its name and level, the official artwork standing a little in front of the
// face (so it shifts against the card as the card turns), a glossy iridescent coat that catches a light following the
// pointer, and the Rocket R on the back.
// The menu redraws its HTML on every click, so one renderer and canvas live for the whole game: attach() moves the
// canvas into the page's slot each time (and repaints only when the Pokemon changes); detach() stops drawing.
// Pointer over the card: it leans toward it. Drag: turn it round freely (its back shows); let go: it swings back.
// Without WebGL attach() returns false and the page keeps its CSS card.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const W = 2.5, H = 3.5, D = 0.07; // the card, in world units (5:7, like the CSS card)
const TEX_W = 750, TEX_H = 1050; // its face texture, in pixels
const FONT = "'Galmuri11', system-ui, sans-serif";

let gl = null; // { renderer, scene, camera, card, art, light, canvas } once made; false when WebGL is not there
let slot = null, info = null, key = '', running = false, raf = 0;
const pose = { rx: 0, ry: 0, tx: 0, ty: 0, drag: null, spin: 0, spinV: 0 }; // tx, ty: where the pointer wants it
let resize = null;

function setup() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 9);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0a1828, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-3, 4, 6); scene.add(key);
  const light = new THREE.PointLight(0xffffff, 26, 14); light.position.set(0, 0, 4); scene.add(light); // follows the pointer
  // faces: +x, -x, +y, -y, front (+z), back (-z)
  const edge = new THREE.MeshStandardMaterial({ color: 0x8ab8e0, metalness: 0.8, roughness: 0.3 });
  const front = new THREE.MeshPhysicalMaterial({ roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.55, iridescenceIOR: 1.6 });
  const back = new THREE.MeshPhysicalMaterial({ map: backTexture(), roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const card = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 6, 0.14), [edge, edge, edge, edge, front, back]);
  scene.add(card);
  // the artwork: its own plane a little in front of the face, turning with the card
  const art = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.86, W * 0.86), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  art.position.set(0, H * 0.08, D / 2 + 0.18);
  card.add(art);
  const canvas = renderer.domElement;
  canvas.className = 'card3d';
  canvas.addEventListener('pointerdown', e => { pose.drag = { x: e.clientX, spin: pose.spin }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { pose.drag = null; });
  canvas.addEventListener('pointercancel', () => { pose.drag = null; });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    pose.tx = x; pose.ty = y;
    if (pose.drag) pose.spin = pose.drag.spin + (e.clientX - pose.drag.x) / r.width * Math.PI * 1.6;
  });
  canvas.addEventListener('pointerleave', () => { if (!pose.drag) { pose.tx = 0; pose.ty = 0; } });
  resize = new ResizeObserver(fit);
  return { renderer, scene, camera, card, art, light, front, canvas };
}

// the canvas fills the slot; the camera backs off until the whole card fits with a margin
function fit() {
  if (!gl || !slot) return;
  const w = slot.clientWidth, h = slot.clientHeight;
  if (!w || !h) return;
  gl.renderer.setSize(w, h, false);
  gl.camera.aspect = w / h;
  const half = THREE.MathUtils.degToRad(gl.camera.fov / 2);
  gl.camera.position.z = Math.max((H * 0.62) / Math.tan(half), (W * 0.62) / (Math.tan(half) * gl.camera.aspect));
  gl.camera.updateProjectionMatrix();
}

// info: { art, fallback, name, level, no, rank, types: [[label, colour]], c1, c2, caught? }
export function attach(el, data) {
  if (gl === null) gl = setup();
  if (!gl) return false;
  slot = el; info = data;
  el.append(gl.canvas);
  el.classList.add('webgl');
  resize.disconnect(); resize.observe(el); fit();
  const k = JSON.stringify(data);
  if (k !== key) { key = k; paint(); }
  if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  return true;
}
export function detach() {
  running = false; cancelAnimationFrame(raf);
  slot = null; resize?.disconnect();
}

// the face: background in the type colours, rings, a frame, and the label along the foot
function paint() {
  const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, TEX_W * 0.4, TEX_H);
  bg.addColorStop(0, mix(info.c1, '#0a1c30', 0.42)); bg.addColorStop(0.55, mix(info.c2, '#0a1c30', 0.72)); bg.addColorStop(1, '#071626');
  g.fillStyle = bg; g.fillRect(0, 0, TEX_W, TEX_H);
  const glow = g.createRadialGradient(TEX_W / 2, TEX_H * 0.4, 0, TEX_W / 2, TEX_H * 0.4, TEX_W * 0.62);
  glow.addColorStop(0, hexA(info.c2, 0.55)); glow.addColorStop(1, hexA(info.c2, 0));
  g.fillStyle = glow; g.fillRect(0, 0, TEX_W, TEX_H);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 4;
  for (let r = 40; r < TEX_H; r += 56) { g.beginPath(); g.arc(TEX_W / 2, TEX_H * 0.4, r, 0, 7); g.stroke(); }
  // the frame: a bright hairline inside the edge
  g.strokeStyle = hexA(mix(info.c1, '#ffffff', 0.35), 0.9); g.lineWidth = 10;
  roundRect(g, 18, 18, TEX_W - 36, TEX_H - 36, 34); g.stroke();
  // the label: a dark band along the foot with the number and rank, name and level, and the type chips
  const band = g.createLinearGradient(0, TEX_H * 0.66, 0, TEX_H);
  band.addColorStop(0, 'rgba(4,14,26,0)'); band.addColorStop(0.4, 'rgba(4,14,26,0.86)'); band.addColorStop(1, 'rgba(4,14,26,0.95)');
  g.fillStyle = band; g.fillRect(0, TEX_H * 0.66, TEX_W, TEX_H * 0.34);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#b8cfe0'; g.font = `30px ${FONT}`; g.fillText(`No.${info.no} · ${info.rank}`, 56, TEX_H - 236);
  g.fillStyle = '#ffffff'; g.font = `68px ${FONT}`; g.fillText(info.name, 52, TEX_H - 160);
  const nameW = g.measureText(info.name).width;
  g.fillStyle = '#cfe3f2'; g.font = `38px ${FONT}`; g.fillText(`Lv.${info.level}`, 52 + nameW + 18, TEX_H - 162);
  let x = 56;
  for (const [label, colour] of info.types) {
    g.font = `bold 30px ${FONT}`;
    const w = g.measureText(label).width + 56;
    g.fillStyle = colour; roundRect(g, x, TEX_H - 128, w, 50, 25); g.fill();
    g.fillStyle = '#06121e'; g.fillText(label, x + 28, TEX_H - 92);
    x += w + 14;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  gl.front.map?.dispose(); gl.front.map = tex; gl.front.needsUpdate = true;
  new THREE.TextureLoader().load(info.art, setArt, undefined, () => info.fallback && new THREE.TextureLoader().load(info.fallback, setArt));
}
function setArt(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  const m = gl.art.material;
  m.map?.dispose(); m.map = t; m.needsUpdate = true;
  const a = t.image.width / t.image.height; // keep its shape inside the square
  gl.art.scale.set(a >= 1 ? 1 : a, a >= 1 ? 1 / a : 1, 1);
}

// the back: deep red with the Rocket R in a ring
function backTexture() {
  const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(TEX_W / 2, TEX_H / 2, 40, TEX_W / 2, TEX_H / 2, TEX_H * 0.7);
  bg.addColorStop(0, '#c8304a'); bg.addColorStop(1, '#4a0a18');
  g.fillStyle = bg; g.fillRect(0, 0, TEX_W, TEX_H);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3;
  for (let i = -TEX_H; i < TEX_W; i += 36) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + TEX_H, TEX_H); g.stroke(); }
  g.strokeStyle = '#ffd8de'; g.lineWidth = 16; g.beginPath(); g.arc(TEX_W / 2, TEX_H / 2, 200, 0, 7); g.stroke();
  g.fillStyle = '#ffffff'; g.font = `bold 300px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', TEX_W / 2, TEX_H / 2 + 14);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 10; roundRect(g, 18, 18, TEX_W - 36, TEX_H - 36, 34); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let last = 0;
function loop(now) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const k = 1 - Math.pow(0.0005, dt); // easing toward the target, frame-rate independent
  if (!pose.drag) pose.spin += (Math.round(pose.spin / (2 * Math.PI)) * 2 * Math.PI - pose.spin) * k * 0.6; // swings back face-on
  pose.ry += (pose.tx * 0.55 - pose.ry) * k;
  pose.rx += (pose.ty * 0.4 - pose.rx) * k;
  const t = now / 1000, { card, light } = gl;
  card.rotation.set(pose.rx + Math.sin(t * 0.9) * 0.03, pose.ry + pose.spin + Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.7) * 0.01);
  card.position.y = Math.sin(t * 1.1) * 0.06; // bobbing
  light.position.set(pose.tx * 6, -pose.ty * 6, 4);
  gl.renderer.render(gl.scene, gl.camera);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, f) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join(''); };
const hexA = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
