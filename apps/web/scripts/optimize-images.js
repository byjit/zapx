import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

// Target sizes for optimization
const OG_IMAGE_MAX_SIZE = 1200;
const OG_IMAGE_QUALITY = 80;
const THUMBNAIL_SIZE = 600;

async function optimizeImage(inputPath, outputPath, options = {}) {
  const {
    maxWidth = OG_IMAGE_MAX_SIZE,
    quality = OG_IMAGE_QUALITY,
    formats = ["webp", "avif"],
  } = options;

  try {
    const metadata = await sharp(inputPath).metadata();
    console.log(
      `  Original: ${metadata.width}x${metadata.height}, ${metadata.size} bytes`
    );

    // Calculate new dimensions while maintaining aspect ratio
    const width = Math.min(metadata.width, maxWidth);
    const height =
      metadata.height > metadata.width
        ? Math.round((metadata.height / metadata.width) * width)
        : undefined;

    // Generate optimized formats
    for (const format of formats) {
      const outputFilePath = outputPath.replace(
        /\.(png|jpg|jpeg)$/i,
        `.${format}`
      );

      await sharp(inputPath)
        .resize({ width, height })
        .toFormat(format, { quality })
        .toFile(outputFilePath);

      const outputStats = fs.statSync(outputFilePath);
      const savings = ((1 - outputStats.size / metadata.size) * 100).toFixed(1);
      console.log(
        `  ✅ ${format.toUpperCase()}: ${outputFilePath.split("/").pop()} (${outputStats.size} bytes, ${savings}% smaller)`
      );
    }

    // Keep original as fallback
    const fallbackPath = outputPath;
    await sharp(inputPath)
      .resize({ width, height })
      .toFormat("jpeg", { quality: 85 })
      .toFile(fallbackPath);

    const fallbackStats = fs.statSync(fallbackPath);
    console.log(
      `  ✅ JPEG fallback: ${fallbackPath.split("/").pop()} (${fallbackStats.size} bytes)`
    );
  } catch (error) {
    console.error(`  ❌ Error optimizing ${inputPath}:`, error.message);
  }
}

async function main() {
  console.log("🔍 Scanning for images to optimize...\n");

  // Optimize og-image.png
  const ogImagePath = path.join(PUBLIC_DIR, "og-image.png");
  if (fs.existsSync(ogImagePath)) {
    console.log("📸 Optimizing og-image.png...");
    await optimizeImage(ogImagePath, path.join(PUBLIC_DIR, "og-image.jpg"), {
      maxWidth: OG_IMAGE_MAX_SIZE,
      quality: OG_IMAGE_QUALITY,
      formats: ["webp", "avif"],
    });
    console.log();
  }

  // Optimize logo.png
  const logoPath = path.join(PUBLIC_DIR, "logo.png");
  if (fs.existsSync(logoPath)) {
    console.log("🎨 Optimizing logo.png...");
    await optimizeImage(logoPath, path.join(PUBLIC_DIR, "logo.jpg"), {
      maxWidth: 512,
      quality: 85,
      formats: ["webp"],
    });
    console.log();
  }

  console.log("✅ Image optimization complete!");
  console.log(
    "\n📝 Update your SEO references to use .webp or .avif formats where supported."
  );
}

main().catch(console.error);
