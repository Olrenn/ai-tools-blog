import { callAgent } from "./client.js";
import { ResearchOutputSchema, type ResearchOutput } from "./types.js";
import { fetchLiveResearch } from "./web-research.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function getPublishedTopics(): string[] {
  const filePath = join(dataDir, "published-topics.json");
  if (!existsSync(filePath)) return [];
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  return data.topics ?? [];
}

export async function researchTopics(): Promise<{
  output: ResearchOutput;
  tokensUsed: number;
}> {
  const publishedTopics = getPublishedTopics();

  // Step 1: Fetch LIVE data from web sources
  const liveData = await fetchLiveResearch();

  // Step 2: Feed live data + context to AI Researcher
  const userMessage = `Finde die Top AI-Tools und Produktivitäts-Themen für neue Blog-Artikel.

WICHTIG: Nutze die folgenden LIVE-DATEN als Hauptquelle für deine Vorschläge.
Diese Daten wurden GERADE EBEN aus dem Internet abgerufen und sind aktuell.
Schlage NUR Themen vor die in diesen Live-Daten vorkommen oder die du als AKTUELL bestätigen kannst.
Schlage KEINE veralteten Tools oder Modelle vor.

${liveData.rawData}

---

BEREITS VERÖFFENTLICHTE THEMEN (NICHT erneut vorschlagen):
${publishedTopics.length > 0 ? publishedTopics.map((t) => `- ${t}`).join("\n") : "- (noch keine Artikel veröffentlicht)"}

REGELN:
1. Basiere deine Vorschläge auf den LIVE-DATEN oben
2. Priorisiere Themen die JETZT trending sind
3. Nutze aktuelle Modellnamen und Versionsnummern
4. Vergleichsartikel und Reviews performen am besten
5. Gib 3-5 Vorschläge zurück, sortiert nach Gesamtpotenzial

Antworte NUR mit dem JSON-Objekt, kein anderer Text.`;

  const { result, tokensUsed } = await callAgent({
    model: "haiku",
    systemPrompt: "researcher",
    userMessage,
    schema: ResearchOutputSchema,
    temperature: 0.8,
  });

  return { output: result, tokensUsed };
}
