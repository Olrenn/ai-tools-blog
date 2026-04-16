import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AffiliateProgram, ArticleDraft } from "../agents/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function loadAffiliatePrograms(): AffiliateProgram[] {
  const filePath = join(dataDir, "affiliate-programs.json");
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return data.programs ?? [];
}

/**
 * Replaces tool mentions in article content with affiliate links.
 * Returns the modified content with properly tagged affiliate links.
 */
export function injectAffiliateLinks(draft: ArticleDraft): string {
  const programs = loadAffiliatePrograms();
  let content = draft.content;

  // Find matching affiliate program for this tool
  const matchingProgram = programs.find(
    (p) => p.toolName.toLowerCase() === draft.toolName.toLowerCase()
  );

  if (matchingProgram) {
    // Replace first mention of the tool name with an affiliate link
    const toolNameRegex = new RegExp(`\\b(${escapeRegex(draft.toolName)})\\b`, "i");
    const firstMatch = content.match(toolNameRegex);
    if (firstMatch) {
      content = content.replace(
        toolNameRegex,
        `[$1](${matchingProgram.affiliateUrl}){rel="sponsored nofollow"}`
      );
    }

    // Add affiliate CTA box after the "Preise" or "Pricing" section
    const pricingSectionRegex = /^(##\s+(?:Preise|Pricing|Kosten)[\s\S]*?)(\n##\s)/m;
    const affiliateBox = `\n\n<AffiliateBox toolName="${draft.toolName}" url="${matchingProgram.affiliateUrl}" commission="${matchingProgram.commission}" />\n\n`;

    if (pricingSectionRegex.test(content)) {
      content = content.replace(pricingSectionRegex, `$1${affiliateBox}$2`);
    } else {
      // If no pricing section found, add before Fazit
      const fazitRegex = /(\n##\s+(?:Fazit|Conclusion))/i;
      if (fazitRegex.test(content)) {
        content = content.replace(fazitRegex, `${affiliateBox}$1`);
      }
    }
  }

  // Add affiliate disclosure at the top
  const disclosure =
    '*Hinweis: Einige Links in diesem Artikel sind Affiliate-Links. Wenn du über diese Links ein Produkt kaufst, erhalten wir eine kleine Provision — ohne Mehrkosten für dich. Dies hilft uns, den Blog zu finanzieren und weiterhin unabhängige Reviews zu erstellen.*\n\n';

  return disclosure + content;
}

/**
 * Also inject affiliate links for OTHER tools mentioned in the article.
 */
export function injectCrossLinks(content: string): string {
  const programs = loadAffiliatePrograms();

  for (const program of programs) {
    // Only replace if the tool name appears but isn't already a link
    const regex = new RegExp(
      `(?<!\\[)\\b(${escapeRegex(program.toolName)})\\b(?!\\])(?!\\()`,
      "gi"
    );

    // Only replace the first occurrence of each tool
    let replaced = false;
    content = content.replace(regex, (match) => {
      if (replaced) return match;
      replaced = true;
      return `[${match}](${program.affiliateUrl}){rel="sponsored nofollow"}`;
    });
  }

  return content;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
