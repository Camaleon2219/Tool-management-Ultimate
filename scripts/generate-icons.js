import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const iconsDir = path.join(rootDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Standard high-resolution SVG icon (512x512)
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="millGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#94a3b8" />
      <stop offset="35%" stop-color="#f8fafc" />
      <stop offset="70%" stop-color="#64748b" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>
    <linearGradient id="fluteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="goldTip" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="50%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#2563eb" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- Background with subtle border -->
  <rect width="512" height="512" rx="104" fill="url(#bgGrad)" />
  <rect x="12" y="12" width="488" height="488" rx="92" fill="none" stroke="#3b82f6" stroke-width="4" stroke-opacity="0.35" />

  <!-- Outer CNC Coordinate Grid Ring -->
  <circle cx="256" cy="256" r="190" fill="none" stroke="#334155" stroke-width="3" stroke-dasharray="12 12" />
  <circle cx="256" cy="256" r="140" fill="none" stroke="#1e293b" stroke-width="2" />
  
  <!-- Axis Crosshairs -->
  <line x1="256" y1="46" x2="256" y2="86" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" />
  <line x1="256" y1="426" x2="256" y2="466" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" />
  <line x1="46" y1="256" x2="86" y2="256" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" />
  <line x1="426" y1="256" x2="466" y2="256" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" />

  <!-- Center Milling Tool / Spindle Group -->
  <g filter="url(#glow)">
    <!-- Tool Shank (Upper Part) -->
    <rect x="220" y="90" width="72" height="120" rx="6" fill="url(#millGrad)" />
    <!-- Collet / Holder Band -->
    <rect x="210" y="195" width="92" height="30" rx="4" fill="#475569" stroke="#0f172a" stroke-width="3" />
    <line x1="225" y1="210" x2="287" y2="210" stroke="#f8fafc" stroke-width="3" stroke-linecap="round" />

    <!-- Cutting Body (Lower Part) with Helical Flutes -->
    <rect x="224" y="225" width="64" height="150" rx="4" fill="url(#millGrad)" />
    
    <!-- Helical Cutting Edges / Flutes -->
    <path d="M 224 240 Q 256 265 288 250 L 288 275 Q 256 290 224 265 Z" fill="url(#fluteGrad)" opacity="0.95" />
    <path d="M 224 285 Q 256 310 288 295 L 288 320 Q 256 335 224 310 Z" fill="url(#fluteGrad)" opacity="0.95" />
    <path d="M 224 330 Q 256 355 288 340 L 288 365 Q 256 380 224 355 Z" fill="url(#fluteGrad)" opacity="0.95" />

    <!-- Cutting Tip / VHM Apex -->
    <polygon points="224,375 256,410 288,375" fill="url(#goldTip)" stroke="#d97706" stroke-width="2" />
  </g>

  <!-- FJK CNC Badge -->
  <rect x="156" y="420" width="200" height="42" rx="21" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
  <text x="256" y="447" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="900" fill="#f8fafc" text-anchor="middle" letter-spacing="3">FJK CNC</text>
</svg>`;

// Maskable icon with 15% safe-zone padding on all sides
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="millGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#94a3b8" />
      <stop offset="35%" stop-color="#f8fafc" />
      <stop offset="70%" stop-color="#64748b" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>
    <linearGradient id="fluteGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="goldTip2" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f59e0b" />
      <stop offset="50%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
  </defs>

  <!-- Full-bleed background for maskable shape -->
  <rect width="512" height="512" fill="url(#bgGrad2)" />

  <!-- Center Group scaled down to 76% to fit safely inside maskable safe zone -->
  <g transform="translate(61.44, 61.44) scale(0.76)">
    <!-- Outer Coordinate Ring -->
    <circle cx="256" cy="256" r="190" fill="none" stroke="#334155" stroke-width="4" stroke-dasharray="14 14" />
    <circle cx="256" cy="256" r="140" fill="none" stroke="#1e293b" stroke-width="3" />

    <!-- Axis Crosshairs -->
    <line x1="256" y1="46" x2="256" y2="86" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
    <line x1="256" y1="426" x2="256" y2="466" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
    <line x1="46" y1="256" x2="86" y2="256" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />
    <line x1="426" y1="256" x2="466" y2="256" stroke="#38bdf8" stroke-width="5" stroke-linecap="round" />

    <!-- Milling Tool -->
    <rect x="220" y="90" width="72" height="120" rx="6" fill="url(#millGrad2)" />
    <rect x="210" y="195" width="92" height="30" rx="4" fill="#475569" />
    <rect x="224" y="225" width="64" height="150" rx="4" fill="url(#millGrad2)" />
    <path d="M 224 240 Q 256 265 288 250 L 288 275 Q 256 290 224 265 Z" fill="url(#fluteGrad2)" />
    <path d="M 224 285 Q 256 310 288 295 L 288 320 Q 256 335 224 310 Z" fill="url(#fluteGrad2)" />
    <path d="M 224 330 Q 256 355 288 340 L 288 365 Q 256 380 224 355 Z" fill="url(#fluteGrad2)" />
    <polygon points="224,375 256,410 288,375" fill="url(#goldTip2)" />

    <!-- Badge -->
    <rect x="156" y="420" width="200" height="42" rx="21" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
    <text x="256" y="447" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="900" fill="#f8fafc" text-anchor="middle" letter-spacing="3">FJK CNC</text>
  </g>
</svg>`;

async function run() {
  // Save SVG
  fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgIcon);

  // Generate PNGs using Sharp
  const svgBuffer = Buffer.from(svgIcon);
  const maskableBuffer = Buffer.from(svgMaskable);

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-512.png'));

  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, 'icon-192.png'));

  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, 'icon-maskable-512.png'));

  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, 'apple-touch-icon.png'));

  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(iconsDir, 'favicon-32x32.png'));

  console.log('✅ All PWA icons generated successfully in /icons!');
}

run().catch(console.error);
