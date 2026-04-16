/**
 * Live Web Research — fetches CURRENT trending AI tools from multiple sources.
 * Runs BEFORE the AI Researcher agent to provide real-time context.
 * Uses only free, no-auth APIs.
 */

export interface WebResearchResult {
  sources: string[];
  trendingTopics: string[];
  rawData: string; // Formatted context string for the Researcher agent
  fetchedAt: string;
}

/**
 * Fetch trending AI topics from multiple free sources.
 */
export async function fetchLiveResearch(): Promise<WebResearchResult> {
  console.log("  🌐 Fetching live data from web sources...");

  const results = await Promise.allSettled([
    fetchHackerNews(),
    fetchRedditAI(),
    fetchRedditMachineLearning(),
    fetchGoogleNewsRSS(),
    fetchProductHuntDaily(),
  ]);

  const trendingTopics: string[] = [];
  const sources: string[] = [];
  const sections: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      trendingTopics.push(...result.value.topics);
      sources.push(result.value.source);
      sections.push(result.value.formatted);
    }
  }

  const rawData = `AKTUELLE LIVE-DATEN (abgerufen am ${new Date().toISOString()}):\n\n${sections.join("\n\n")}`;

  console.log(`  → ${trendingTopics.length} trending topics aus ${sources.length} Quellen`);

  return {
    sources,
    trendingTopics,
    rawData,
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Hacker News ────────────────────────────────────────────

async function fetchHackerNews(): Promise<{ topics: string[]; source: string; formatted: string } | null> {
  try {
    // Get top stories
    const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    const ids: number[] = await res.json();

    // Fetch top 30 stories
    const stories = await Promise.all(
      ids.slice(0, 30).map(async (id) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return r.json();
      })
    );

    // Filter for AI/ML/LLM related stories
    const aiKeywords = /\b(ai|llm|gpt|claude|gemini|mistral|llama|openai|anthropic|machine.?learning|neural|transformer|diffusion|midjourney|copilot|chatbot|generative|artificial.?intelligence|deep.?learning|stable.?diffusion|sora|runway)\b/i;

    const aiStories = stories
      .filter((s: any) => s?.title && aiKeywords.test(s.title))
      .slice(0, 10)
      .map((s: any) => ({
        title: s.title,
        url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
        score: s.score,
      }));

    const topics = aiStories.map((s: any) => s.title);
    const formatted = `## Hacker News — Trending AI (Top ${aiStories.length})\n${aiStories.map((s: any) => `- [Score ${s.score}] ${s.title}`).join("\n")}`;

    console.log(`    ✓ Hacker News: ${aiStories.length} AI stories`);
    return { topics, source: "Hacker News", formatted };
  } catch (err) {
    console.log(`    ✗ Hacker News: ${err}`);
    return null;
  }
}

// ─── Reddit r/artificial ────────────────────────────────────

async function fetchRedditAI(): Promise<{ topics: string[]; source: string; formatted: string } | null> {
  try {
    const res = await fetch("https://www.reddit.com/r/artificial/hot.json?limit=15", {
      headers: { "User-Agent": "KIToolsBot/1.0" },
    });
    const data = await res.json();
    const posts = data?.data?.children ?? [];

    const topics = posts
      .map((p: any) => p.data?.title)
      .filter(Boolean)
      .slice(0, 10);

    const formatted = `## Reddit r/artificial — Hot Posts\n${topics.map((t: string) => `- ${t}`).join("\n")}`;

    console.log(`    ✓ Reddit r/artificial: ${topics.length} posts`);
    return { topics, source: "Reddit r/artificial", formatted };
  } catch (err) {
    console.log(`    ✗ Reddit r/artificial: ${err}`);
    return null;
  }
}

// ─── Reddit r/MachineLearning ───────────────────────────────

async function fetchRedditMachineLearning(): Promise<{ topics: string[]; source: string; formatted: string } | null> {
  try {
    const res = await fetch("https://www.reddit.com/r/MachineLearning/hot.json?limit=10", {
      headers: { "User-Agent": "KIToolsBot/1.0" },
    });
    const data = await res.json();
    const posts = data?.data?.children ?? [];

    const topics = posts
      .map((p: any) => p.data?.title)
      .filter(Boolean)
      .slice(0, 8);

    const formatted = `## Reddit r/MachineLearning — Hot Posts\n${topics.map((t: string) => `- ${t}`).join("\n")}`;

    console.log(`    ✓ Reddit r/MachineLearning: ${topics.length} posts`);
    return { topics, source: "Reddit r/MachineLearning", formatted };
  } catch (err) {
    console.log(`    ✗ Reddit r/MachineLearning: ${err}`);
    return null;
  }
}

// ─── Google News RSS ────────────────────────────────────────

async function fetchGoogleNewsRSS(): Promise<{ topics: string[]; source: string; formatted: string } | null> {
  try {
    // Google News RSS for AI tools query
    const queries = [
      "AI+tools+new+2026",
      "KI+Tools+neu",
      "best+AI+software+launch",
    ];

    const allTopics: string[] = [];

    for (const q of queries) {
      const res = await fetch(
        `https://news.google.com/rss/search?q=${q}&hl=de&gl=DE&ceid=DE:de`
      );
      const xml = await res.text();

      // Simple XML title extraction (no parser needed)
      const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
        .map((m) => m[1])
        .filter((t) => t && !t.includes("Google News"))
        .slice(0, 5);

      allTopics.push(...titles);
    }

    const uniqueTopics = [...new Set(allTopics)].slice(0, 12);
    const formatted = `## Google News — Aktuelle KI/AI Nachrichten\n${uniqueTopics.map((t) => `- ${t}`).join("\n")}`;

    console.log(`    ✓ Google News: ${uniqueTopics.length} headlines`);
    return { topics: uniqueTopics, source: "Google News RSS", formatted };
  } catch (err) {
    console.log(`    ✗ Google News: ${err}`);
    return null;
  }
}

// ─── Product Hunt Daily ─────────────────────────────────────

async function fetchProductHuntDaily(): Promise<{ topics: string[]; source: string; formatted: string } | null> {
  try {
    // Product Hunt's unofficial feed for today's posts
    const res = await fetch("https://www.producthunt.com/feed?category=ai", {
      headers: { "User-Agent": "KIToolsBot/1.0" },
    });
    const xml = await res.text();

    // Extract titles from RSS
    const titles = [...xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
      .map((m) => m[1])
      .filter((t) => t && !t.includes("Product Hunt"))
      .slice(0, 10);

    // Fallback: try without CDATA
    if (titles.length === 0) {
      const simpleTitles = [...xml.matchAll(/<title>(.*?)<\/title>/g)]
        .map((m) => m[1])
        .filter((t) => t && !t.includes("Product Hunt") && t.length > 5)
        .slice(0, 10);
      titles.push(...simpleTitles);
    }

    const formatted = `## Product Hunt — Neue AI Produkte\n${titles.map((t) => `- ${t}`).join("\n")}`;

    console.log(`    ✓ Product Hunt: ${titles.length} products`);
    return { topics: titles, source: "Product Hunt", formatted };
  } catch (err) {
    console.log(`    ✗ Product Hunt: ${err}`);
    return null;
  }
}
