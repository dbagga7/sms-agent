import "server-only";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { calendarFor } from "../calendar";
import { db } from "../supabase/admin";
import { sendSms } from "../twilio";
import type { Collected, Conversation, Faq, Lead, Merchant, Message, QualifyingQuestion } from "../types";
import { addDays, formatSlot, localDate, normalizePhone, zonedTime } from "../util";
import { buildSystemPrompt } from "./prompt";

export type TraceEntry = { tool: string; args: unknown; result: unknown };
export type TurnResult = { reply: string; trace: TraceEntry[]; conversation: Conversation };

const MAX_TOOL_ROUNDS = 6;
const FALLBACK = "Thanks for your message! Someone from our team will follow up with you shortly.";

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "save_lead_info",
      description: "Save contact details or qualifying-question answers the lead has provided.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: { type: "string", description: "Full service address: street, city, state, ZIP" },
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: { question_id: { type: "string" }, answer: { type: "string" } },
              required: ["question_id", "answer"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Get open appointment slots from the business calendar for a date range (max 14 days).",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD in the business time zone" },
          end_date: { type: "string", description: "YYYY-MM-DD, inclusive. Defaults to start_date + 4 days." },
        },
        required: ["start_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book the appointment. Only call after the lead explicitly chose a slot from check_availability.",
      parameters: {
        type: "object",
        properties: { start_time: { type: "string", description: "Exact ISO start time of the chosen slot" } },
        required: ["start_time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human",
      description: "Flag this conversation for a team member to take over.",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_not_interested",
      description: "The lead said they are not interested.",
      parameters: { type: "object", properties: {} },
    },
  },
];

type Ctx = {
  merchant: Merchant;
  conversation: Conversation;
  questions: QualifyingQuestion[];
};

/** Weekday 9-5 hourly slots, used only in test chats when no calendar is connected. */
function sampleSlots(startDate: string, endDate: string, tz: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const h of [9, 11, 13, 15]) {
      const t = zonedTime(d, h, 0, tz);
      if (t.getTime() > Date.now()) out.push(t.toISOString());
    }
  }
  return out;
}

async function saveCollected(ctx: Ctx, patch: Collected) {
  const c = ctx.conversation;
  const next: Collected = { ...c.collected, ...patch, answers: { ...c.collected.answers, ...patch.answers } };
  c.collected = next;
  await db().from("conversations").update({ collected: next }).eq("id", c.id);
  if (c.lead_id) {
    const leadPatch: Partial<Lead> = {};
    if (patch.name) leadPatch.name = patch.name;
    if (patch.email) leadPatch.email = patch.email;
    if (patch.address) leadPatch.address = patch.address;
    if (patch.phone) leadPatch.phone = patch.phone;
    if (Object.keys(leadPatch).length) await db().from("leads").update(leadPatch).eq("id", c.lead_id);
  }
}

async function setStatus(ctx: Ctx, convStatus: Conversation["status"], leadStatus: string) {
  ctx.conversation.status = convStatus;
  await db().from("conversations").update({ status: convStatus }).eq("id", ctx.conversation.id);
  if (ctx.conversation.lead_id)
    await db().from("leads").update({ status: leadStatus }).eq("id", ctx.conversation.lead_id);
}

async function notifyOwner(ctx: Ctx, text: string) {
  const { merchant: m, conversation: c } = ctx;
  if (c.channel === "test" || !m.owner_notify_phone || !m.twilio_number) return;
  try {
    await sendSms(m.twilio_number, m.owner_notify_phone, text.slice(0, 600));
  } catch (e) {
    console.error("owner notification failed", e);
  }
}

