import { callAgent } from "./client.js";
import { AdvisorReviewSchema, type AdvisorReview, type ArticleDraft } from "./types.js";

export async function reviewAsBear(
  draft: ArticleDraft
): Promise<{ review: AdvisorReview; tokensUsed: number }> {
  const userMessage = `Bewerte folgenden Artikel als BEAR ADVISOR (kritische Perspektive):

TITEL: ${draft.title}
META-DESCRIPTION: ${draft.metaDescription}
TOOL: ${draft.toolName} (${draft.toolUrl})
RATING: ${draft.rating}/5
KATEGORIE: ${draft.category}

PROS: ${draft.pros.join(", ")}
CONS: ${draft.cons.join(", ")}

ARTIKEL-TEXT:
${draft.content}

FAQ:
${draft.faq.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")}

Prüfe diesen Artikel GNADENLOS:
- Fakten korrekt?
- SEO-Fehler?
- Lesbarkeit?
- Vollständigkeit?
- Rechtliche Probleme?

Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;

  const { result, tokensUsed } = await callAgent({
    model: "haiku",
    systemPrompt: "bear-advisor",
    userMessage,
    schema: AdvisorReviewSchema,
    temperature: 0.5,
  });

  return { review: result, tokensUsed };
}
