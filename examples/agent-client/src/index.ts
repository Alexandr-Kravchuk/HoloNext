import Anthropic from "@anthropic-ai/sdk";
import { loadManifest } from "./manifest-loader.js";
import { synthesizeTools, toolNameToId } from "./tool-synth.js";

const BASE_URL = process.env.HOLONEXT_BASE_URL ?? "http://localhost:3030";
const MODEL = process.env.HOLONEXT_MODEL ?? "claude-sonnet-4-5";
const MAX_TURNS = 10;

async function callAction(id: string, params: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/api/agent/actions/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  return res.json();
}

async function run(task: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY env var");
    process.exit(1);
  }

  console.log(`\n→ Loading manifest from ${BASE_URL}…`);
  const manifest = await loadManifest(BASE_URL);
  console.log(`  page: ${manifest.page.title}`);
  console.log(`  actions: ${manifest.actions.map((a) => a.id).join(", ")}`);

  const tools = synthesizeTools(manifest.actions);

  const client = new Anthropic();
  const systemPrompt = [
    `You are an agent operating on a web page via the HoloNext Agent Framework.`,
    `Current page: ${manifest.page.title}.`,
    `Page context: ${manifest.page.context ?? "(none)"}.`,
    `Current state snapshot: ${JSON.stringify(manifest.state)}.`,
    `Use the provided tools (each maps to a page Action) to complete the user's task.`,
    `When the task is done, respond with a short final message — no further tool calls.`,
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  console.log(`\n→ Task: ${task}`);
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const reply = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    const toolUses = reply.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = reply.content.filter((b): b is Anthropic.TextBlock => b.type === "text");

    for (const t of textBlocks) {
      if (t.text.trim()) console.log(`\n[assistant] ${t.text.trim()}`);
    }

    if (reply.stop_reason !== "tool_use" || toolUses.length === 0) {
      console.log(`\n✓ Stopped (reason=${reply.stop_reason})`);
      return;
    }

    messages.push({ role: "assistant", content: reply.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const actionId = toolNameToId(tu.name);
      console.log(`\n→ tool_use: ${actionId}(${JSON.stringify(tu.input)})`);
      const out = await callAction(actionId, tu.input);
      console.log(`  ← ${JSON.stringify(out)}`);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(out),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }
  console.log(`\n⚠ Reached MAX_TURNS=${MAX_TURNS} without stopping.`);
}

const task = process.argv.slice(2).join(" ") ||
  "Add an iPhone 16 Pro and a pair of AirPods Pro to the cart, then tell me the total.";
run(task).catch((err) => {
  console.error(err);
  process.exit(1);
});
