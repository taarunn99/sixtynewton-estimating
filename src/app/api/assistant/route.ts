// Assistant route, spec section 6. Streaming, one conversation per quote.
// The model reads the context packet and proposes; the engine applies through
// tool calls. SSE events: text (delta), tool (name and status), note (drafted
// client text), warn, done (usage), error.
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireUser(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}
import { buildContextPacket, SYSTEM_PROMPT } from "@/lib/assistant/context";
import { executeTool, MUTATING_TOOLS, TOOL_DEFINITIONS } from "@/lib/assistant/tools";

export const maxDuration = 120;

const MAX_TOOL_ROUNDS = 6;

export async function POST(request: NextRequest) {
  const profile = await requireUser();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { quoteId, message } = (await request.json()) as { quoteId?: string; message?: string };
  if (!quoteId || !message?.trim()) return new Response("Bad request", { status: 400 });

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("assistant_model, assistant_token_budget")
    .single();
  const model = settings?.assistant_model ?? "claude-sonnet-4-6";
  const budget = settings?.assistant_token_budget ?? 200000;

  // Token guard: per-quote budget, warn at 80%
  const { data: spent } = await supabase
    .from("assistant_messages")
    .select("tokens_in, tokens_out")
    .eq("quote_id", quoteId);
  const used = (spent ?? []).reduce((s, m) => s + (m.tokens_in ?? 0) + (m.tokens_out ?? 0), 0);
  if (used >= budget) {
    return new Response(
      JSON.stringify({ error: "Token budget for this quote is exhausted. Raise it in settings." }),
      { status: 402, headers: { "content-type": "application/json" } }
    );
  }

  const built = await buildContextPacket(quoteId);
  if (!built) return new Response("Quote not found", { status: 404 });

  const { data: historyRows } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = (historyRows ?? [])
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  await supabase.from("assistant_messages").insert({
    quote_id: quoteId,
    role: "user",
    content: message,
    created_by: profile.id,
  });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      let tokensIn = 0;
      let tokensOut = 0;
      let assistantText = "";
      const toolCallLog: { name: string; input: unknown }[] = [];
      let mutated = false;

      try {
        if (used >= budget * 0.8) {
          send({ type: "warn", message: "Over 80% of this quote's token budget is used." });
        }

        const messages: Anthropic.MessageParam[] = [
          ...history,
          {
            role: "user" as const,
            content: `Context packet (engine output, current):\n${built.packet}\n\nUser message: ${message}`,
          },
        ];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const runner = client.messages.stream({ model, max_tokens: 4096, system: SYSTEM_PROMPT, messages, tools: TOOL_DEFINITIONS });
          runner.on("text", (delta) => {
            assistantText += delta;
            send({ type: "text", delta });
          });
          const response = await runner.finalMessage();
          tokensIn += response.usage.input_tokens;
          tokensOut += response.usage.output_tokens;

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

          messages.push({ role: "assistant", content: response.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const use of toolUses) {
            const input = use.input as Record<string, unknown>;
            toolCallLog.push({ name: use.name, input });
            if (use.name === "draft_note") {
              send({ type: "note", purpose: input.purpose, text: input.text });
            } else {
              send({ type: "tool", name: use.name });
            }
            const result = await executeTool(quoteId, use.name, input);
            if (MUTATING_TOOLS.has(use.name) && !("error" in result)) mutated = true;
            results.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify(result),
              is_error: "error" in result,
            });
          }
          messages.push({ role: "user", content: results });
          assistantText += assistantText.endsWith("\n") || !assistantText ? "" : "\n";
        }

        await supabase.from("assistant_messages").insert({
          quote_id: quoteId,
          role: "assistant",
          content: assistantText,
          tool_calls: toolCallLog.length ? toolCallLog : null,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          model,
          created_by: profile.id,
        });

        send({
          type: "done",
          mutated,
          tokensUsed: used + tokensIn + tokensOut,
          tokenBudget: budget,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Assistant failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

// Thread history for the panel.
export async function GET(request: NextRequest) {
  const profile = await requireUser();
  if (!profile) return new Response("Unauthorized", { status: 401 });
  const quoteId = request.nextUrl.searchParams.get("quoteId");
  if (!quoteId) return new Response("Bad request", { status: 400 });

  const supabase = createServiceClient();
  const [{ data: rows }, { data: settings }] = await Promise.all([
    supabase
      .from("assistant_messages")
      .select("id, role, content, tool_calls, tokens_in, tokens_out, created_at")
      .eq("quote_id", quoteId)
      .order("created_at"),
    supabase.from("settings").select("assistant_model, assistant_token_budget").single(),
  ]);
  const tokensUsed = (rows ?? []).reduce(
    (s, m) => s + (m.tokens_in ?? 0) + (m.tokens_out ?? 0),
    0
  );
  return Response.json({
    messages: rows ?? [],
    tokensUsed,
    tokenBudget: settings?.assistant_token_budget ?? 200000,
    model: settings?.assistant_model ?? "claude-sonnet-4-6",
  });
}
