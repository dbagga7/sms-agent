import { runTurn } from "@/lib/ai/engine";
import { createConversation } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import type { Conversation, Merchant } from "@/lib/types";

export const maxDuration = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const MAX_MESSAGES = 80;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  let body: { key?: unknown; sessionId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }
  const { key, sessionId, message } = body;
  if (
    typeof key !== "string" ||
    typeof sessionId !== "string" ||
    !/^[A-Za-z0-9_-]{16,64}$/.test(sessionId) ||
    typeof message !== "string" ||
    !message.trim()
  )
    return json({ ok: false, error: "Bad request" }, 400);

  const { data: m } = await db().from("merchants").select("*").eq("widget_key", key).maybeSingle();
  const merchant = m as Merchant | null;
  if (!merchant || !merchant.active) return json({ ok: false, error: "Unknown widget" }, 404);

  const { data: existing } = await db()
    .from("conversations")
    .select("*")
    .eq("merchant_id", merchant.id)
    .eq("session_id", sessionId)
    .maybeSingle();
  let conversation = existing as Conversation | null;
  if (!conversation) {
    const { data: lead } = await db()
      .from("leads")
      .insert({ merchant_id: merchant.id, source: "website_chat" })
      .select("id")
      .single();
    conversation = await createConversation({
      merchant_id: merchant.id,
      lead_id: lead?.id ?? null,
      channel: "web",
      session_id: sessionId,
    });
  }

  const { count } = await db()
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id);
  if ((count ?? 0) >= MAX_MESSAGES || conversation.status === "handoff" || conversation.status === "closed") {
    await db()
      .from("messages")
      .insert({ conversation_id: conversation.id, role: "user", content: message.trim().slice(0, 1000) });
    return json({ ok: true, reply: "Thanks! Someone from our team will follow up with you shortly." });
  }

  const { reply } = await runTurn({ merchant, conversation, userText: message.trim().slice(0, 1000) });
  return json({ ok: true, reply });
}
