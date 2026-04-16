import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load a system prompt from agents/prompts/.
 */
export function loadPrompt(agentName: string): string {
  const promptPath = join(__dirname, "prompts", `${agentName}.md`);
  return readFileSync(promptPath, "utf-8");
}

/**
 * Detect whether to use the Anthropic API SDK or the `claude` CLI.
 */
function getMode(): "cli" | "sdk" {
  return process.env.ANTHROPIC_API_KEY ? "sdk" : "cli";
}

/**
 * Call Claude via the `claude` CLI (included in Max subscription).
 * Sends the prompt via process stdin to avoid argument length limits.
 */
async function callViaCLI(options: {
  model: "haiku" | "sonnet";
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<{ result: string; tokensUsed: number }> {
  const systemText = loadPrompt(options.systemPrompt);
  // CLI uses short model names, not full API IDs
  const modelFlag = options.model === "haiku" ? "haiku" : "sonnet";

  // Combine system prompt + user message
  const fullPrompt = `${systemText}\n\n---\n\n${options.userMessage}`;

  try {
    // Pass prompt via stdin — unset CLAUDECODE to allow nested CLI calls
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const result = spawnSync("claude", [
      "--print",
      "--model", modelFlag,
      "--max-turns", "1",
    ], {
      input: fullPrompt,
      encoding: "utf-8",
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300_000, // 5 min for long articles
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() ?? "";
      const stdout = result.stdout?.trim() ?? "";
      throw new Error(
        `CLI exited with code ${result.status}:\n  stderr: ${stderr}\n  stdout (last 500): ${stdout.slice(-500)}`
      );
    }

    const output = result.stdout?.trim() ?? "";
    if (!output) {
      throw new Error("Empty response from Claude CLI");
    }

    return {
      result: output,
      tokensUsed: Math.ceil(fullPrompt.length / 4) + Math.ceil(output.length / 4),
    };
  } catch (err: any) {
    throw new Error(`Claude CLI failed: ${err.message ?? err}`);
  }
}

/**
 * Call Claude via the Anthropic SDK (requires ANTHROPIC_API_KEY).
 * Used in GitHub Actions or when API key is available.
 */
async function callViaSDK(options: {
  model: "haiku" | "sonnet";
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ result: string; tokensUsed: number }> {
  // Dynamic import — only loads SDK when actually needed
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const modelId =
    options.model === "haiku"
      ? "claude-haiku-4-5-20251001"
      : "claude-sonnet-4-6-20260414";

  const systemText = loadPrompt(options.systemPrompt);

  const response = await client.messages.create({
    model: modelId,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    system: [
      {
        type: "text",
        text: systemText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: options.userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) +
    (response.usage?.output_tokens ?? 0);

  return { result: textBlock.text, tokensUsed };
}

/**
 * Call a Claude model with structured JSON output using Zod schema.
 * Automatically picks CLI (Max sub) or SDK (API key) based on environment.
 */
export async function callAgent<T>(options: {
  model: "haiku" | "sonnet";
  systemPrompt: string;
  userMessage: string;
  schema: { parse: (data: unknown) => T };
  maxTokens?: number;
  temperature?: number;
}): Promise<{ result: T; tokensUsed: number }> {
  const mode = getMode();
  console.log(`  [${mode.toUpperCase()}] → ${options.model} (${options.systemPrompt})`);

  const { result: rawText, tokensUsed } =
    mode === "cli"
      ? await callViaCLI(options)
      : await callViaSDK(options);

  // Extract and parse JSON robustly from model response
  const parsed = extractJSON(rawText);
  const validated = options.schema.parse(parsed);

  return { result: validated, tokensUsed };
}

/**
 * Call agent with raw text response (no schema validation).
 */
export async function callAgentRaw(options: {
  model: "haiku" | "sonnet";
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ result: string; tokensUsed: number }> {
  const mode = getMode();

  return mode === "cli"
    ? callViaCLI(options)
    : callViaSDK(options);
}

/**
 * Robustly extract a JSON object from model output.
 * Handles: code blocks, extra text, unescaped quotes in strings, trailing commas.
 */
function extractJSON(raw: string): unknown {
  let text = raw.trim();

  // 1. Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 2. Find the outermost JSON object
  if (!text.startsWith("{") && !text.startsWith("[")) {
    const start = text.indexOf("{");
    if (start !== -1) {
      text = text.slice(start);
    }
  }

  // Find matching closing brace (handle nested braces)
  if (text.startsWith("{")) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === "{") depth++;
        if (ch === "}") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
    }

    if (end > 0) {
      text = text.slice(0, end);
    }
  }

  // 3. Try parsing as-is first
  try {
    return JSON.parse(text);
  } catch {
    // Continue to repair attempts
  }

  // 4. Fix trailing commas before } or ]
  let repaired = text.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(repaired);
  } catch {
    // Continue
  }

  // 5. Fix unescaped newlines inside string values
  repaired = repaired.replace(
    /"([^"]*?)"/g,
    (_match, content) => {
      const fixed = content
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      return `"${fixed}"`;
    }
  );

  try {
    return JSON.parse(repaired);
  } catch {
    // Continue
  }

  // 6. Last resort: try to eval as JavaScript object (handles single quotes etc.)
  try {
    // Replace single quotes used as string delimiters with double quotes
    // This is a heuristic — not perfect but catches common model outputs
    const jsFixed = repaired
      .replace(/'/g, '"')
      .replace(/(\w+)\s*:/g, '"$1":'); // unquoted keys

    return JSON.parse(jsFixed);
  } catch (finalErr) {
    throw new Error(
      `Failed to parse JSON after repair attempts.\nFirst 500 chars: ${text.slice(0, 500)}\nError: ${finalErr}`
    );
  }
}