async function runTool(ctx: Ctx, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { merchant: m, conversation: c } = ctx;
  const isTest = c.channel === "test";

  if (name === "save_lead_info") {
    const patch: Collected = {};
    if (typeof args.name === "string") patch.name = args.name.trim();
    if (typeof args.email === "string") {
      const email = args.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email looks invalid; ask again." };
      patch.email = email;
    }
    if (typeof args.phone === "string") {
      const p = normalizePhone(args.phone);
      if (!p) return { ok: false, error: "That phone number looks invalid; ask again." };
      patch.phone = p;
    }
    if (typeof args.address === "string") patch.address = args.address.trim();
    if (Array.isArray(args.answers)) {
      const valid = new Set(ctx.questions.map((q) => q.id));
      patch.answers = {};
      for (const a of args.answers as { question_id?: string; answer?: string }[])
        if (a.question_id && valid.has(a.question_id) && a.answer) patch.answers[a.question_id] = String(a.answer);
    }
    await saveCollected(ctx, patch);
    return { ok: true };
  }

  if (name === "check_availability") {
    const today = localDate(new Date(), m.timezone);
    let start = typeof args.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.start_date) ? args.start_date : today;
    if (start < today) start = today;
    let end = typeof args.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.end_date) ? args.end_date : addDays(start, 4);
    if (end < start) end = start;
    if (end > addDays(start, 13)) end = addDays(start, 13);

    const cal = calendarFor(m);
    let slots: string[];
    if (cal) {
      const from = zonedTime(start, 0, 0, m.timezone).toISOString();
      const to = zonedTime(addDays(end, 1), 0, 0, m.timezone).toISOString();
      slots = await cal.getSlots(m.calendar_event_type_id!, from, to, m.timezone);
    } else if (isTest) {
      slots = sampleSlots(start, end, m.timezone);
    } else {
      return { ok: false, error: "Calendar is not connected. Call request_human." };
    }
    // Spread the options over the range instead of returning only the first morning.
    const byDay = new Map<string, string[]>();
    for (const s of slots) {
      const d = localDate(new Date(s), m.timezone);
      byDay.set(d, [...(byDay.get(d) ?? []), s]);
    }
    const picked = [...byDay.values()].flatMap((day) => day.slice(0, 6)).slice(0, 30);
    return {
      ok: true,
      sample_data: !cal,
      time_zone: m.timezone,
      slots: picked.map((s) => ({ start_time: s, display: formatSlot(s, m.timezone) })),
      note: picked.length ? undefined : "No openings in that range; try later dates.",
    };
  }

  if (name === "book_appointment") {
    const col = c.collected;
    const missing: string[] = [];
    if (!col.name) missing.push("name");
    if (!col.email) missing.push("email");
    if (c.channel === "web" && !col.phone) missing.push("phone");
    if (m.goal === "in_home" && !col.address) missing.push("service address");
    for (const q of ctx.questions)
      if (q.required && !col.answers?.[q.id]) missing.push(`answer to: "${q.question}"`);
    if (missing.length) return { ok: false, error: `Cannot book yet. Still missing: ${missing.join("; ")}` };

    const t = new Date(String(args.start_time));
    if (isNaN(t.getTime()) || t.getTime() < Date.now()) return { ok: false, error: "Invalid start_time." };
    const start = t.toISOString();

    const cal = calendarFor(m);
    let bookingId: string | null = null;
    if (!isTest) {
      if (!cal) return { ok: false, error: "Calendar is not connected. Call request_human." };
      try {
        const answers = ctx.questions
          .filter((q) => col.answers?.[q.id])
          .map((q) => `${q.question} ${col.answers![q.id]}`)
          .join("\n");
        bookingId = (
          await cal.book({
            eventTypeId: m.calendar_event_type_id!,
            start,
            name: col.name!,
            email: col.email!,
            phone: col.phone,
            timeZone: m.timezone,
            address: m.goal === "in_home" ? col.address : undefined,
            notes: answers,
          })
        ).id;
      } catch (e) {
        console.error("booking failed", e);
        return { ok: false, error: "The calendar rejected that time. Offer other times or call request_human." };
      }
    }
    await db().from("appointments").insert({
      merchant_id: m.id,
      lead_id: c.lead_id,
      conversation_id: c.id,
      type: m.goal,
      start_time: start,
      address: m.goal === "in_home" ? col.address : null,
      provider: isTest ? null : "calcom",
      provider_booking_id: bookingId,
      is_test: isTest,
    });
    await setStatus(ctx, "booked", "booked");
    await notifyOwner(
      ctx,
      `New ${m.goal === "in_home" ? "in-home" : "phone"} consultation: ${col.name}, ${formatSlot(start, m.timezone)}` +
        `${col.phone ? `, ${col.phone}` : ""}${m.goal === "in_home" ? `, ${col.address}` : ""}`,
    );
    return { ok: true, simulated: isTest, booked_for: formatSlot(start, m.timezone) };
  }

  if (name === "request_human") {
    await setStatus(ctx, "handoff", "handoff");
    await notifyOwner(
      ctx,
      `Lead needs a person: ${c.collected.name ?? "Unknown"} ${c.collected.phone ?? ""} — ${String(args.reason ?? "")}`,
    );
    return { ok: true };
  }

  if (name === "mark_not_interested") {
    await setStatus(ctx, "closed", "not_interested");
    return { ok: true };
  }

  return { ok: false, error: `Unknown tool ${name}` };
}

