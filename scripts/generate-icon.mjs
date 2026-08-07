// One-off dev script: rasterizes build/icon.svg into build/icon.png (1024x1024,
// for Linux/general use) and build/icon.ico (multi-size, for the Windows
// installer + BrowserWindow). Not run at app runtime — only when the source
// SVG changes. Run via `npm run icons`.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');
const svgPath = path.join(buildDir, 'icon.svg');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  await mkdir(buildDir, { recursive: true });

  await sharp(svgPath, { density: 384 })
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);

  const sizedPngBuffers = await Promise.all(
    ICO_SIZES.map((size) => sharp(svgPath, { density: 384 }).resize(size, size).png().toBuffer())
  );
  const icoBuffer = await pngToIco(sizedPngBuffers);
  await writeFile(icoPath, icoBuffer);

  console.log(`Wrote ${pngPath}`);
  console.log(`Wrote ${icoPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
