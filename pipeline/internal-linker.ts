import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blogDir = join(__dirname, "..", "src", "content", "blog");

interface ExistingArticle {
  slug: string;
  title: string;
  toolName: string;
  category: string;
}

/**
 * Scans existing blog articles and returns their metadata.
 */
function getExistingArticles(): ExistingArticle[] {
  try {
    const files = readdirSync(blogDir).filter(
      (f) => f.endsWith(".mdx") || f.endsWith(".md")
    );

    return files.map((file) => {
      const content = readFileSync(join(blogDir, file), "utf-8");
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        return null;
      }

      const fm = frontmatterMatch[1];
      const slug = file.replace(/\.(mdx?|md)$/, "");
      const title = fm.match(/title:\s*"([^"]+)"/)?.[1] ?? slug;
      const toolName = fm.match(/toolName:\s*"([^"]+)"/)?.[1] ?? "";
      const category = fm.match(/category:\s*"([^"]+)"/)?.[1] ?? "";

      return { slug, title, toolName, category };
    }).filter(Boolean) as ExistingArticle[];
  } catch {
    return [];
  }
}

/**
 * Adds internal links to other blog articles where relevant.
 * Links related tools mentioned in the article to their review pages.
 */
export function addInternalLinks(content: string, currentSlug: string): string {
  const articles = getExistingArticles().filter(
    (a) => a.slug !== currentSlug
  );

  if (articles.length === 0) return content;

  let modified = content;

  for (const article of articles) {
    if (!article.toolName) continue;

    // Only replace if the tool name appears but isn't already a link
    const regex = new RegExp(
      `(?<!\\[)\\b(${escapeRegex(article.toolName)})\\b(?!\\])(?!\\()`,
      "i"
    );

    const match = modified.match(regex);
    if (match) {
      modified = modified.replace(
        regex,
        `[$1](/blog/${article.slug} "${article.title}")`
      );
    }
  }

  return modified;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
