import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import type { ArticleDraft, PipelineLogEntry } from "../agents/types.js";
import { generateSEOFrontmatter, buildMDXFile } from "./seo-optimizer.js";
import { injectAffiliateLinks, injectCrossLinks } from "./affiliate-linker.js";
import { addInternalLinks } from "./internal-linker.js";
import { fetchHeroImage } from "./image-fetcher.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const blogDir = join(rootDir, "src", "content", "blog");
const dataDir = join(rootDir, "data");

/**
 * Full publish pipeline: SEO, affiliates, images, write file, git push.
 */
export async function publishArticle(
  draft: ArticleDraft,
  log: PipelineLogEntry,
  dryRun: boolean
): Promise<void> {
  console.log("\n📦 Publishing Pipeline...");

  // Step 1: Fetch hero image
  console.log("  🖼️  Fetching hero image...");
  const heroImagePath = await fetchHeroImage(draft.toolName, draft.slug);

  // Step 2: Generate SEO frontmatter
  console.log("  🔍 Generating SEO frontmatter...");
  const frontmatter = generateSEOFrontmatter(draft, heroImagePath);

  // Step 3: Inject affiliate links
  console.log("  🔗 Injecting affiliate links...");
  let content = injectAffiliateLinks(draft);
  content = injectCrossLinks(content);

  // Step 4: Add internal links
  console.log("  🔗 Adding internal links...");
  content = addInternalLinks(content, draft.slug);

  // Step 5: Update draft with modified content
  const modifiedDraft = { ...draft, content };

  // Step 6: Build final MDX file
  console.log("  📝 Building MDX file...");
  const mdxContent = buildMDXFile(modifiedDraft, frontmatter);

  const mdxPath = join(blogDir, `${draft.slug}.mdx`);

  if (dryRun) {
    console.log(`\n  🏜️  DRY RUN — Would write to: ${mdxPath}`);
    console.log(`  📊 Word count: ${draft.content.split(/\s+/).length}`);
    console.log(`  📊 File size: ~${Math.round(mdxContent.length / 1024)}KB`);
    console.log("\n  📄 First 500 chars of MDX:");
    console.log("  " + mdxContent.substring(0, 500).replace(/\n/g, "\n  "));
    return;
  }

  // Step 7: Write MDX file
  writeFileSync(mdxPath, mdxContent, "utf-8");
  console.log(`  ✅ Written: ${mdxPath}`);

  // Step 8: Update published topics
  updatePublishedTopics(draft.toolName);

  // Step 9: Append to pipeline log
  appendPipelineLog(log);

  // Step 10: Git commit and push
  console.log("  📤 Git commit and push...");
  try {
    execSync(
      `cd "${rootDir}" && git add -A && git commit -m "auto: publish ${draft.slug}" && git push`,
      { stdio: "pipe" }
    );
    console.log("  ✅ Pushed to remote — Vercel will auto-deploy");
  } catch (err) {
    console.log(
      "  ⚠️  Git push failed (maybe no remote configured). Article saved locally."
    );
  }
}

function updatePublishedTopics(topic: string): void {
  const filePath = join(dataDir, "published-topics.json");
  let data: { topics: string[] } = { topics: [] };

  if (existsSync(filePath)) {
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  }

  if (!data.topics.includes(topic)) {
    data.topics.push(topic);
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

function appendPipelineLog(entry: PipelineLogEntry): void {
  const filePath = join(dataDir, "pipeline-log.json");
  let data: { runs: PipelineLogEntry[] } = { runs: [] };

  if (existsSync(filePath)) {
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  }

  data.runs.push(entry);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
