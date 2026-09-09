import { NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  resample,
  meshopt,
  simplify,
  weld,
} from "@gltf-transform/functions";
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
const mode = process.argv[2] || "report";
await Promise.all([
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
  MeshoptSimplifier.ready,
]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const source = path.resolve("assets/source"),
  runtime = path.resolve("assets/runtime"),
  publicDir = path.resolve("public/assets");
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name === "originals") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(glb|jpg|png|hdr|wav|ogg)$/.test(e.name)) out.push(full);
  }
  return out;
}
if (mode === "process") {
  let before = 0,
    after = 0,
    count = 0;
  for (const input of await walk(source)) {
    const relative = path.relative(source, input),
      output = path.join(runtime, relative);
    await fs.mkdir(path.dirname(output), { recursive: true });
    before += (await fs.stat(input)).size;
    if (input.endsWith(".glb") && !/^upgrade[\\/]/.test(relative)) {
      const doc = await io.read(input);
      doc.setLogger(new Logger(Logger.Verbosity.ERROR));
      await doc.transform(
        dedup(),
        prune(),
        resample(),
        meshopt({ encoder: MeshoptEncoder, level: "high" }),
      );
      await io.write(output, doc);
      if (relative.startsWith("nature") || relative.startsWith("industrial")) {
        const lod = await io.read(input);
        lod.setLogger(new Logger(Logger.Verbosity.ERROR));
        await lod.transform(
          dedup(),
          weld(),
          simplify({
            simplifier: MeshoptSimplifier,
            ratio: 0.45,
            error: 0.025,
          }),
          prune(),
          meshopt({ encoder: MeshoptEncoder, level: "high" }),
        );
        const lodPath = output.replace(".glb", ".lod.glb");
        await io.write(lodPath, lod);
        await fs.mkdir(path.dirname(path.join(publicDir, relative)), {
          recursive: true,
        });
        await fs.copyFile(
          lodPath,
          path.join(publicDir, relative.replace(".glb", ".lod.glb")),
        );
      }
    } else await fs.copyFile(input, output);
    await fs.mkdir(path.dirname(path.join(publicDir, relative)), {
      recursive: true,
    });
    await fs.copyFile(output, path.join(publicDir, relative));
    after += (await fs.stat(output)).size;
    count++;
  }
  console.log(
    JSON.stringify({
      processed: count,
      sourceMB: before / 1e6,
      runtimeMB: after / 1e6,
      reductionPercent: Math.round((1 - after / before) * 100),
    }),
  );
}
const report = [];
for (const file of await walk(runtime)) {
  const data = await fs.readFile(file),
    relative = path.relative(runtime, file).replaceAll("\\", "/");
  let triangles = 0,
    animations = 0,
    textureBytes = 0,
    meshes = 0;
  if (file.endsWith(".glb")) {
    assert.equal(data.readUInt32LE(0), 0x46546c67, relative);
    assert.equal(data.readUInt32LE(8), data.length, relative);
    const doc = await io.read(file);
    for (const mesh of doc.getRoot().listMeshes()) {
      meshes++;
      for (const p of mesh.listPrimitives()) {
        assert.equal(p.getMode(), 4);
        triangles +=
          (p.getIndices()?.getCount() ||
            p.getAttribute("POSITION")?.getCount() ||
            0) / 3;
      }
    }
    animations = doc.getRoot().listAnimations().length;
    for (const t of doc.getRoot().listTextures()) {
      const size = t.getSize();
      if (size) textureBytes += (size[0] * size[1] * 4 * 4) / 3;
    }
  } else if (/\.(jpg|png)$/.test(file))
    textureBytes = (1024 * 1024 * 4 * 4) / 3;
  else if (file.endsWith(".hdr")) textureBytes = (1024 * 512 * 8 * 4) / 3;
  report.push({
    file: relative,
    bytes: data.length,
    triangles,
    meshes,
    animations,
    estimatedTextureBytes: Math.round(textureBytes),
    lod: relative.includes(".lod.")
      ? "simplified"
      : /^(nature|industrial)\//.test(relative)
        ? "has external LOD"
        : "single detail level",
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  });
}
await fs.writeFile(
  "assets/runtime-report.json",
  JSON.stringify(report, null, 2),
);
if (mode === "validate")
  console.log("Validated " + report.length + " self-contained runtime assets.");
else
  console.log(
    JSON.stringify(
      {
        files: report.length,
        MB: report.reduce((n, a) => n + a.bytes, 0) / 1e6,
        triangles: report.reduce((n, a) => n + a.triangles, 0),
        animated: report
          .filter((a) => a.animations)
          .map((a) => ({ file: a.file, clips: a.animations })),
        textureEstimateMB:
          report.reduce((n, a) => n + a.estimatedTextureBytes, 0) / 1048576,
      },
      null,
      2,
    ),
  );
