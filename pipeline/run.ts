#!/usr/bin/env tsx
/**
 * AI-Tools Blog — Automated Content Pipeline
 *
 * Usage:
 *   npx tsx pipeline/run.ts              # Full run (research + write + publish)
 *   npx tsx pipeline/run.ts --dry-run    # Everything except git push
 *   npx tsx pipeline/run.ts --count 3    # Generate 3 articles
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY     - Anthropic API key for Claude
 *   UNSPLASH_ACCESS_KEY   - Unsplash API key for images (optional)
 */

import { orchestrate, type OrchestratorResult } from "../agents/orchestrator.js";
import { publishArticle } from "./publisher.js";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const countIdx = args.indexOf("--count");
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) || 1 : 1;

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   KI-Tools Vergleich — Content Pipeline          ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Mode: ${dryRun ? "DRY RUN" : "LIVE"}                                   ║`);
  console.log(`║  Articles: ${count}                                    ║`);
  console.log(`║  Date: ${new Date().toISOString().split("T")[0]}                            ║`);
  console.log("╚══════════════════════════════════════════════════╝");

  // Detect mode: CLI (Max subscription) or SDK (API key)
  const mode = process.env.ANTHROPIC_API_KEY ? "SDK" : "CLI";
  console.log(`║  Engine: ${mode === "CLI" ? "Claude CLI (Max Abo)" : "Anthropic API (SDK)"}           ║`);

  const results: OrchestratorResult[] = [];
  let totalCost = 0;

  for (let i = 0; i < count; i++) {
    if (count > 1) {
      console.log(`\n${"═".repeat(50)}`);
      console.log(`  Article ${i + 1} of ${count}`);
      console.log(`${"═".repeat(50)}`);
    }

    try {
      const result = await orchestrate({
        maxRevisionRounds: 2,
      });

      results.push(result);
      totalCost += result.log.estimatedCost;

      if (result.draft && result.decision.decision === "approve") {
        await publishArticle(result.draft, result.log, dryRun);
      } else {
        console.log(
          `\n⏭️  Skipping publish — decision: ${result.decision.decision}`
        );
      }
    } catch (err) {
      console.error(`\n❌ Pipeline error: ${err}`);
      if (err instanceof Error) {
        console.error(err.stack);
      }
    }
  }

  // ─── Summary ──────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                 PIPELINE SUMMARY                 ║");
  console.log("╠══════════════════════════════════════════════════╣");

  for (const result of results) {
    const icon =
      result.decision.decision === "approve"
        ? "✅"
        : result.decision.decision === "revise"
          ? "🔄"
          : "❌";
    console.log(
      `║ ${icon} ${result.log.topic.padEnd(35)} Score: ${result.log.curatorPhase.qualityScore}/10 ║`
    );
  }

  const approved = results.filter(
    (r) => r.decision.decision === "approve"
  ).length;
  const rejected = results.filter(
    (r) => r.decision.decision === "reject"
  ).length;

  console.log("╠══════════════════════════════════════════════════╣");
  console.log(
    `║  Published: ${approved} | Rejected: ${rejected} | Cost: $${totalCost.toFixed(4)}   ║`
  );
  console.log("╚══════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("Fatal pipeline error:", err);
  process.exit(1);
});
