type HeadConfig = {
  meta?: Array<Record<string, string>>;
  links?: Array<Record<string, string>>;
  scripts?: Array<{ type: string; children: string }>;
};

const SITE_NAME = "Turborepo Boilerplate";
const SITE_DESCRIPTION =
  "Production-ready Turborepo starter with AI integrations, auth, payments, and modern DX.";
const SITE_AUTHOR = "Prasanjit Dutta";
const DEFAULT_TITLE = `${SITE_NAME} | Start your project with ease`;
// Use AVIF format for optimal loading (with WebP/JPEG fallback in meta tags)
const DEFAULT_IMAGE = "/og-image.avif";
const DEFAULT_KEYWORDS = [
  "turborepo boilerplate",
  "typescript starter",
  "react turborepo",
  "ai ready boilerplate",
  "shadcn ui",
  "tanstack router",
];

const FALLBACK_SITE_URL = "https://turborepo-boilerplate.com";

interface SeoOptions {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  type?: "website" | "article" | "product" | "profile" | string;
  keywords?: string[];
  noIndex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}

// Define the regex at the top-level scope for performance
const TRAILING_SLASH_REGEX = /\/$/;

export const getSiteUrl = () =>
  import.meta.env.VITE_SITE_URL?.replace(TRAILING_SLASH_REGEX, "") ??
  FALLBACK_SITE_URL;

export const buildCanonicalUrl = (path = "/") =>
  new URL(path, `${getSiteUrl()}/`).toString().replace(/(?<!:)\/\//g, "/");

export const buildSeoHead = (options: SeoOptions = {}): HeadConfig => {
  const {
    title = DEFAULT_TITLE,
    description = SITE_DESCRIPTION,
    image: rawImage = DEFAULT_IMAGE,
    path = "/",
    type = "website",
    keywords = DEFAULT_KEYWORDS,
    noIndex = false,
    structuredData,
  } = options;

  const canonicalUrl = buildCanonicalUrl(path);
  const image = rawImage.startsWith("http")
    ? rawImage
    : buildCanonicalUrl(rawImage);
  const robots = noIndex ? "noindex, nofollow" : "index, follow";

  const meta: NonNullable<HeadConfig["meta"]> = [
    { title },
    { name: "description", content: description },
    { name: "author", content: SITE_AUTHOR },
    { name: "robots", content: robots },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:url", content: canonicalUrl },
    { property: "og:site_name", content: SITE_NAME },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:creator", content: "@jit_infinity" },
  ];

  if (keywords.length > 0) {
    meta.push({ name: "keywords", content: keywords.join(", ") });
  }

  const links: NonNullable<HeadConfig["links"]> = [
    { rel: "canonical", href: canonicalUrl },
    { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    {
      rel: "icon",
      type: "image/png",
      sizes: "16x16",
      href: "/favicon-16x16.png",
    },
    {
      rel: "icon",
      type: "image/png",
      sizes: "32x32",
      href: "/favicon-32x32.png",
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      href: "/apple-touch-icon.png",
    },
    { rel: "manifest", href: "/site.webmanifest" },
  ];

  const scripts: NonNullable<HeadConfig["scripts"]> = [];

  if (structuredData) {
    const entries = Array.isArray(structuredData)
      ? structuredData
      : [structuredData];

    for (const schema of entries) {
      const jsonLd = JSON.stringify(schema)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e");
      scripts.push({
        type: "application/ld+json",
        children: jsonLd,
      });
    }
  }

  return { meta, links, scripts };
};

export const seoConstants = {
  SITE_NAME,
  SITE_DESCRIPTION,
  DEFAULT_IMAGE,
};
