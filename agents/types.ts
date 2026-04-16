import { z } from "zod";

// ─── Topic Research ──────────────────────────────────────────────

// Lenient enum that falls back to "medium" if the model returns unexpected values
const levelEnum = z.preprocess(
  (val) => {
    const s = String(val).toLowerCase().trim();
    if (["high", "hoch", "sehr hoch"].includes(s)) return "high";
    if (["low", "niedrig", "gering"].includes(s)) return "low";
    return "medium";
  },
  z.enum(["high", "medium", "low"])
);

/**
 * Article formats the pipeline can produce autonomously.
 */
const articleFormatEnum = z.preprocess(
  (val) => {
    const s = String(val).toLowerCase().trim();
    if (s.includes("review") || s.includes("test")) return "review";
    if (s.includes("vergleich") || s.includes("vs") || s.includes("comparison")) return "comparison";
    if (s.includes("kostenlos") || s.includes("free") || s.includes("gratis")) return "free-tools";
    if (s.includes("open") || s.includes("source")) return "open-source";
    if (s.includes("preis") || s.includes("pric") || s.includes("kosten") || s.includes("budget")) return "pricing-guide";
    if (s.includes("roundup") || s.includes("top") || s.includes("best")) return "roundup";
    if (s.includes("tutorial") || s.includes("how") || s.includes("anleitung")) return "tutorial";
    return "review";
  },
  z.enum([
    "review",          // Einzelnes Tool im Detail
    "comparison",      // Tool A vs Tool B
    "free-tools",      // Beste kostenlose Tools für X
    "open-source",     // Open-Source Alternativen
    "pricing-guide",   // Was bekommst du für $0/$20/$100?
    "roundup",         // Top 5/10 Tools für X
    "tutorial",        // Praxis-Anleitung mit Tool
  ])
);

export type ArticleFormat = z.infer<typeof articleFormatEnum>;

export const TopicProposalSchema = z.object({
  topic: z.string().describe("Name of the AI tool or topic"),
  slug: z.string().describe("URL-safe slug, e.g. 'claude-4-review'"),
  format: articleFormatEnum.describe("Article format/type"),
  keywords: z.array(z.string()).describe("Target SEO keywords"),
  searchVolume: levelEnum,
  competition: levelEnum,
  affiliatePotential: z
    .array(z.string())
    .describe("Affiliate programs that could be linked"),
  reasoning: z.string().describe("Why this topic is worth covering now"),
});

export const ResearchOutputSchema = z.object({
  proposals: z
    .array(TopicProposalSchema)
    .min(1)
    .max(5)
    .describe("Ranked topic proposals"),
});

export type TopicProposal = z.infer<typeof TopicProposalSchema>;
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// ─── Article Draft ───────────────────────────────────────────────

const categoryEnum = z.preprocess(
  (val) => {
    const s = String(val).toLowerCase().trim();
    const map: Record<string, string> = {
      schreiben: "writing", texterstellung: "writing", text: "writing",
      bild: "image", bildgenerierung: "image", design: "image",
      video: "video", film: "video",
      code: "coding", entwicklung: "coding", programmierung: "coding",
      produktivität: "productivity", organisation: "productivity",
      daten: "data", analyse: "data",
      marketing: "marketing", seo: "marketing",
    };
    return map[s] ?? (["writing","image","video","coding","productivity","data","marketing","other"].includes(s) ? s : "other");
  },
  z.enum(["writing", "image", "video", "coding", "productivity", "data", "marketing", "other"])
);

export const ArticleDraftSchema = z.object({
  title: z.string().describe("SEO-optimized article title"),
  slug: z.string().describe("URL-safe slug"),
  format: articleFormatEnum.describe("Article format").default("review"),
  metaDescription: z
    .string()
    .max(160)
    .describe("Meta description for search results"),
  content: z.string().describe("Full article body in Markdown"),
  // For reviews/comparisons
  pros: z.array(z.string()).default([]).describe("List of pros/advantages"),
  cons: z.array(z.string()).default([]).describe("List of cons/disadvantages"),
  rating: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return null;
      return typeof val === "string" ? parseFloat(val) : val;
    },
    z.number().min(1).max(5).nullish()
  ).describe("Overall rating 1-5 (null for roundups/tutorials)"),
  // For roundups/free-tools/open-source/pricing
  toolsList: z.array(z.object({
    name: z.string(),
    url: z.string(),
    description: z.string(),
    pricing: z.string().optional(),
    highlight: z.string().optional(),
  })).default([]).describe("List of tools (for roundups, free-tools, open-source, pricing articles)"),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([])
    .describe("FAQ section for featured snippets"),
  toolName: z.string().describe("Primary tool name or article topic"),
  toolUrl: z.string().describe("Primary URL"),
  category: categoryEnum.describe("Tool category"),
  language: z.enum(["de", "en"]).default("de"),
});

export type ArticleDraft = z.infer<typeof ArticleDraftSchema>;

// ─── Advisor Review ──────────────────────────────────────────────

export const AdvisorReviewSchema = z.object({
  role: z.enum(["bull", "bear"]),
  overallScore: z.preprocess(
    (val) => typeof val === "string" ? parseFloat(val) : val,
    z.number().min(1).max(10)
  ).describe("Quality score 1-10"),
  strengths: z.array(z.string()).describe("What works well"),
  weaknesses: z.array(z.string()).describe("What needs improvement"),
  suggestions: z
    .array(z.string())
    .describe("Specific actionable suggestions"),
  factCheckFlags: z
    .array(z.string())
    .describe("Potential factual inaccuracies"),
  seoIssues: z.array(z.string()).describe("SEO problems found"),
});

export type AdvisorReview = z.infer<typeof AdvisorReviewSchema>;

// ─── Curator Decision ────────────────────────────────────────────

export const CuratorDecisionSchema = z.object({
  decision: z.enum(["approve", "revise", "reject"]),
  reasoning: z.string().describe("Explanation for the decision"),
  revisionInstructions: z
    .string()
    .nullish()
    .describe("Specific instructions for revision (only if revise)"),
  qualityScore: z.preprocess(
    (val) => typeof val === "string" ? parseFloat(val) : val,
    z.number().min(1).max(10)
  ).describe("Final quality assessment"),
});

export type CuratorDecision = z.infer<typeof CuratorDecisionSchema>;

// ─── Pipeline Log Entry ──────────────────────────────────────────

export interface PipelineLogEntry {
  timestamp: string;
  topic: string;
  slug: string;
  researchPhase: {
    proposalsCount: number;
    selectedTopic: string;
  };
  writerPhase: {
    wordCount: number;
    language: string;
  };
  reviewPhase: {
    bullScore: number;
    bearScore: number;
    bullStrengths: number;
    bearWeaknesses: number;
    factCheckFlags: number;
  };
  curatorPhase: {
    decision: "approve" | "revise" | "reject";
    qualityScore: number;
    revisionRounds: number;
  };
  published: boolean;
  totalTokensUsed: number;
  estimatedCost: number;
}

// ─── Affiliate Program ──────────────────────────────────────────

export interface AffiliateProgram {
  toolName: string;
  affiliateUrl: string;
  commission: string;
  cookieDuration: string;
  program: string;
}

// ─── Config ──────────────────────────────────────────────────────

export interface PipelineConfig {
  anthropicApiKey: string;
  unsplashAccessKey: string;
  articlesPerRun: number;
  maxRevisionRounds: number;
  language: "de" | "en";
  dryRun: boolean;
}
