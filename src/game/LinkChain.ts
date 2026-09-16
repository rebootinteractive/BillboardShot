import * as THREE from 'three';
import type { Shooter } from './Shooter';

const MAX_LINKS = 40;
const LINK_STEP = 0.1;

/** A chain of small rings joining two linked containers while both wait in the queue. */
export class LinkChain {
  private readonly geometry = new THREE.TorusGeometry(0.045, 0.014, 6, 14);
  private readonly material = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.5 });
  private readonly mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_LINKS);
  private readonly dummy = new THREE.Object3D();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private flashT = 0;

  constructor(parent: THREE.Object3D, readonly a: Shooter, readonly b: Shooter, private readonly height: number) {
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  /** Pulse the chain red, when a tap is refused because of the link. */
  flash() { this.flashT = 0.5; }

  update(dt: number, time: number) {
    const { a, b } = this;
    const show = a.state === 'queue' && b.state === 'queue' && a.group.visible && b.group.visible;
    this.mesh.visible = show;
    if (!show) return;
    this.flashT = Math.max(0, this.flashT - dt);
    this.material.emissive.setRGB(Math.sin(this.flashT * 25) > 0 ? this.flashT * 0.9 : 0, 0, 0);

    this.from.copy(a.group.position);
    this.to.copy(b.group.position);
    this.from.y += this.height;
    this.to.y += this.height;
    this.dir.subVectors(this.to, this.from);
    const length = this.dir.length();
    this.dir.normalize();
    // Start and end at the container walls, not their centers.
    const inset = 0.26;
    this.from.addScaledVector(this.dir, inset);
    const span = Math.max(0, length - inset * 2);
    const count = Math.min(MAX_LINKS, Math.max(2, Math.round(span / LINK_STEP) + 1));
    const yaw = Math.atan2(this.dir.x, this.dir.z);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      this.dummy.position.copy(this.from).addScaledVector(this.dir, span * t);
      // A slight sag in the middle, with a little life to it.
      this.dummy.position.y -= Math.sin(t * Math.PI) * (0.05 + Math.sin(time * 2) * 0.006);
      // Rings lie along the chain, alternating upright and flat like real links.
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.rotateY(Math.PI / 2);
      if (i % 2 === 1) this.dummy.rotateX(Math.PI / 2);
      this.dummy.scale.set(1.5, 1, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
