import * as THREE from 'three';
import type { ColorKey } from '../shared/types';
import { drawCounter } from './keys';

interface Chip { position: THREE.Vector3; velocity: THREE.Vector3; spin: THREE.Vector3; life: number; duration: number; size: number; }

/** Trace the occupied cells, retaining separate islands and holes in the artwork. */
function iceOutline(cells: THREE.Vector2[], cell: number, cols: number, rows: number) {
  const occupied = new Set(cells.map(p => `${p.x},${p.y}`));
  const edges = new Map<string, THREE.Vector2[]>();
  const add = (x: number, y: number, tx: number, ty: number) => {
    const key = `${x},${y}`;
    const list = edges.get(key) ?? [];
    list.push(new THREE.Vector2(tx, ty)); edges.set(key, list);
  };
  for (const { x, y } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) add(x, y, x + 1, y);
    if (!occupied.has(`${x + 1},${y}`)) add(x + 1, y, x + 1, y + 1);
    if (!occupied.has(`${x},${y + 1}`)) add(x + 1, y + 1, x, y + 1);
    if (!occupied.has(`${x - 1},${y}`)) add(x, y + 1, x, y);
  }
  const loops: THREE.Vector2[][] = [];
  while (edges.size) {
    const start = new THREE.Vector2(...edges.keys().next().value!.split(',').map(Number) as [number, number]);
    const loop: THREE.Vector2[] = [];
    let current = start.clone(), incoming = new THREE.Vector2(1, 0);
    do {
      loop.push(current.clone());
      const key = `${current.x},${current.y}`, next = edges.get(key)!;
      // Keep diagonally touching islands separate at a shared corner.
      next.sort((a, b) => {
        const da = a.clone().sub(current), db = b.clone().sub(current);
        return Math.atan2(incoming.cross(db), incoming.dot(db)) - Math.atan2(incoming.cross(da), incoming.dot(da));
      });
      const point = next.shift()!;
      if (!next.length) edges.delete(key);
      incoming = point.clone().sub(current); current = point;
    } while (!current.equals(start));
    loops.push(loop.filter((p, i) => {
      const before = loop[(i + loop.length - 1) % loop.length], after = loop[(i + 1) % loop.length];
      return Math.abs(p.clone().sub(before).cross(after.clone().sub(p))) > 1e-6;
    }).map(p => new THREE.Vector2((p.x - cols / 2) * cell, (p.y - rows / 2) * cell)));
  }
  const rounded = (points: THREE.Vector2[], path: THREE.Path) => {
    points.forEach((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      const r = Math.min(cell * 0.12, p.distanceTo(prev) * 0.2, p.distanceTo(next) * 0.2);
      const a = p.clone().lerp(prev, r / p.distanceTo(prev)), b = p.clone().lerp(next, r / p.distanceTo(next));
      if (!i) path.moveTo(a.x, a.y); else path.lineTo(a.x, a.y);
      path.quadraticCurveTo(p.x, p.y, b.x, b.y);
    }); path.closePath(); return path;
  };
  const outer = loops.filter(loop => !THREE.ShapeUtils.isClockWise(loop));
  const shapes = outer.map(loop => rounded(loop, new THREE.Shape()) as THREE.Shape);
  const contains = (p: THREE.Vector2, polygon: THREE.Vector2[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    } return inside;
  };
  for (const loop of loops.filter(loop => THREE.ShapeUtils.isClockWise(loop))) {
    const owner = outer.findIndex(polygon => contains(loop[0], polygon));
    if (owner >= 0) shapes[owner].holes.push(rounded(loop, new THREE.Path()));
  }
  return shapes;
}

/** A two-sided sculpted ice shell. Impacts frost the cracks, then shed solid shards. */
export class BoardIce {
  readonly group = new THREE.Group();
  private readonly shell: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>;
  private readonly labels = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private readonly labelMaterial: THREE.MeshBasicMaterial;
  private readonly labelGeometry: THREE.PlaneGeometry;
  private readonly chipGeometry = new THREE.TetrahedronGeometry(1, 0);
  private readonly chipMaterial = new THREE.MeshStandardMaterial({ color: 0xb7efff, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.85, emissive: 0x77c5e7, emissiveIntensity: 0.22 });
  private readonly chips = new THREE.InstancedMesh(this.chipGeometry, this.chipMaterial, 96);
  private readonly pose = new THREE.Object3D();
  private readonly pieces: Chip[] = [];
  private readonly points: THREE.Vector3[];
  private serial = 0;
  private hitPulse = 0;
  private breakTime = -1;
  private readonly uniforms = {
    iceTime: { value: 0 }, iceDamage: { value: 0 }, iceHit: { value: 0 },
    iceImpact: { value: new THREE.Vector2() },
  };

