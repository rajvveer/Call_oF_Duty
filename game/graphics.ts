import * as T from "three";
import { WebGPURenderer, RenderPipeline, PMREMGenerator } from "three/webgpu";
import { pass, vec3, vec4, mix, uv, smoothstep, renderOutput } from "three/tsl";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import type { Settings } from "./settings";

export class GameGraphics {
  private pipeline: RenderPipeline;
  private scenePass: ReturnType<typeof pass>;
  private viewPass: ReturnType<typeof pass>;
  private ambient: ReturnType<typeof ao>;
  private glow: ReturnType<typeof bloom>;
  private environment: T.RenderTarget | null = null;
  private hdr: T.Texture | null = null;
  private advanced = true;
  constructor(
    private renderer: WebGPURenderer,
    private scene: T.Scene,
    camera: T.PerspectiveCamera,
    viewScene: T.Scene,
    viewCamera: T.PerspectiveCamera,
  ) {
    renderer.setClearColor(0x000000, 0);
    this.pipeline = new RenderPipeline(renderer);
    // Depth-reconstructed GTAO requires a single-sample depth texture in WebGPU.
    // FXAA handles edge antialiasing after the world and weapon are composited.
    this.scenePass = pass(scene, camera, { samples: 0 });
    this.viewPass = pass(viewScene, viewCamera, { samples: 0 });
    const color = this.scenePass.getTextureNode("output");
    // The runtime supports depth-reconstructed normals; addon types omit null.
    this.ambient = ao(
      this.scenePass.getTextureNode("depth"),
      null as unknown as Parameters<typeof ao>[1],
      camera,
    );
    this.ambient.radius.value = 0.85;
    this.ambient.thickness.value = 1.2;
    this.ambient.resolutionScale = 0.5;
    this.ambient.samples.value = 8;
    this.glow = bloom(color.min(vec4(4)), 0.11, 0.28, 1.4);
    this.pipeline.outputColorTransform = false;
  }
  async loadEnvironment() {
    this.hdr = await new HDRLoader().loadAsync(
      "/assets/upgrade/environment/qwantani_sunset_puresky_1k.hdr",
    );
    this.hdr.mapping = T.EquirectangularReflectionMapping;
    const generator = new PMREMGenerator(this.renderer);
    this.environment = generator.fromEquirectangular(this.hdr);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.9;
    this.scene.background = this.hdr;
    this.scene.backgroundIntensity = 0.55;
    this.scene.backgroundBlurriness = 0.025;
    this.scene.backgroundRotation.y = 4.3;
    this.scene.environmentRotation.y = 4.3;
    generator.dispose();
  }
  apply(settings: Settings) {
    if (!this.advanced) return;
    const color = this.scenePass.getTextureNode("output");
    this.ambient.samples.value = settings.preset === "ultra" ? 12 : 8;
    this.ambient.resolutionScale = 0.5;
    const shaded =
      settings.preset === "low"
        ? color.rgb
        : color.rgb.mul(mix(0.48, 1, this.ambient.getTextureNode().r));
    const luma = shaded.dot(vec3(0.2126, 0.7152, 0.0722));
    const graded = mix(vec3(luma), shaded, 1.04).mul(vec3(0.99, 1.015, 1.035));
    const vignette = mix(
      1,
      0.92,
      smoothstep(0.3, 0.78, uv().sub(0.5).length()),
    );
    const composed = vec4(graded.mul(vignette), color.a);
    const world = settings.effects ? composed.add(this.glow) : composed;
    const weapon = this.viewPass.getTextureNode("output");
    const combined = vec4(
      world.rgb.mul(weapon.a.oneMinus()).add(weapon.rgb),
      1,
    );
    this.pipeline.outputNode = fxaa(renderOutput(combined));
    this.pipeline.needsUpdate = true;
  }
  render() {
    const toneMapping = this.renderer.toneMapping,
      colorSpace = this.renderer.outputColorSpace,
      autoClear = this.renderer.autoClear;
    try {
      this.pipeline.render();
    } catch (error) {
      if (!this.advanced) throw error;
      this.advanced = false;
      console.warn(
        "Advanced effects unavailable; keeping composited HDR rendering.",
        error,
      );
      this.renderer.setRenderTarget(null);
      this.renderer.setMRT(null);
      const world = this.scenePass.getTextureNode("output"),
        weapon = this.viewPass.getTextureNode("output");
      this.pipeline.outputNode = renderOutput(
        vec4(world.rgb.mul(weapon.a.oneMinus()).add(weapon.rgb), 1),
      );
      this.pipeline.needsUpdate = true;
    } finally {
      this.renderer.toneMapping = toneMapping;
      this.renderer.outputColorSpace = colorSpace;
      this.renderer.autoClear = autoClear;
    }
  }
  dispose() {
    this.pipeline.dispose();
    this.scenePass.dispose();
    this.viewPass.dispose();
    this.ambient.dispose();
    this.glow.dispose();
    this.environment?.dispose();
    this.hdr?.dispose();
  }
}
