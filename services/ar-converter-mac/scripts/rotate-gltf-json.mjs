import fs from "node:fs/promises";

function nearlyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

async function main() {
  const [jsonPath, txRaw, tyRaw, tzRaw, rxRaw, ryRaw, rzRaw, rwRaw, sxRaw, syRaw, szRaw] =
    process.argv.slice(2);
  if (!jsonPath) {
    throw new Error(
      "Usage: node rotate-gltf-json.mjs <file.gltf> <tx> <ty> <tz> <qx> <qy> <qz> <qw> <sx> <sy> <sz>",
    );
  }

  const translation = [Number(txRaw || 0), Number(tyRaw || 0), Number(tzRaw || 0)];
  const rotation = [
    Number(rxRaw || 0),
    Number(ryRaw || 0),
    Number(rzRaw || 0),
    Number(rwRaw || 1),
  ];
  const scale = [Number(sxRaw || 1), Number(syRaw || 1), Number(szRaw || 1)];

  const identityTransform =
    translation.every((value) => nearlyEqual(value, 0)) &&
    nearlyEqual(rotation[0], 0) &&
    nearlyEqual(rotation[1], 0) &&
    nearlyEqual(rotation[2], 0) &&
    nearlyEqual(rotation[3], 1) &&
    scale.every((value) => nearlyEqual(value, 1));
  if (identityTransform) {
    return;
  }

  const document = JSON.parse(await fs.readFile(jsonPath, "utf8"));
  document.nodes ??= [];
  document.scenes ??= [];

  document.scenes = document.scenes.map((scene, sceneIndex) => {
    const existingNodes = Array.isArray(scene.nodes) ? [...scene.nodes] : [];
    if (existingNodes.length === 0) {
      return scene;
    }

    const wrapperIndex = document.nodes.length;
    document.nodes.push({
      name: `MenuviumOrientationWrapper_${sceneIndex}`,
      translation,
      rotation,
      scale,
      children: existingNodes,
    });

    return {
      ...scene,
      nodes: [wrapperIndex],
    };
  });

  await fs.writeFile(jsonPath, JSON.stringify(document, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
