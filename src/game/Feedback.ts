import * as THREE from 'three';

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  duration: number;
  size: number;
}

/** Bounded particle pool: collection feedback stays inexpensive on a phone. */
export class Feedback {
  private readonly geometry = new THREE.OctahedronGeometry(1, 0);
  private readonly material = new THREE.MeshBasicMaterial({ toneMapped: false });
  private readonly mesh = new THREE.InstancedMesh(this.geometry, this.material, 96);
  private readonly dummy = new THREE.Object3D();
  private sparks: Spark[] = [];
  private audio: AudioContext | null = null;
  private lastNote = 0;
  private notes = 0;

  constructor(scene: THREE.Object3D) {
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  unlock() {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
    } catch { /* Audio is optional on browsers without Web Audio. */ }
  }

  note(kind: 'tap' | 'land' | 'complete') {
    const ctx = this.audio;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (kind === 'land' && now - this.lastNote < 0.075) return;
    this.lastNote = now;
    const frequencies = [523.25, 587.33, 659.25, 783.99, 880];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const hz = kind === 'tap' ? 330 : frequencies[this.notes++ % frequencies.length];
    osc.frequency.setValueAtTime(hz * (kind === 'complete' ? 1.5 : 1), now);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.8, now + 0.16);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(kind === 'land' ? 0.018 : 0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  burst(position: THREE.Vector3, color: number, complete = false) {
    const count = complete ? 16 : 3;
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= 96) this.sparks.shift();
      const angle = (i / count) * Math.PI * 2 + this.notes;
      const speed = complete ? 1.4 + (i % 3) * 0.35 : 0.5;
      const duration = complete ? 0.65 : 0.28;
      this.sparks.push({
        position: position.clone(),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, complete ? 1.4 + (i % 4) * 0.25 : 0.55, Math.sin(angle) * speed),
        color: new THREE.Color(i % 3 === 0 ? 0xfffcdf : color),
        life: duration, duration, size: complete ? 0.07 : 0.038,
      });
    }
  }

  update(dt: number) {
    this.sparks = this.sparks.filter(spark => (spark.life -= dt) > 0);
    this.sparks.forEach((spark, i) => {
      spark.velocity.y -= dt * 3.8;
      spark.position.addScaledVector(spark.velocity, dt);
      this.dummy.position.copy(spark.position);
      this.dummy.rotation.set(spark.life * 5, spark.life * 3, spark.life * 4);
      this.dummy.scale.setScalar(spark.size * Math.sin(Math.PI * Math.min(1, spark.life / spark.duration) * 0.5));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, spark.color);
    });
    this.mesh.count = this.sparks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.sparks = []; this.mesh.count = 0; }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    if (this.audio) void this.audio.close().catch(() => {});
  }
}
