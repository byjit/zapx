import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_ICON = "sparkles";
const iconName = (process.argv[2] ?? DEFAULT_ICON).trim().toLowerCase();
const iconUrl = `https://unpkg.com/lucide-static@latest/icons/${iconName}.svg`;
const outputDir = "public";

async function main() {
  const iconResponse = await fetch(iconUrl);

  if (!iconResponse.ok) {
    throw new Error(
      `Unable to fetch Lucide icon "${iconName}" from ${iconUrl}.`
    );
  }

  const tempDir = await mkdtemp(join(tmpdir(), "lucide-favicon-"));
  const sourceSvgPath = join(tempDir, `${iconName}.svg`);

  try {
    const sourceSvg = await iconResponse.text();
    await writeFile(sourceSvgPath, sourceSvg, "utf8");

    execFileSync(
      "pnpm",
      [
        "dlx",
        "favicons",
        sourceSvgPath,
        "--output",
        outputDir,
        "--path",
        "/",
        "--appName",
        "Turborepo Boilerplate",
      ],
      { stdio: "inherit" }
    );

    const generatedSvgPath = join(outputDir, "favicon.svg");
    const iconSvg = await readFile(generatedSvgPath, "utf8");

    // Keep the favicon's SVG in sync with the selected Lucide icon source.
    await writeFile(generatedSvgPath, sourceSvg, "utf8");

    if (iconSvg === sourceSvg) {
      console.log(
        `Favicon assets generated in ${outputDir} using "${iconName}".`
      );
      return;
    }

    console.log(
      `Favicon assets generated in ${outputDir} using "${iconName}" (including Lucide favicon.svg).`
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
