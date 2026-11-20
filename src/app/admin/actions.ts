"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runTurn, type TraceEntry } from "@/lib/ai/engine";
import { providerFor } from "@/lib/calendar";
import { createConversation, getMerchant } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { authClient, requireAdmin } from "@/lib/supabase/server";
import { claimOwnedNumber, purchaseNumber, twilioClient } from "@/lib/twilio";
import type { Collected, Conversation } from "@/lib/types";
import { appUrl, normalizePhone } from "@/lib/util";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const base = (id: string) => `/admin/merchants/${id}`;
const fail = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message.slice(0, 300))}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

// ---------- auth ----------

export async function signInWithGoogle() {
  const supabase = await authClient();
  const domains = (process.env.ADMIN_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl()}/auth/callback`,
      // Only a hint to Google's account picker; the real check is isAllowedAdmin().
      queryParams: { prompt: "select_account", ...(domains.length === 1 ? { hd: domains[0] } : {}) },
    },
  });
  if (error || !data.url) fail("/login", "Google sign-in is not configured yet.");
  redirect(data.url!);
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- merchants ----------

function merchantFields(form: FormData) {
  const tz = str(form, "timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(`"${tz}" is not a valid time zone`);
  }
  const notify = str(form, "owner_notify_phone");
  const notifyPhone = notify ? normalizePhone(notify) : null;
  if (notify && !notifyPhone) throw new Error("Notification phone number is not valid");
  const name = str(form, "name");
  if (!name) throw new Error("Business name is required");
  return {
    name,
    timezone: tz,
    description: str(form, "description"),
    service_area: str(form, "service_area"),
    goal: str(form, "goal") === "phone" ? "phone" : "in_home",
    ai_instructions: str(form, "ai_instructions"),
    opening_message: str(form, "opening_message"),
    owner_notify_phone: notifyPhone,
  };
}

export async function createMerchant(form: FormData) {
  await requireAdmin();
  let id: string;
  try {
    const { data, error } = await db().from("merchants").insert(merchantFields(form)).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id;
  } catch (e) {
    return fail("/admin/merchants/new", errText(e));
  }
  redirect(`${base(id)}/phone`);
}

export async function updateMerchant(id: string, form: FormData) {
  await requireAdmin();
  try {
    const { error } = await db()
      .from("merchants")
      .update({ ...merchantFields(form), active: form.get("active") === "on" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } catch (e) {
    fail(base(id), errText(e));
  }
  revalidatePath(base(id), "layout");
  redirect(`${base(id)}?saved=1`);
}

export async function updateWidget(id: string, form: FormData) {
  await requireAdmin();
  const color = str(form, "widget_color");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail(`${base(id)}/widget`, "Color must be a hex value like #2563eb");
  await db()
    .from("merchants")
    .update({ widget_color: color, widget_greeting: str(form, "widget_greeting") })
    .eq("id", id);
  redirect(`${base(id)}/widget?saved=1`);
}

// ---------- phone numbers ----------

export async function buyNumber(id: string, form: FormData) {
  await requireAdmin();
  const merchant = await getMerchant(id);
  if (!merchant) fail("/admin", "Business not found");
  if (merchant!.twilio_number) fail(`${base(id)}/phone`, "This business already has a number. Release it first.");
  try {
    const sid = str(form, "sid");
    const n = sid
      ? await claimOwnedNumber(sid, merchant!.name)
      : await purchaseNumber(str(form, "phoneNumber"), merchant!.name);
    const { error } = await db()
      .from("merchants")
      .update({ twilio_number: n.phoneNumber, twilio_number_sid: n.sid })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } catch (e) {
    fail(`${base(id)}/phone`, errText(e));
  }
  redirect(`${base(id)}/phone?saved=1`);
}

/** Detaches the number from this business. The number stays in the Twilio subaccount. */
export async function unassignNumber(id: string) {
  await requireAdmin();
  const merchant = await getMerchant(id);
  if (merchant?.twilio_number_sid) {
    try {
      await twilioClient().incomingPhoneNumbers(merchant.twilio_number_sid).update({ smsUrl: "" });
    } catch (e) {
      console.error("could not clear smsUrl", e);
    }
  }
  await db().from("merchants").update({ twilio_number: null, twilio_number_sid: null }).eq("id", id);
  redirect(`${base(id)}/phone`);
}

// ---------- calendar ----------

export async function connectCalendar(id: string, form: FormData) {
  await requireAdmin();
  const key = str(form, "api_key");
  if (!key) fail(`${base(id)}/calendar`, "API key is required");
  try {
    await providerFor(key).listEventTypes(); // validates the key
  } catch (e) {
    fail(`${base(id)}/calendar`, `Could not connect: ${errText(e)}`);
  }
  await db()
    .from("merchants")
    .update({
      calendar_api_key: key,
      calendar_event_type_id: null,
      calendar_event_type_name: null,
    })
    .eq("id", id);
  redirect(`${base(id)}/calendar`);
}

export async function selectEventType(id: string, form: FormData) {
  await requireAdmin();
  const [eventId, ...name] = str(form, "event_type").split("|");
  if (!eventId) fail(`${base(id)}/calendar`, "Pick an event type");
  await db()
    .from("merchants")
    .update({ calendar_event_type_id: eventId, calendar_event_type_name: name.join("|") })
    .eq("id", id);
  redirect(`${base(id)}/calendar?saved=1`);
}

export async function disconnectCalendar(id: string) {
  await requireAdmin();
  await db()
    .from("merchants")
    .update({
      calendar_api_key: null,
      calendar_event_type_id: null,
      calendar_event_type_name: null,
    })
    .eq("id", id);
  redirect(`${base(id)}/calendar`);
}

// ---------- FAQs & qualifying questions ----------

export async function saveFaq(merchantId: string, form: FormData) {
  await requireAdmin();
  const row = { question: str(form, "question"), answer: str(form, "answer") };
  if (!row.question || !row.answer) fail(`${base(merchantId)}/faqs`, "Question and answer are both required");
  const faqId = str(form, "id");
  if (faqId) await db().from("faqs").update(row).eq("id", faqId).eq("merchant_id", merchantId);
  else await db().from("faqs").insert({ ...row, merchant_id: merchantId, position: Math.floor(Date.now() / 1000) });
  revalidatePath(`${base(merchantId)}/faqs`);
}

export async function deleteFaq(merchantId: string, faqId: string) {
  await requireAdmin();
  await db().from("faqs").delete().eq("id", faqId).eq("merchant_id", merchantId);
  revalidatePath(`${base(merchantId)}/faqs`);
}

export async function saveQuestion(merchantId: string, form: FormData) {
  await requireAdmin();
  const row = {
    question: str(form, "question"),
    guidance: str(form, "guidance"),
    required: form.get("required") === "on",
  };
  if (!row.question) fail(`${base(merchantId)}/questions`, "Question is required");
  const qid = str(form, "id");
  if (qid) await db().from("qualifying_questions").update(row).eq("id", qid).eq("merchant_id", merchantId);
  else
    await db()
      .from("qualifying_questions")
      .insert({ ...row, merchant_id: merchantId, position: Math.floor(Date.now() / 1000) });
  revalidatePath(`${base(merchantId)}/questions`);
}

export async function deleteQuestion(merchantId: string, questionId: string) {
  await requireAdmin();
  await db().from("qualifying_questions").delete().eq("id", questionId).eq("merchant_id", merchantId);
  revalidatePath(`${base(merchantId)}/questions`);
}

// ---------- webhook secret ----------

export async function rotateWebhookSecret(id: string) {
  await requireAdmin();
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  await db().from("merchants").update({ webhook_secret: secret }).eq("id", id);
  redirect(`${base(id)}/zapier`);
}

// ---------- conversations ----------

export async function setConversationStatus(merchantId: string, conversationId: string, status: "open" | "handoff") {
  await requireAdmin();
  await db().from("conversations").update({ status }).eq("id", conversationId).eq("merchant_id", merchantId);
  revalidatePath(`${base(merchantId)}/conversations/${conversationId}`);
}

// ---------- test chat ----------

export type TestTurn = {
  conversationId: string;
  reply: string;
  trace: TraceEntry[];
  collected: Collected;
  status: string;
};

export async function sendTestMessage(
  merchantId: string,
  conversationId: string | null,
  text: string,
): Promise<TestTurn> {
  await requireAdmin();
  const merchant = await getMerchant(merchantId);
  if (!merchant) throw new Error("Business not found");
  let conversation: Conversation | null = null;
  if (conversationId) {
    const { data } = await db()
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("merchant_id", merchantId)
      .eq("channel", "test")
      .maybeSingle();
    conversation = data as Conversation | null;
  }
  conversation ??= await createConversation({ merchant_id: merchantId, channel: "test" });
  const r = await runTurn({ merchant, conversation, userText: text.slice(0, 1600) });
  return {
    conversationId: conversation.id,
    reply: r.reply,
    trace: r.trace,
    collected: r.conversation.collected,
    status: r.conversation.status,
  };
}
