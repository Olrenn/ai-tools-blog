import { callAgent } from "./client.js";
import {
  ArticleDraftSchema,
  type ArticleDraft,
  type TopicProposal,
} from "./types.js";

export async function writeArticle(
  topic: TopicProposal,
  revisionInstructions?: string
): Promise<{ draft: ArticleDraft; tokensUsed: number }> {
  let userMessage: string;

  if (revisionInstructions) {
    userMessage = `ÜBERARBEITUNG ERFORDERLICH

Ursprüngliches Thema: ${topic.topic}
Keywords: ${topic.keywords.join(", ")}

REVISIONS-ANWEISUNGEN VOM KURATOR:
${revisionInstructions}

Schreibe den Artikel NEU unter Berücksichtigung aller Anweisungen.
Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;
  } else {
    userMessage = `Schreibe einen ausführlichen Review-Artikel über folgendes AI-Tool:

THEMA: ${topic.topic}
SLUG: ${topic.slug}
SEO-KEYWORDS: ${topic.keywords.join(", ")}
AFFILIATE-POTENZIAL: ${topic.affiliatePotential.join(", ")}
KONTEXT: ${topic.reasoning}

Schreibe einen informativen, ehrlichen Review auf Deutsch (1500-2500 Wörter).
Folge der vorgegebenen Artikelstruktur aus deinem System-Prompt.
Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;
  }

  const { result, tokensUsed } = await callAgent({
    model: "sonnet",
    systemPrompt: "writer",
    userMessage,
    schema: ArticleDraftSchema,
    maxTokens: 8192,
    temperature: 0.7,
  });

  return { draft: result, tokensUsed };
}
