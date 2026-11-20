import { after } from "next/server";
import { runTurn } from "@/lib/ai/engine";
import { createConversation } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { sendSms, validateTwilioSignature } from "@/lib/twilio";
import type { Conversation, Lead, Merchant } from "@/lib/types";

export const maxDuration = 60;

const STOP = /^(stop|stopall|unsubscribe|cancel|end|quit|revoke|optout)$/i;
const START = /^(start|unstop|yes)$/i;
const twiml = () =>
  new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  if (!validateTwilioSignature(req.headers.get("x-twilio-signature"), params))
    return new Response("Invalid signature", { status: 403 });

  const { From: from, To: to, Body: text = "" } = params;
  const body = text.trim();
  const { data: m } = await db().from("merchants").select("*").eq("twilio_number", to).maybeSingle();
  const merchant = m as Merchant | null;
  if (!merchant || !from) return twiml();

  const { data: leads } = await db()
    .from("leads")
    .select("*")
    .eq("merchant_id", merchant.id)
    .eq("phone", from)
    .order("created_at", { ascending: false })
    .limit(1);
  let lead = (leads?.[0] as Lead | undefined) ?? null;

  // Twilio sends the carrier-mandated STOP/START replies itself; we only record the state.
  if (STOP.test(body)) {
    await db().from("leads").update({ status: "opted_out" }).eq("merchant_id", merchant.id).eq("phone", from);
    return twiml();
  }
  if (lead?.status === "opted_out") {
    if (!START.test(body)) return twiml();
    await db().from("leads").update({ status: "engaged" }).eq("id", lead.id);
    return twiml();
  }
  if (!body || !merchant.active) return twiml();

  if (!lead) {
    const { data } = await db()
      .from("leads")
      .insert({ merchant_id: merchant.id, phone: from, source: "inbound_sms" })
      .select("*")
      .single();
    lead = data as Lead;
  }
  const { data: convs } = await db()
    .from("conversations")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("channel", "sms")
    .order("created_at", { ascending: false })
    .limit(1);
  const conversation: Conversation =
    (convs?.[0] as Conversation | undefined) ??
    (await createConversation({
      merchant_id: merchant.id,
      lead_id: lead.id,
      channel: "sms",
      collected: { phone: from },
    }));

  // A person has taken over (or the lead declined): log the text, don't auto-reply.
  if (conversation.status === "handoff" || conversation.status === "closed") {
    await db().from("messages").insert({ conversation_id: conversation.id, role: "user", content: body });
    await db().from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
    return twiml();
  }

  // Answer Twilio right away (it times out at 15s) and reply through the REST API.
  after(async () => {
    try {
      const { reply } = await runTurn({ merchant, conversation, userText: body.slice(0, 1600) });
      await sendSms(to, from, reply);
    } catch (e) {
      console.error("SMS reply failed", e);
    }
  });
  return twiml();
}
