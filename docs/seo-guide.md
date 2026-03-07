# SEO Implementation Guide

This project uses a centralized SEO configuration helper located in `apps/web/src/lib/seo.ts` to manage metadata, OpenGraph tags, and structured data (JSON-LD) for React pages.

## How it Works

The `buildSeoHead` function generates the `meta`, `links`, and `scripts` tags required by TanStack Router's `head` property.

### Key Components

1.  **`buildSeoHead(options)`**: The main function to generate SEO tags.
    *   **options**:
        *   `title`: Page title.
        *   `description`: Meta description.
        *   `image`: OpenGraph/Twitter image URL (automatically resolves relative paths to absolute URLs).
        *   `path`: Current route path (used for canonical URL).
        *   `type`: OpenGraph type (e.g., "website", "article").
        *   `keywords`: Array of keywords.
        *   `structuredData`: JSON-LD object(s) for rich snippets.
        *   `noIndex`: If true, sets robots to "noindex, nofollow".

2.  **`seoConstants`**: specific constants.

3.  **Favicons & Icons**:
    *   The `buildSeoHead` automatically includes links for standard favicons (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`), Apple Touch Icon, and the Web Manifest.
    *   Ensure these files exist in `apps/web/public/`.

## Usage Example

In a route file (e.g., `routes/index.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () =>
    buildSeoHead({
      title: "About Us | My SaaS",
      description: "Learn more about our mission.",
      path: "/about",
      image: "/og-image-about.png", // specific OG image
      structuredData: {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "My SaaS",
      },
    }),
});
```

## Tips for Future Implementation

1.  Update details in  `apps/web/src/lib/seo.ts`, ask the user to update public assets if not done already.
2.  **Dynamic Metadata**: For dynamic routes (e.g., blog posts), fetch the data in the `loader` and access it in the `head` function to generate dynamic titles and descriptions.
    ```tsx
    head: ({ loaderData }) => buildSeoHead({
      title: loaderData.post.title,
      description: loaderData.post.summary,
      // ...
    })
    ```
3.  **Structured Data**: Use structured data liberally for "rich results" (Product, Article, FAQPage, etc.). Validate it using Google's Rich Results Test.
4.  **Images**: Keep `og-image.png` (1200x630px) in the `public` folder as a default fallback. Create specific OG images for key pages for better social sharing engagement.
5.  **Testing**: Use tools like `metatags.io` or the Twitter Card Validator to preview how your pages look when shared.

