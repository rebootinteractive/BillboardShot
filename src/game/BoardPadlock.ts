import * as THREE from 'three';
import { roundedBox } from './visuals';
import { KEY_HEX, type KeyColor } from './keys';

interface ChainLink { position: THREE.Vector3; angle: number; side: number; t: number; }

/** A molded padlock with chains draped across both faces of the frame. */
export class BoardPadlock {
  readonly group = new THREE.Group();
  readonly socket = new THREE.Object3D();
  private readonly body = new THREE.Group();
  private readonly shackle = new THREE.Group();
  private readonly links: THREE.InstancedMesh;
  private readonly linkPose = new THREE.Object3D();
  private readonly chain: ChainLink[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly bodyY: number;
  private unlockT = -1;
  private approach = 0;

  constructor(color: KeyColor, private readonly cell: number, mounts: THREE.Vector2[], height: number) {
    // Keep short boards readable without changing the frame attachment points.
    this.cell = cell = Math.min(cell, height / 8);
    this.group.name = 'board-padlock';
    const metal = this.material(KEY_HEX[color], 0.3, 0.18);
    const edge = this.material(new THREE.Color(KEY_HEX[color]).multiplyScalar(0.67), 0.4, 0.15);
    const cream = this.material(0xfff0d0, 0.36, 0.08);
    const face = this.material(new THREE.Color(KEY_HEX[color]).lerp(new THREE.Color(0xffefbf), 0.25), 0.28, 0.12);
    const dark = this.material(0x654a32, 0.65, 0);
    this.bodyY = -height * 0.08;
    this.body.position.set(0, this.bodyY, cell * 1.25);
    this.body.name = 'lock-body';
    this.group.add(this.body);

    this.box(this.body, 3.6, 2.95, 0.8, 0.55, cream, 0, 0, 0);
    this.box(this.body, 3.22, 2.57, 1.0, 0.5, metal, 0, 0, 0.22);
    this.box(this.body, 2.8, 2.14, 0.14, 0.4, face, 0, 0.03, 0.76);
    // An inset keyhole, with a bevelled collar to read cleanly at phone scale.
    const collar = this.mesh(new THREE.CylinderGeometry(cell * 0.54, cell * 0.54, cell * 0.12, 32), cream);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -cell * 0.08, cell * 0.9);
    this.body.add(collar);
    const hole = new THREE.Shape();
    hole.moveTo(-0.13 * cell, -0.43 * cell);
    hole.lineTo(0.13 * cell, -0.43 * cell);
    hole.lineTo(0.1 * cell, -0.05 * cell);
    hole.absarc(0, cell * 0.1, cell * 0.23, -Math.PI / 3, Math.PI * 4 / 3, false);
    hole.closePath();
    const keyhole = this.mesh(new THREE.ShapeGeometry(hole, 20), dark);
    keyhole.position.set(0, 0, cell * 0.969);
    this.body.add(keyhole);
    for (const side of [-1, 1]) {
      this.box(this.body, 0.46, 0.22, 0.16, 0.07, edge, side * 0.99, 1.16, 0.63);
    }

    // U-shaped shackle with straight legs, curved shoulders and one anchored hinge.
    const path = new THREE.CurvePath<THREE.Vector3>();
    const v = (x: number, y: number) => new THREE.Vector3(x * cell, y * cell, cell * 0.08);
    path.add(new THREE.LineCurve3(v(-1, 1.05), v(-1, 1.9)));
    path.add(new THREE.CubicBezierCurve3(v(-1, 1.9), v(-1, 3.05), v(1, 3.05), v(1, 1.9)));
    path.add(new THREE.LineCurve3(v(1, 1.9), v(1, 1.05)));
    const shackleGeo = new THREE.TubeGeometry(path, 40, cell * 0.24, 10, false);
    shackleGeo.translate(cell, -cell * 1.05, 0);
    this.shackle.position.set(-cell, cell * 1.05, 0);
    this.shackle.name = 'lock-shackle';
    this.shackle.add(this.mesh(shackleGeo, cream));
    this.body.add(this.shackle);

    this.socket.position.set(0, this.bodyY - cell * 0.08, cell * 2.3);
    this.group.add(this.socket);

    const chainMaterial = this.material(new THREE.Color(KEY_HEX[color]).lerp(new THREE.Color(0xffefcf), 0.3), 0.34, 0.25);
    mounts.forEach((mount, sideIndex) => {
      const side = sideIndex === 0 ? -1 : 1;
      const anchor = new THREE.Group();
      anchor.name = 'chain-anchor';
      anchor.position.set(mount.x, mount.y, cell * 0.75);
      this.group.add(anchor);
      this.box(anchor, 0.95, 1.16, 0.6, 0.24, cream, 0, 0, 0);
      const stud = this.mesh(new THREE.SphereGeometry(cell * 0.22, 12, 8), metal);
      stud.position.z = cell * 0.36;
      anchor.add(stud);
      // Reuse the molded anchor on the rear face, with its stud pointing outward.
      const rearAnchor = anchor.clone();
      rearAnchor.name = 'rear-chain-anchor';
      rearAnchor.position.z *= -1;
      rearAnchor.rotation.y = Math.PI;
      this.group.add(rearAnchor);
      for (const face of [1, -1]) {
        // The rear chain joins at the center instead of stopping at a second lock.
        const end = new THREE.Vector3(
          face === 1 ? side * cell * 1.35 : 0,
          this.bodyY + cell * (face === 1 ? 0.65 : 0.15),
          face * cell * 1.65,
        );
        const from = new THREE.Vector3(mount.x, mount.y, face * cell * 1.13);
        const count = Math.max(3, Math.ceil(from.distanceTo(end) / (cell * 0.56)));
        for (let i = 0; i < count; i++) {
          // Only one half owns the shared center link on the rear.
          if (face === -1 && side === 1 && i === count - 1) continue;
          const t = i / (count - 1);
          const p = from.clone().lerp(end, t);
          p.y -= Math.sin(t * Math.PI) * cell * 0.45;
          const tangent = end.clone().sub(from);
          tangent.y -= Math.cos(t * Math.PI) * Math.PI * cell * 0.45;
          this.chain.push({ position: p, angle: Math.atan2(tangent.y, tangent.x), side, t });
        }
      }
    });
    const linkGeo = new THREE.TorusGeometry(cell * 0.265, cell * 0.09, 8, 16);
    this.geometries.push(linkGeo);
    this.links = new THREE.InstancedMesh(linkGeo, chainMaterial, this.chain.length);
    this.links.name = 'lock-chain-links';
    this.links.castShadow = true;
    this.links.frustumCulled = false;
    this.links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.links);
    this.update(0, 0);
  }

  private material(color: THREE.ColorRepresentation, roughness: number, metalness: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.materials.push(material);
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private box(parent: THREE.Object3D, w: number, h: number, d: number, radius: number, mat: THREE.Material, x: number, y: number, z: number) {
    const c = this.cell;
    const mesh = this.mesh(roundedBox(w * c, h * c, d * c, radius * c), mat);
    mesh.position.set(x * c, y * c, z * c);
    parent.add(mesh);
    return mesh;
  }

  keyApproaching(progress: number) { this.approach = progress; }

  unlock() {
    if (this.unlockT >= 0) return;
    this.unlockT = 0;
    for (const mat of this.materials) { mat.transparent = true; mat.depthWrite = false; mat.needsUpdate = true; }
  }

  get phase() { return this.unlockT < 0 ? (this.approach > 0 ? 'key-approaching' : 'locked') : this.unlockT < 0.3 ? 'shackle-opening' : 'chains-releasing'; }

  /** Returns true after the unlocked hardware has fallen clear. */
  update(dt: number, time: number) {
    if (this.unlockT >= 0) this.unlockT = Math.min(1, this.unlockT + dt / 0.85);
    const t = Math.max(0, this.unlockT);
    const open = THREE.MathUtils.smoothstep(t, 0, 0.32);
    const release = THREE.MathUtils.smoothstep(t, 0.2, 1);
    const fade = THREE.MathUtils.smoothstep(t, 0.48, 1);
    const breath = this.unlockT < 0 ? Math.sin(time * 1.7) * 0.012 + Math.sin(this.approach * Math.PI) * 0.045 : Math.sin(open * Math.PI) * 0.08;
    this.body.scale.setScalar(1 + breath);
    this.body.position.y = this.bodyY - release * release * this.cell * 5;
    this.body.rotation.z = release * -0.22;
    this.shackle.position.y = this.cell * (1.05 + open * 0.35);
    this.shackle.rotation.y = open * -0.9;
    this.shackle.rotation.z = open * -0.16;
    this.chain.forEach((link, i) => {
      const loose = release * (0.3 + link.t * 0.7);
      this.linkPose.position.copy(link.position);
      this.linkPose.position.x += link.side * loose * this.cell * 2.2;
      this.linkPose.position.y -= loose * loose * this.cell * (4 + link.t * 3);
      this.linkPose.rotation.set(0, 0, link.angle + link.side * loose * 1.2);
      this.linkPose.rotateX(i % 2 === 0 ? 0.18 : Math.PI * 0.37);
      this.linkPose.scale.set(1.45, 1, 1);
      this.linkPose.updateMatrix();
      this.links.setMatrixAt(i, this.linkPose.matrix);
    });
    this.links.instanceMatrix.needsUpdate = true;
    if (this.unlockT >= 0) for (const mat of this.materials) mat.opacity = 1 - fade;
    return this.unlockT >= 1;
  }

  dispose() {
    this.group.removeFromParent();
    this.links.dispose();
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
  }
}
