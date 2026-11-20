import "server-only";
import { db } from "./supabase/admin";
import type { Conversation, Merchant } from "./types";
import { normalizePhone } from "./util";

const pick = (o: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if ((typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim();
  }
  return null;
};

const KNOWN = new Set([
  "name", "full_name", "first_name", "last_name", "phone", "phone_number", "mobile", "email",
  "address", "street", "city", "state", "zip", "postal_code", "source", "notes", "message", "secret",
]);

/** Maps a Zapier payload to lead columns. Unrecognized fields are kept in `raw` for the AI. */
export function parseLeadPayload(body: Record<string, unknown>) {
  const first = pick(body, "first_name");
  const last = pick(body, "last_name");
  const name = pick(body, "name", "full_name") ?? ([first, last].filter(Boolean).join(" ") || null);
  const street = pick(body, "address", "street");
  const rest = [pick(body, "city"), pick(body, "state"), pick(body, "zip", "postal_code")].filter(Boolean).join(", ");
  const address = [street, rest].filter(Boolean).join(", ") || null;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!KNOWN.has(k) && v !== "" && v != null) raw[k] = v;
  return {
    name,
    phone: normalizePhone(pick(body, "phone", "phone_number", "mobile")),
    email: pick(body, "email"),
    address,
    source: pick(body, "source"),
    notes: pick(body, "notes", "message"),
    raw,
  };
}

export async function getMerchant(id: string): Promise<Merchant | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from("merchants").select("*").eq("id", id).maybeSingle();
  return data as Merchant | null;
}

export async function createConversation(row: Partial<Conversation>): Promise<Conversation> {
  const { data, error } = await db().from("conversations").insert(row).select("*").single();
  if (error) throw error;
  return data as Conversation;
}
