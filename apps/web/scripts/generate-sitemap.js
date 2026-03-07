import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL =
  process.env.VITE_SITE_URL || "https://turborepo-boilerplate.com";

const ROUTES_DIR = path.resolve(__dirname, "../src/routes");
const POSTS_DIR = path.resolve(__dirname, "../content/posts");
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const TSX_EXT_REGEX = /\.tsx$/;
const INDEX_REGEX = /\/index$/;
const MD_EXT_REGEX = /\.md$/;

// Helper to get all files recursively
function getFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

// 1. Get Static Routes
console.log("Scanning routes...");
const routeFiles = getFiles(ROUTES_DIR);
const staticRoutes = routeFiles
  .filter(
    (file) =>
      file.endsWith(".tsx") &&
      !file.includes("__root") &&
      !path.basename(file).startsWith("_")
  )
  .map((file) => {
    let relative = path.relative(ROUTES_DIR, file);

    // Ignore _auth group
    if (relative.startsWith("_auth") || relative.includes("/_auth"))
      return null;

    // Remove extension
    relative = relative.replace(TSX_EXT_REGEX, "");

    // Remove (public) group
    relative = relative.replace(/\(public\)\/?/g, "");

    // Handle index
    if (relative.endsWith("/index"))
      relative = relative.replace(INDEX_REGEX, "");
    if (relative === "index") relative = "";

    // Ignore dynamic routes (containing $)
    if (relative.includes("$")) return null;

    return `/${relative}`;
  })
  .filter((route) => route !== null);

// 2. Get Blog Posts
console.log("Scanning blog posts...");
let blogRoutes = [];
if (fs.existsSync(POSTS_DIR)) {
  const postFiles = fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".md"));
  blogRoutes = postFiles.map((file) => {
    const slug = file.replace(MD_EXT_REGEX, "");
    return `/blog/${slug}`;
  });
}

const allRoutes = [...new Set([...staticRoutes, ...blogRoutes])].sort();

// 3. Generate Sitemap with improved priority and changefreq logic
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
  .map((route) => {
    // Set priority and changefreq based on route type
    let priority = "0.8";
    let changefreq = "weekly";

    if (route === "" || route === "/") {
      priority = "1.0";
      changefreq = "daily";
    } else if (route.startsWith("/blog")) {
      priority = route === "/blog" ? "0.9" : "0.7";
      changefreq = route === "/blog" ? "weekly" : "monthly";
    } else if (route.startsWith("/login") || route.startsWith("/success")) {
      priority = "0.5";
      changefreq = "monthly";
    }

    return `  <url>
    <loc>${APP_URL}${route}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  })
  .join("\n")}
</urlset>`;

// 4. Generate Robots.txt with dynamic sitemap URL
const robots = `User-agent: *
Allow: /

# Disallow auth and admin routes
Disallow: /dashboard
Disallow: /billing
Disallow: /ai
Disallow: /settings
Disallow: /admin

Sitemap: ${APP_URL}/sitemap.xml
`;

// Write files
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(PUBLIC_DIR, "robots.txt"), robots);

console.log("✅ Generated sitemap.xml and robots.txt");
console.log(`   Base URL: ${APP_URL}`);
console.log(`   Routes found: ${allRoutes.length}`);
for (const r of allRoutes) {
  console.log(`   - ${r}`);
}
