import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { runTurn } from "@/lib/ai/engine";
import { createConversation, getMerchant, parseLeadPayload } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/twilio";
import type { Conversation, Lead } from "@/lib/types";

export const maxDuration = 60;

function secretOk(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, ctx: RouteContext<"/api/hooks/zapier/[merchantId]">) {
  const { merchantId } = await ctx.params;
  const merchant = await getMerchant(merchantId);
  const url = new URL(req.url);

  let body: Record<string, unknown> = {};
  try {
    const type = req.headers.get("content-type") ?? "";
    body = type.includes("json")
      ? await req.json()
      : Object.fromEntries((await req.formData()).entries());
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON or form data" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return Response.json({ ok: false, error: "Body must be an object" }, { status: 400 });

  const given =
    req.headers.get("x-webhook-secret") ??
    url.searchParams.get("secret") ??
    (typeof body.secret === "string" ? body.secret : null);
  if (!merchant || !secretOk(merchant.webhook_secret, given))
    return Response.json({ ok: false, error: "Unknown merchant or bad secret" }, { status: 401 });

  const parsed = parseLeadPayload(body);
  if (!parsed.phone)
    return Response.json({ ok: false, error: "A valid `phone` field is required" }, { status: 422 });

  // Zapier retries and duplicate form submits: reuse a lead created for this number in the last day.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: dup } = await db()
    .from("leads")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("phone", parsed.phone)
    .gte("created_at", since)
    .limit(1);
  if (dup?.length) return Response.json({ ok: true, lead_id: dup[0].id, duplicate: true });

  // Never text someone who previously opted out of this merchant's messages.
  const { data: opted } = await db()
    .from("leads")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("phone", parsed.phone)
    .eq("status", "opted_out")
    .limit(1);

  const { data: lead, error } = await db()
    .from("leads")
    .insert({ merchant_id: merchant.id, ...parsed, status: opted?.length ? "opted_out" : "new" })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: "Could not save lead" }, { status: 500 });
  const l = lead as Lead;

  const canText = merchant.active && !!merchant.twilio_number && !opted?.length;
  if (canText) {
    after(async () => {
      try {
        const conversation: Conversation = await createConversation({
          merchant_id: merchant.id,
          lead_id: l.id,
          channel: "sms",
          collected: {
            ...(l.name ? { name: l.name } : {}),
            ...(l.email ? { email: l.email } : {}),
            ...(l.address ? { address: l.address } : {}),
            phone: l.phone!,
          },
        });
        let text = merchant.opening_message.trim();
        if (text) {
          text = text.replaceAll("{first_name}", l.name?.split(" ")[0] ?? "there").replaceAll("{business}", merchant.name);
          await db().from("messages").insert({ conversation_id: conversation.id, role: "assistant", content: text });
        } else {
          text = (await runTurn({ merchant, conversation, userText: null })).reply;
        }
        await sendSms(merchant.twilio_number!, l.phone!, text);
      } catch (e) {
        console.error("opening SMS failed", e);
      }
    });
  }
  return Response.json({
    ok: true,
    lead_id: l.id,
    texting: canText,
    ...(canText ? {} : { note: opted?.length ? "Lead previously opted out" : "Merchant inactive or has no phone number" }),
  });
}

// Lets you paste the URL in a browser to confirm it is live.
export async function GET() {
  return Response.json({ ok: true, hint: "POST lead fields here from Zapier." });
}
