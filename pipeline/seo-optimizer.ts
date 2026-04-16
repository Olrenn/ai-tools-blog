import type { ArticleDraft } from "../agents/types.js";

interface SEOFrontmatter {
  title: string;
  description: string;
  pubDate: string;
  updatedDate: string;
  heroImage: string;
  heroAlt: string;
  format: string;
  category: string;
  tags: string[];
  toolName: string;
  toolUrl: string;
  rating: number | null;
  draft: boolean;
  schema: object;
}

/**
 * Generates SEO-optimized frontmatter and Schema.org JSON-LD for an article.
 */
export function generateSEOFrontmatter(draft: ArticleDraft, heroImagePath: string): SEOFrontmatter {
  const now = new Date().toISOString();

  // Schema.org Review + Article markup
  const schema = {
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: draft.toolName,
      url: draft.toolUrl,
      applicationCategory: mapCategory(draft.category),
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: draft.rating,
      bestRating: 5,
      worstRating: 1,
    },
    author: {
      "@type": "Organization",
      name: "KI-Tools Vergleich",
      url: "https://ki-tools-vergleich.de",
    },
    datePublished: now,
    description: draft.metaDescription,
  };

  // FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: draft.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const format = draft.format ?? "review";

  // Build tags based on format
  const tags = [draft.toolName.toLowerCase(), draft.category, "ai-tools"];
  if (format === "free-tools") tags.push("kostenlos", "gratis");
  if (format === "open-source") tags.push("open-source", "self-hosted");
  if (format === "pricing-guide") tags.push("preise", "kosten");
  if (format === "comparison") tags.push("vergleich");
  if (format === "roundup") tags.push("top-liste");
  if (format === "tutorial") tags.push("anleitung", "tutorial");

  return {
    title: draft.title,
    description: draft.metaDescription,
    pubDate: now,
    updatedDate: now,
    heroImage: heroImagePath,
    heroAlt: `${draft.toolName} - ${draft.title}`,
    format,
    category: draft.category,
    tags: [...new Set(tags)],
    toolName: draft.toolName,
    toolUrl: draft.toolUrl,
    rating: draft.rating ?? null,
    draft: false,
    schema: { review: schema, faq: faqSchema },
  };
}

/**
 * Builds the complete MDX file content with frontmatter + article body.
 */
export function buildMDXFile(draft: ArticleDraft, frontmatter: SEOFrontmatter): string {
  const fm = [
    "---",
    `title: "${escapeYaml(frontmatter.title)}"`,
    `description: "${escapeYaml(frontmatter.description)}"`,
    `pubDate: "${frontmatter.pubDate}"`,
    `updatedDate: "${frontmatter.updatedDate}"`,
    `heroImage: "${frontmatter.heroImage}"`,
    `heroAlt: "${escapeYaml(frontmatter.heroAlt)}"`,
    `format: "${frontmatter.format}"`,
    `category: "${frontmatter.category}"`,
    `tags: [${frontmatter.tags.map((t) => `"${t}"`).join(", ")}]`,
    `toolName: "${escapeYaml(frontmatter.toolName)}"`,
    `toolUrl: "${frontmatter.toolUrl}"`,
    frontmatter.rating !== null ? `rating: ${frontmatter.rating}` : "",
    `draft: ${frontmatter.draft}`,
    "---",
    "",
  ].join("\n");

  const imports = [
    'import AffiliateBox from "../../components/AffiliateBox.astro";',
    'import ProsConsList from "../../components/ProsConsList.astro";',
    'import ToolRating from "../../components/ToolRating.astro";',
    "",
  ].join("\n");

  // Build pros/cons component
  const prosConsBlock = `<ProsConsList pros={${JSON.stringify(draft.pros)}} cons={${JSON.stringify(draft.cons)}} />`;

  // Build rating component
  const ratingBlock = `<ToolRating name="${escapeYaml(draft.toolName)}" rating={${draft.rating}} />`;

  // Build FAQ section
  const faqSection = draft.faq.length > 0
    ? [
        "",
        "## Häufig gestellte Fragen",
        "",
        ...draft.faq.map(
          (f) => `### ${f.question}\n\n${f.answer}`
        ),
      ].join("\n\n")
    : "";

  return `${fm}${imports}\n${draft.content}\n\n${prosConsBlock}\n\n${ratingBlock}\n${faqSection}\n`;
}

function mapCategory(cat: string): string {
  const map: Record<string, string> = {
    writing: "BusinessApplication",
    image: "MultimediaApplication",
    video: "MultimediaApplication",
    coding: "DeveloperApplication",
    productivity: "BusinessApplication",
    data: "BusinessApplication",
    marketing: "BusinessApplication",
    other: "WebApplication",
  };
  return map[cat] ?? "WebApplication";
}

function escapeYaml(str: string): string {
  return str.replace(/"/g, '\\"');
}