async function loadConfig(merchantId: string) {
  const [f, q] = await Promise.all([
    db().from("faqs").select("*").eq("merchant_id", merchantId).order("position").order("created_at"),
    db().from("qualifying_questions").select("*").eq("merchant_id", merchantId).order("position").order("created_at"),
  ]);
  return { faqs: (f.data ?? []) as Faq[], questions: (q.data ?? []) as QualifyingQuestion[] };
}

function leadContext(lead: Lead | null): string | undefined {
  if (!lead) return undefined;
  const lines = [lead.source && `Source: ${lead.source}`, lead.notes && `Notes: ${lead.notes}`];
  for (const [k, v] of Object.entries(lead.raw ?? {}))
    if (typeof v === "string" || typeof v === "number") lines.push(`${k}: ${String(v).slice(0, 200)}`);
  return lines.filter(Boolean).slice(0, 25).join("\n") || undefined;
}

/**
 * Runs one assistant turn. `userText` is the lead's message, or null to have the
 * assistant open the conversation (first outreach to a new Zapier lead).
 */
export async function runTurn(opts: {
  merchant: Merchant;
  conversation: Conversation;
  userText: string | null;
}): Promise<TurnResult> {
  const { merchant, conversation } = opts;
  const trace: TraceEntry[] = [];

  if (opts.userText !== null)
    await db().from("messages").insert({ conversation_id: conversation.id, role: "user", content: opts.userText });

  const [{ faqs, questions }, history, leadRes] = await Promise.all([
    loadConfig(merchant.id),
    db()
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(40),
    conversation.lead_id
      ? db().from("leads").select("*").eq("id", conversation.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const ctx: Ctx = { merchant, conversation, questions };
  const past = ((history.data ?? []) as Message[]).reverse();

  const messages: ChatCompletionMessageParam[] = past.map((m) => ({ role: m.role, content: m.content }));
  if (opts.userText === null)
    messages.push({
      role: "user",
      content:
        "[SYSTEM: This lead just submitted an inquiry form. Write the first outreach text: greet them by first name if known, " +
        "say who you are with, reference their request, and ask the first qualifying question or offer to find a time. " +
        'End with "Reply STOP to opt out."]',
    });

  let reply = "";
  try {
    const openai = new OpenAI();
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Rebuilt each round so saved answers show up as answered.
      const system = buildSystemPrompt({
        merchant,
        faqs,
        questions,
        collected: conversation.collected,
        channel: conversation.channel,
        leadContext: leadContext(leadRes.data as Lead | null),
      });
      const res = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "system", content: system }, ...messages],
        tools,
        tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
      });
      const msg = res.choices[0].message;
      if (!msg.tool_calls?.length) {
        reply = (msg.content ?? "").trim();
        break;
      }
      messages.push(msg);
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown> = {};
        let result: unknown;
        try {
          args = JSON.parse(call.function.arguments || "{}");
          result = await runTool(ctx, call.function.name, args);
        } catch (e) {
          console.error(`tool ${call.function.name} failed`, e);
          result = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Tool failed" };
        }
        trace.push({ tool: call.function.name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (e) {
    console.error("AI turn failed", e);
    trace.push({ tool: "error", args: {}, result: e instanceof Error ? e.message : String(e) });
  }
  if (!reply) {
    reply = FALLBACK;
    if (conversation.status === "open") await setStatus(ctx, "handoff", "handoff");
  }

  await db()
    .from("messages")
    .insert({ conversation_id: conversation.id, role: "assistant", content: reply, meta: { trace } });
  await db().from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id);
  if (conversation.lead_id && opts.userText !== null)
    await db().from("leads").update({ status: "engaged" }).eq("id", conversation.lead_id).eq("status", "new");

  return { reply, trace, conversation };
}
