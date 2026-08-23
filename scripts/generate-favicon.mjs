import fs from "node:fs";
import puppeteer from "puppeteer-core";

// 1. Define tailored Milestone Yearbook SVG Icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="40%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#090D16" />
    </linearGradient>

    <!-- Gold Accent Gradient -->
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A" />
      <stop offset="35%" stop-color="#F59E0B" />
      <stop offset="70%" stop-color="#D97706" />
      <stop offset="100%" stop-color="#B45309" />
    </linearGradient>

    <!-- Silver / Page Gradient -->
    <linearGradient id="pageLeftGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#CBD5E1" />
      <stop offset="100%" stop-color="#FFFFFF" />
    </linearGradient>

    <linearGradient id="pageRightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#E2E8F0" />
    </linearGradient>

    <!-- Subtle Glow Filter -->
    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>

    <!-- Drop Shadow for Book Spread -->
    <filter id="bookShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Base Badge / Squircle -->
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bgGrad)" />
  
  <!-- Outer Gold Rim -->
  <rect x="24" y="24" width="464" height="464" rx="112" fill="none" stroke="url(#goldGrad)" stroke-width="12" stroke-opacity="0.85" />
  
  <!-- Inner Subtle Inset Ring -->
  <rect x="40" y="40" width="432" height="432" rx="96" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.12" />

  <!-- Book & Milestone Graphic Group -->
  <g filter="url(#bookShadow)">
    <!-- Hardcover Base / Spine Foundation (Deep Navy/Indigo) -->
    <path d="M 96 364 C 180 344, 236 376, 256 392 C 276 376, 332 344, 416 364 L 416 384 C 332 364, 276 396, 256 412 C 236 396, 180 364, 96 384 Z" fill="#334155" opacity="0.9" />

    <!-- Left Open Page Spread -->
    <path d="M 112 188 C 176 168, 224 196, 252 214 L 252 380 C 224 362, 176 334, 112 354 Z" fill="url(#pageLeftGrad)" />
    
    <!-- Right Open Page Spread -->
    <path d="M 400 188 C 336 168, 288 196, 260 214 L 260 380 C 288 362, 336 334, 400 354 Z" fill="url(#pageRightGrad)" />

    <!-- Spine Center Crease / Gold Accent -->
    <path d="M 252 214 L 260 214 L 260 380 L 252 380 Z" fill="#94A3B8" />

    <!-- Left Inner Page Lines -->
    <path d="M 144 236 C 180 222, 212 238, 232 250" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />
    <path d="M 144 268 C 180 254, 212 270, 232 282" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />
    <path d="M 144 300 C 180 286, 212 302, 232 314" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />

    <!-- Right Inner Page Lines -->
    <path d="M 368 236 C 332 222, 300 238, 280 250" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />
    <path d="M 368 268 C 332 254, 300 270, 280 282" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />
    <path d="M 368 300 C 332 286, 300 302, 280 314" stroke="#94A3B8" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6" />

    <!-- Stylized Milestone Diamond / Bookmark Crown (Gold Crest) -->
    <g filter="url(#goldGlow)">
      <!-- Golden Milestone Crest / Star atop Center -->
      <polygon points="256,92 280,144 336,148 292,186 306,240 256,210 206,240 220,186 176,148 232,144" fill="url(#goldGrad)" />
      
      <!-- Inner Diamond Facet -->
      <polygon points="256,120 272,154 256,196 240,154" fill="#FEF08A" opacity="0.75" />
    </g>

    <!-- Milestone Lettermark 'M' Crown Banner in Gold -->
    <path d="M 196 112 L 256 156 L 316 112 L 316 136 L 256 180 L 196 136 Z" fill="url(#goldGrad)" opacity="0.4" />
  </g>
</svg>`;

// Helper: Build a minimal valid ICO file from PNG buffers
function createIco(pngBuffers) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const directorySize = 16 * numImages;
  let offset = headerSize + directorySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  for (const { width, height, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // File offset
    dirEntries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((b) => b.buffer)]);
}

async function main() {
  console.log("Writing public/favicon.svg and public/logo.svg...");
  fs.writeFileSync("public/favicon.svg", svgIcon, "utf8");
  fs.writeFileSync("public/logo.svg", svgIcon, "utf8");

  console.log("Launching headless Chrome to render raster favicons...");
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(
    `<!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: transparent; width: 512px; height: 512px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
          svg { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        ${svgIcon}
      </body>
    </html>`,
    { waitUntil: "networkidle0" },
  );

  const sizes = [
    { name: "favicon-16x16.png", size: 16 },
    { name: "favicon-32x32.png", size: 32 },
    { name: "favicon-48x48.png", size: 48 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "android-chrome-192x192.png", size: 192 },
    { name: "android-chrome-512x512.png", size: 512 },
  ];

  const icoFrames = [];

  for (const s of sizes) {
    await page.setViewport({ width: s.size, height: s.size, deviceScaleFactor: 1 });
    const buffer = await page.screenshot({
      type: "png",
      omitBackground: true,
    });
    fs.writeFileSync(`public/${s.name}`, buffer);
    console.log(`✓ Generated public/${s.name} (${s.size}x${s.size})`);

    if (s.size <= 48) {
      icoFrames.push({ width: s.size, height: s.size, buffer });
    }
  }

  await browser.close();

  console.log("Packaging multi-resolution public/favicon.ico...");
  const icoBuffer = createIco(icoFrames);
  fs.writeFileSync("public/favicon.ico", icoBuffer);
  console.log(`✓ Generated public/favicon.ico (${icoBuffer.length} bytes)`);

  console.log("Favicon generation complete!");
}

main().catch(console.error);
