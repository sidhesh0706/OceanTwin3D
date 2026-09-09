import { cp, mkdir } from 'node:fs/promises';

// Ship the pinned prebuilt engine and its relative worker/texture dependencies.
const source = new URL('../node_modules/cesium/Build/Cesium/', import.meta.url);
const destination = new URL('../public/vendor/cesium/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
for (const name of ['LICENSE.md', 'ThirdParty.json', 'ThirdParty.extra.json']) {
  await cp(new URL(`../node_modules/cesium/${name}`, import.meta.url), new URL(name, destination));
}
console.log('Local Cesium engine and assets ready.');
