import RAPIER from "@dimforge/rapier3d-compat";
import { colliders, groundHeight } from "../../packages/game-shared/map";
import { TICK } from "../../packages/game-shared/data";
import type { Projectile } from "../../packages/game-shared/protocol";
export async function initPhysics() {
  await RAPIER.init();
}
export class GrenadePhysics {
  private world = new RAPIER.World({ x: 0, y: -19.6, z: 0 });
  private bodies = new Map<string, RAPIER.RigidBody>();
  constructor() {
    this.world.timestep = TICK;
    for (const c of colliders)
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(c.w / 2, c.h / 2, c.d / 2).setTranslation(
          c.x,
          c.y,
          c.z,
        ),
      );
    const n = 85,
      heights = new Float32Array((n + 1) * (n + 1));
    for (let z = 0; z <= n; z++)
      for (let x = 0; x <= n; x++)
        heights[x * (n + 1) + z] = groundHeight(
          (x / n) * 680 - 340,
          (z / n) * 680 - 340,
        );
    this.world.createCollider(
      RAPIER.ColliderDesc.heightfield(n, n, heights, { x: 680, y: 1, z: 680 }),
    );
  }
  add(g: Projectile) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(g.x, g.y, g.z)
        .setLinvel(g.vx, g.vy, g.vz)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.12).setRestitution(0.48).setFriction(0.65),
      body,
    );
    this.bodies.set(g.id, body);
  }
  step() {
    if (this.bodies.size) this.world.step();
  }
  position(id: string) {
    return this.bodies.get(id)?.translation();
  }
  remove(id: string) {
    const b = this.bodies.get(id);
    if (b) this.world.removeRigidBody(b);
    this.bodies.delete(id);
  }
  dispose() {
    this.world.free();
  }
}
