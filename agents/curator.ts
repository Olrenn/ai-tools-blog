import { callAgent } from "./client.js";
import {
  CuratorDecisionSchema,
  type CuratorDecision,
  type ArticleDraft,
  type AdvisorReview,
} from "./types.js";

export async function curate(input: {
  draft: ArticleDraft;
  bullReview: AdvisorReview;
  bearReview: AdvisorReview;
  revisionRound: number;
}): Promise<{ decision: CuratorDecision; tokensUsed: number }> {
  const { draft, bullReview, bearReview, revisionRound } = input;

  const userMessage = `KURATORENTSCHEIDUNG — Revisionsrunde ${revisionRound}/2

## ARTIKEL-ENTWURF
Titel: ${draft.title}
Tool: ${draft.toolName}
Bewertung: ${draft.rating}/5
Wörter: ~${draft.content.split(/\s+/).length}
Pros: ${draft.pros.join("; ")}
Cons: ${draft.cons.join("; ")}

## BULL ADVISOR (Score: ${bullReview.overallScore}/10)
Stärken: ${bullReview.strengths.join("; ")}
Schwächen: ${bullReview.weaknesses.length > 0 ? bullReview.weaknesses.join("; ") : "Keine"}
Vorschläge: ${bullReview.suggestions.join("; ")}
Fakten-Flags: ${bullReview.factCheckFlags.length > 0 ? bullReview.factCheckFlags.join("; ") : "Keine"}
SEO-Issues: ${bullReview.seoIssues.length > 0 ? bullReview.seoIssues.join("; ") : "Keine"}

## BEAR ADVISOR (Score: ${bearReview.overallScore}/10)
Stärken: ${bearReview.strengths.join("; ")}
Schwächen: ${bearReview.weaknesses.length > 0 ? bearReview.weaknesses.join("; ") : "Keine"}
Vorschläge: ${bearReview.suggestions.join("; ")}
Fakten-Flags: ${bearReview.factCheckFlags.length > 0 ? bearReview.factCheckFlags.join("; ") : "Keine"}
SEO-Issues: ${bearReview.seoIssues.length > 0 ? bearReview.seoIssues.join("; ") : "Keine"}

${revisionRound >= 2 ? "\n⚠️ LETZTE REVISIONSRUNDE — Entscheide jetzt APPROVE oder REJECT. Kein weiteres REVISE möglich." : ""}

Triff deine Entscheidung: APPROVE, REVISE oder REJECT.
Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;

  const { result, tokensUsed } = await callAgent({
    model: "sonnet",
    systemPrompt: "curator",
    userMessage,
    schema: CuratorDecisionSchema,
    temperature: 0.4,
  });

  return { decision: result, tokensUsed };
}
