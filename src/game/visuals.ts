import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Shared proportions keep the tiles, trays and containers in one molded-toy family. */
export function roundedBox(w: number, h: number, d: number, radius = 0.06) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2));
}

export function pastelBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 1024);
  gradient.addColorStop(0, '#e0e6ed');
  gradient.addColorStop(0.6, '#cbd5df');
  gradient.addColorStop(1, '#b5c3d0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 1024);
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 75;
  for (let x = -1400; x < 1400; x += 220) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 1024, 1024);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(93,60,40,0.22)');
  gradient.addColorStop(0.5, 'rgba(93,60,40,0.10)');
  gradient.addColorStop(1, 'rgba(93,60,40,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

/** A continuous molded strip following an open silhouette, with rounded joins
 * and end caps. The silhouette runs clockwise; its empty side is on the left. */
export function beveledBorder(points: THREE.Vector2[], width: number, depth: number, corner: number) {
  // Collapse collinear cell edges before offsetting, so no seams remain per pixel.
  const path = points.filter((point, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = point.clone().sub(points[i - 1]);
    const after = points[i + 1].clone().sub(point);
    return Math.abs(before.cross(after)) > 1e-8;
  });
  const offset = (distance: number) => path.map((point, i) => {
    const before = path[Math.max(0, i - 1)];
    const after = path[Math.min(path.length - 1, i + 1)];
    const incoming = (i === 0 ? after.clone().sub(point) : point.clone().sub(before)).normalize();
    const outgoing = (i === path.length - 1 ? point.clone().sub(before) : after.clone().sub(point)).normalize();
    const n1 = new THREE.Vector2(-incoming.y, incoming.x);
    const n2 = new THREE.Vector2(-outgoing.y, outgoing.x);
    return point.clone().addScaledVector(n1.add(n2), distance / (1 + incoming.dot(outgoing)));
  });
  const gap = width * 0.28;
  const polygon = [...offset(gap + width), ...offset(gap).reverse()];
  const shape = new THREE.Shape();
  polygon.forEach((point, i) => {
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    const next = polygon[(i + 1) % polygon.length];
    const radius = Math.min(corner, point.distanceTo(prev) * 0.45, point.distanceTo(next) * 0.45);
    const entry = point.clone().lerp(prev, radius / point.distanceTo(prev));
    const leave = point.clone().lerp(next, radius / point.distanceTo(next));
    if (i === 0) shape.moveTo(entry.x, entry.y);
    else shape.lineTo(entry.x, entry.y);
    shape.quadraticCurveTo(point.x, point.y, leave.x, leave.y);
  });
  shape.closePath();
  const bevel = width * 0.2;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, curveSegments: 8,
    bevelEnabled: true, bevelSegments: 4, bevelSize: bevel, bevelThickness: bevel,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
