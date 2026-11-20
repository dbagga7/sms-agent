import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { Conversation, Lead } from "@/lib/types";

const STATUS: Record<string, string> = {
  open: "bg-slate-100 text-slate-700",
  booked: "bg-green-100 text-green-800",
  handoff: "bg-amber-100 text-amber-800",
  closed: "bg-slate-100 text-slate-500",
};

export default async function Conversations({ params }: PageProps<"/admin/merchants/[id]/conversations">) {
  await requireAdmin();
  const { id } = await params;
  const { data } = await db()
    .from("conversations")
    .select("*, leads(name, phone, source, status)")
    .eq("merchant_id", id)
    .neq("channel", "test")
    .order("updated_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as (Conversation & { leads: Pick<Lead, "name" | "phone" | "source" | "status"> | null })[];
  if (!rows.length)
    return <div className="card text-sm text-slate-600">No conversations yet. They appear here once a lead comes in from Zapier, texts the number, or uses the website chat.</div>;
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {rows.map((c) => (
        <li key={c.id}>
          <Link href={`/admin/merchants/${id}/conversations/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-slate-50">
            <span>
              <b>{c.collected.name ?? c.leads?.name ?? "Unknown lead"}</b>
              <span className="ml-2 text-slate-500">{c.collected.phone ?? c.leads?.phone ?? ""}</span>
              <span className="ml-2 text-slate-400">{c.channel === "web" ? "Website chat" : "SMS"}{c.leads?.source ? ` · ${c.leads.source}` : ""}</span>
            </span>
            <span className="flex items-center gap-3">
              {c.leads?.status === "opted_out" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">opted out</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[c.status]}`}>{c.status}</span>
              <time className="text-xs text-slate-500">{new Date(c.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