  constructor(private readonly cell: number, cols: number, rows: number, cells: THREE.Vector2[], private readonly color: ColorKey, private readonly total: number) {
    this.group.name = 'board-ice';
    this.points = cells.map(p => new THREE.Vector3((p.x - (cols - 1) / 2) * cell, (p.y - (rows - 1) / 2) * cell, 0));
    const geometry = new THREE.ExtrudeGeometry(iceOutline(cells, cell, cols, rows), {
      depth: cell * 1.1, steps: 1, curveSegments: 3, bevelEnabled: true,
      bevelSize: cell * 0.12, bevelThickness: cell * 0.22, bevelSegments: 3,
    });
    geometry.translate(0, 0, -cell * 0.55);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x9cdef3, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
      transparent: true, opacity: 0.43, depthWrite: false, emissive: 0x448fbd, emissiveIntensity: 0.12,
    });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'varying vec2 icePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nicePosition = position.xy / ${cell.toFixed(8)};`);
      shader.fragmentShader = `
        varying vec2 icePosition;
        uniform float iceTime, iceDamage, iceHit;
        uniform vec2 iceImpact;
        vec2 iceHash(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)))) * 43758.5453); }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 q = icePosition * 0.62;
        vec2 base = floor(q), f = fract(q);
        float nearest = 8.0, second = 8.0;
        vec2 seed = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 candidate = offset + iceHash(base + offset) - f;
          float d = dot(candidate, candidate);
          if (d < nearest) { second = nearest; nearest = d; seed = base + offset; }
          else second = min(second, d);
        }
        float seam = 1.0 - smoothstep(0.012, 0.047, second - nearest);
        float fracture = smoothstep(iceHash(seed).x * 0.72, iceHash(seed).x * 0.72 + 0.22, iceDamage);
        float cracks = seam * fracture;
        float facet = iceHash(seed).y;
        float sheen = pow(max(0.0, sin(icePosition.x * 0.65 + icePosition.y * 0.42 + 0.4 + sin(iceTime * 0.45) * 0.12)), 20.0);
        float wave = exp(-pow((length(icePosition - iceImpact) - (1.0 - iceHit) * 7.0) * 1.5, 2.0)) * iceHit;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.96, 1.0), facet * 0.12 + sheen * 0.42 + cracks * 0.72 + wave * 0.4);
        diffuseColor.a = clamp(0.4 + facet * 0.14 + sheen * 0.13 + cracks * 0.48 + wave * 0.24, 0.0, 0.92);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
        #include <normal_fragment_begin>
        float iceRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.94, 1.0), iceRim * 0.85);
        diffuseColor.a = max(diffuseColor.a, iceRim * 0.92);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.38, 0.66, 0.8) * (cracks * 0.23 + wave * 0.28);
      `);
    };
    material.customProgramCacheKey = () => `board-ice-${cell}`;
    this.shell = new THREE.Mesh(geometry, material);
    this.shell.name = 'ice-shell';
    this.shell.renderOrder = 2;
    this.group.add(this.shell);
    this.canvas.width = 256; this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.labelMaterial = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, depthWrite: false });
    this.labelGeometry = new THREE.PlaneGeometry(cell * 4.4, cell * 2.2);
    for (const face of [1, -1]) {
      const label = new THREE.Mesh(this.labelGeometry, this.labelMaterial);
      label.name = face === 1 ? 'ice-counter-front' : 'ice-counter-back';
      label.position.z = face * cell * 1.02;
      label.rotation.y = face === 1 ? 0 : Math.PI;
      label.renderOrder = 4; this.labels.add(label);
    }
    this.group.add(this.labels);
    this.chips.count = 0; this.chips.frustumCulled = false;
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chips.name = 'ice-shards'; this.group.add(this.chips);
    this.setCounter(total);
  }

  private setCounter(remaining: number) {
    drawCounter(this.canvas.getContext('2d')!, String(remaining), { swatch: this.color, icy: true });
    this.texture.needsUpdate = true;
  }

  impactPoint(source: THREE.Vector3, index: number) {
    const outsideLabel = this.points.filter(p => Math.abs(p.x) > this.cell * 2.3 || Math.abs(p.y) > this.cell * 1.3);
    const pool = outsideLabel.length ? outsideLabel : this.points;
    const p = pool[(index * 7 + Math.floor(pool.length * 0.37)) % pool.length]?.clone() ?? new THREE.Vector3();
    p.z = (source.z >= 0 ? 1 : -1) * this.cell * 0.8;
    return p;
  }

  /** `remaining` is the counter; `progress` counts containers delivered, fractions included. */
  hit(remaining: number, point: THREE.Vector3, progress = this.total - remaining) {
    if (this.breakTime >= 0) return;
    this.setCounter(remaining);
    this.uniforms.iceDamage.value = Math.min(1, progress / this.total);
    this.uniforms.iceImpact.value.set(point.x / this.cell, point.y / this.cell);
    this.hitPulse = 1;
    this.emit(point, 7, false);
  }

  shatter() {
    if (this.breakTime >= 0) return;
    this.breakTime = 0; this.hitPulse = 1; this.uniforms.iceDamage.value = 1;
    const stride = Math.max(1, Math.ceil(this.points.length / 28));
    for (let i = 0; i < this.points.length; i += stride) for (const face of [-1, 1]) {
      const p = this.points[i].clone(); p.z = face * this.cell * 0.8;
      this.emit(p, 1, true);
    }
  }

  private emit(point: THREE.Vector3, count: number, large: boolean) {
    for (let i = 0; i < count; i++) {
      if (this.pieces.length === 96) this.pieces.shift();
      const n = this.serial++, angle = n * 2.39996, duration = large ? 0.85 + n % 4 * 0.07 : 0.38 + n % 3 * 0.08;
      this.pieces.push({ position: point.clone(), velocity: new THREE.Vector3(Math.cos(angle) * (large ? 1.4 : 0.7), 0.9 + n % 3 * 0.3, Math.sign(point.z) * (0.6 + n % 4 * 0.2)),
        spin: new THREE.Vector3(n * 0.7, n * 1.3, n), life: duration, duration, size: this.cell * (large ? 0.65 + n % 3 * 0.18 : 0.2 + n % 3 * 0.08) });
    }
  }

  get phase() { return this.breakTime >= 0 ? 'shattering' : this.uniforms.iceDamage.value > 0 ? 'cracked' : 'frozen'; }

  update(dt: number, time: number) {
    this.uniforms.iceTime.value = time;
    this.hitPulse = Math.max(0, this.hitPulse - dt / 0.38);
    this.uniforms.iceHit.value = this.hitPulse;
    this.labels.scale.setScalar(1 + Math.sin(this.hitPulse * Math.PI) * 0.16);
    if (this.breakTime >= 0) {
      this.breakTime += dt;
      this.shell.visible = this.breakTime < 0.09;
      this.labelMaterial.opacity = 1 - THREE.MathUtils.smoothstep(this.breakTime, 0, 0.2);
      this.labels.visible = this.breakTime < 0.2;
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]; p.life -= dt;
      if (p.life <= 0) { this.pieces.splice(i, 1); continue; }
      p.velocity.y -= dt * 4.8; p.position.addScaledVector(p.velocity, dt);
      p.spin.x += dt * 2.8; p.spin.z += dt * 1.9;
    }
    this.pieces.forEach((p, i) => {
      this.pose.position.copy(p.position); this.pose.rotation.set(p.spin.x, p.spin.y, p.spin.z);
      const s = p.size * Math.min(1, p.life / 0.25);
      this.pose.scale.set(s, s * 1.3, s * 0.4); this.pose.updateMatrix(); this.chips.setMatrixAt(i, this.pose.matrix);
    });
    this.chips.count = this.pieces.length; this.chips.instanceMatrix.needsUpdate = true;
    return this.breakTime > 0.2 && !this.pieces.length;
  }

  dispose() {
    this.group.removeFromParent(); this.shell.geometry.dispose(); this.shell.material.dispose();
    this.labelGeometry.dispose(); this.labelMaterial.dispose(); this.texture.dispose();
    this.chips.dispose(); this.chipGeometry.dispose(); this.chipMaterial.dispose();
  }
}
