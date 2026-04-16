import { researchTopics } from "./researcher.js";
import { writeArticle } from "./writer.js";
import { reviewAsBull } from "./bull-advisor.js";
import { reviewAsBear } from "./bear-advisor.js";
import { curate } from "./curator.js";
import type {
  TopicProposal,
  ArticleDraft,
  AdvisorReview,
  CuratorDecision,
  PipelineLogEntry,
} from "./types.js";

export interface OrchestratorResult {
  draft: ArticleDraft | null;
  decision: CuratorDecision;
  log: PipelineLogEntry;
}

/**
 * Main orchestration loop:
 *
 * 1. Research → get 3-5 topic proposals
 * 2. For each topic (until one is APPROVED):
 *    a. Write draft
 *    b. Bull + Bear review (parallel)
 *    c. Curator decides: APPROVE / REVISE / REJECT
 *    d. If REVISE → Writer revises → back to (b), max 2 rounds
 *    e. If REJECT → try next topic
 *    f. If APPROVE → publish
 * 3. If ALL topics exhausted → return last rejection
 */
export async function orchestrate(options: {
  maxRevisionRounds: number;
  specificTopic?: TopicProposal;
}): Promise<OrchestratorResult> {
  let totalTokens = 0;

  // ─── Phase 1: Research (Live Web Data + AI Analysis) ──────
  console.log("\n📡 Phase 1: Topic Research (mit Live-Web-Daten)...");

  let topicQueue: TopicProposal[];

  if (options.specificTopic) {
    topicQueue = [options.specificTopic];
    console.log(`  → Using provided topic: ${options.specificTopic.topic}`);
  } else {
    const { output: research, tokensUsed: researchTokens } =
      await researchTopics();
    totalTokens += researchTokens;
    topicQueue = research.proposals;
    console.log(`  → Found ${topicQueue.length} topics:`);
    topicQueue.forEach((t, i) =>
      console.log(`    ${i + 1}. ${t.topic} (${t.searchVolume} volume, ${t.competition} competition)`)
    );
  }

  // ─── Topic Loop: try each topic until one is APPROVED ─────
  let lastDraft: ArticleDraft | null = null;
  let lastDecision: CuratorDecision | null = null;
  let lastBullReview: AdvisorReview | null = null;
  let lastBearReview: AdvisorReview | null = null;
  let lastTopic: TopicProposal = topicQueue[0];
  let lastRevisionRounds = 0;

  for (let topicIdx = 0; topicIdx < topicQueue.length; topicIdx++) {
    const currentTopic = topicQueue[topicIdx];
    lastTopic = currentTopic;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  📌 Topic ${topicIdx + 1}/${topicQueue.length}: "${currentTopic.topic}"`);
    console.log(`${"═".repeat(60)}`);

    // ─── Phase 2: Write Draft ───────────────────────────────
    console.log("\n✍️  Phase 2: Writing Article...");

    let { draft, tokensUsed: writeTokens } = await writeArticle(currentTopic);
    totalTokens += writeTokens;
    lastDraft = draft;

    const wordCount = draft.content.split(/\s+/).length;
    console.log(`  → Draft: "${draft.title}" (${wordCount} words)`);

    // ─── Phase 3+4: Review Loop (revision rounds) ──────────
    let revisionRound = 0;
    let approved = false;
    let rejected = false;

    while (true) {
      revisionRound++;
      lastRevisionRounds = revisionRound;

      // Phase 3: Dual Advisor Review (parallel)
      console.log(`\n🔍 Phase 3: Advisor Review (Round ${revisionRound})...`);

      const [bullResult, bearResult] = await Promise.all([
        reviewAsBull(draft),
        reviewAsBear(draft),
      ]);

      lastBullReview = bullResult.review;
      lastBearReview = bearResult.review;
      totalTokens += bullResult.tokensUsed + bearResult.tokensUsed;

      console.log(
        `  → Bull Score: ${lastBullReview.overallScore}/10 | Strengths: ${lastBullReview.strengths.length}`
      );
      console.log(
        `  → Bear Score: ${lastBearReview.overallScore}/10 | Weaknesses: ${lastBearReview.weaknesses.length} | Fact-Flags: ${lastBearReview.factCheckFlags.length}`
      );

      // Phase 4: Curator Decision
      console.log("\n⚖️  Phase 4: Curator Decision...");

      const { decision, tokensUsed: curatorTokens } = await curate({
        draft,
        bullReview: lastBullReview,
        bearReview: lastBearReview,
        revisionRound,
      });

      totalTokens += curatorTokens;
      lastDecision = decision;

      console.log(
        `  → Decision: ${decision.decision.toUpperCase()} (Score: ${decision.qualityScore}/10)`
      );
      console.log(`  → Reasoning: ${decision.reasoning}`);

      if (decision.decision === "approve") {
        console.log("\n✅ Article APPROVED for publication!");
        approved = true;
        break;
      }

      if (decision.decision === "reject") {
        console.log("\n❌ Article REJECTED.");
        console.log(`  → Reason: ${decision.reasoning}`);
        rejected = true;
        break;
      }

      // decision === "revise"
      if (revisionRound >= options.maxRevisionRounds) {
        console.log(
          `\n⚠️  Max revision rounds (${options.maxRevisionRounds}) reached. Forcing final decision.`
        );
        // Treat as approved if score >= 6, otherwise rejected
        if (decision.qualityScore >= 6) {
          console.log("  → Score >= 6, auto-approving after max revisions.");
          lastDecision = { ...decision, decision: "approve" };
          approved = true;
        } else {
          console.log("  → Score < 6, auto-rejecting after max revisions.");
          lastDecision = { ...decision, decision: "reject" };
          rejected = true;
        }
        break;
      }

      console.log("\n🔄 Revision...");
      console.log(`  → Instructions: ${decision.revisionInstructions}`);

      const { draft: revisedDraft, tokensUsed: revisionTokens } =
        await writeArticle(currentTopic, decision.revisionInstructions);
      totalTokens += revisionTokens;
      draft = revisedDraft;
      lastDraft = draft;

      const revisedWordCount = draft.content.split(/\s+/).length;
      console.log(`  → Revised draft: ${revisedWordCount} words`);
    }

    // If approved → we're done, break out of topic loop
    if (approved) {
      break;
    }

    // If rejected → try next topic
    if (rejected && topicIdx < topicQueue.length - 1) {
      console.log(
        `\n🔄 Topic "${currentTopic.topic}" rejected — trying next topic...`
      );
      continue;
    }

    // Last topic also rejected → give up
    if (rejected) {
      console.log(
        `\n⚠️  All ${topicQueue.length} topics exhausted. No article published.`
      );
    }
  }

  // ─── Build Log Entry ──────────────────────────────────────

  const estimatedCost = estimateTokenCost(totalTokens);

  const logEntry: PipelineLogEntry = {
    timestamp: new Date().toISOString(),
    topic: lastTopic.topic,
    slug: lastDraft?.slug ?? "unknown",
    researchPhase: {
      proposalsCount: topicQueue.length,
      selectedTopic: lastTopic.topic,
    },
    writerPhase: {
      wordCount: lastDraft?.content.split(/\s+/).length ?? 0,
      language: lastDraft?.language ?? "de",
    },
    reviewPhase: {
      bullScore: lastBullReview?.overallScore ?? 0,
      bearScore: lastBearReview?.overallScore ?? 0,
      bullStrengths: lastBullReview?.strengths.length ?? 0,
      bearWeaknesses: lastBearReview?.weaknesses.length ?? 0,
      factCheckFlags: lastBearReview?.factCheckFlags.length ?? 0,
    },
    curatorPhase: {
      decision: lastDecision?.decision ?? "reject",
      qualityScore: lastDecision?.qualityScore ?? 0,
      revisionRounds: lastRevisionRounds,
    },
    published: lastDecision?.decision === "approve",
    totalTokensUsed: totalTokens,
    estimatedCost,
  };

  return {
    draft: lastDecision?.decision === "approve" ? lastDraft : null,
    decision: lastDecision!,
    log: logEntry,
  };
}

function estimateTokenCost(tokens: number): number {
  const haikuTokens = tokens * 0.6;
  const sonnetTokens = tokens * 0.4;
  return (haikuTokens * 0.25 + sonnetTokens * 3) / 1_000_000;
}
