import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicImagesDir = join(__dirname, "..", "public", "images");

/**
 * Fetch a relevant hero image from Unsplash for the article.
 * Falls back to a placeholder if API is unavailable.
 */
export async function fetchHeroImage(
  query: string,
  slug: string
): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;

  // Ensure images directory exists
  if (!existsSync(publicImagesDir)) {
    mkdirSync(publicImagesDir, { recursive: true });
  }

  const imagePath = `/images/${slug}-hero.jpg`;
  const localPath = join(publicImagesDir, `${slug}-hero.jpg`);

  // Skip if image already exists
  if (existsSync(localPath)) {
    console.log(`  → Image already exists: ${imagePath}`);
    return imagePath;
  }

  if (!accessKey) {
    console.log("  → No UNSPLASH_ACCESS_KEY, using placeholder");
    return generatePlaceholder(slug);
  }

  try {
    // Search Unsplash for a relevant image
    const searchUrl = new URL("https://api.unsplash.com/search/photos");
    searchUrl.searchParams.set("query", `${query} technology software`);
    searchUrl.searchParams.set("per_page", "1");
    searchUrl.searchParams.set("orientation", "landscape");

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!searchRes.ok) {
      console.log(`  → Unsplash API error: ${searchRes.status}`);
      return generatePlaceholder(slug);
    }

    const searchData = await searchRes.json();
    const results = searchData.results ?? [];

    if (results.length === 0) {
      console.log("  → No images found, using placeholder");
      return generatePlaceholder(slug);
    }

    const photo = results[0];
    const imageUrl = photo.urls?.regular;

    if (!imageUrl) {
      return generatePlaceholder(slug);
    }

    // Download the image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return generatePlaceholder(slug);
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    writeFileSync(localPath, buffer);

    // Trigger Unsplash download tracking (required by API guidelines)
    if (photo.links?.download_location) {
      fetch(photo.links.download_location, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      }).catch(() => {});
    }

    console.log(
      `  → Downloaded image from Unsplash: ${photo.user?.name ?? "unknown"}`
    );
    return imagePath;
  } catch (err) {
    console.log(`  → Image fetch error: ${err}`);
    return generatePlaceholder(slug);
  }
}

/**
 * Generate a simple SVG placeholder image.
 */
function generatePlaceholder(slug: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1e293b"/>
  <text x="600" y="300" font-family="system-ui" font-size="48" fill="#6366f1" text-anchor="middle">KI-Tools Vergleich</text>
  <text x="600" y="370" font-family="system-ui" font-size="24" fill="#94a3b8" text-anchor="middle">${slug.replace(/-/g, " ")}</text>
</svg>`;

  const localPath = join(publicImagesDir, `${slug}-hero.svg`);
  writeFileSync(localPath, svg);
  return `/images/${slug}-hero.svg`;
}
