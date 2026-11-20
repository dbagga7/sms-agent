import Link from "next/link";
import { notFound } from "next/navigation";
import { Submit } from "@/components/ui";
import { getMerchant } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { Conversation, Message, QualifyingQuestion } from "@/lib/types";
import { formatSlot } from "@/lib/util";
import { setConversationStatus } from "../../../../actions";

export default async function ConversationPage({ params }: PageProps<"/admin/merchants/[id]/conversations/[cid]">) {
  await requireAdmin();
  const { id, cid } = await params;
  const merchant = await getMerchant(id);
  if (!merchant || !/^[0-9a-f-]{36}$/i.test(cid)) notFound();
  const [conv, msgs, qs, appts] = await Promise.all([
    db().from("conversations").select("*").eq("id", cid).eq("merchant_id", id).maybeSingle(),
    db().from("messages").select("*").eq("conversation_id", cid).order("created_at"),
    db().from("qualifying_questions").select("id, question").eq("merchant_id", id),
    db().from("appointments").select("start_time, address").eq("conversation_id", cid).order("created_at", { ascending: false }).limit(1),
  ]);
  const c = conv.data as Conversation | null;
  if (!c) notFound();
  const labels = Object.fromEntries(((qs.data ?? []) as Pick<QualifyingQuestion, "id" | "question">[]).map((q) => [q.id, q.question]));
  const appt = appts.data?.[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="card space-y-3 bg-slate-50">
        <Link href={`/admin/merchants/${id}/conversations`} className="text-sm text-slate-500 hover:text-slate-800">← Conversations</Link>
        {((msgs.data ?? []) as Message[]).map((m) => (
          <div key={m.id} className={m.role === "user" ? "" : "flex justify-end"}>
            <div className="max-w-[85%]">
              <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "border border-slate-200 bg-white" : "bg-blue-600 text-white"}`}>
                {m.content}
              </div>
              <time className="mt-0.5 block text-xs text-slate-400">
                {m.role === "user" ? "Lead" : "AI"} · {formatSlot(m.created_at, merchant.timezone)}
              </time>
            </div>
          </div>
        ))}
      </section>
      <aside className="card space-y-3 text-sm">
        <p>Status: <b>{c.status}</b></p>
        {appt && (
          <p className="rounded-md bg-green-50 p-2 text-green-800">
            Booked: {formatSlot(appt.start_time, merchant.timezone)}{appt.address ? ` at ${appt.address}` : ""}
          </p>
        )}
        <dl className="space-y-2">
          {(["name", "phone", "email", "address"] as const).map((k) => (
            <div key={k}><dt className="text-xs text-slate-500 capitalize">{k}</dt><dd>{c.collected[k] ?? "—"}</dd></div>
          ))}
          {Object.entries(c.collected.answers ?? {}).map(([qid, a]) => (
            <div key={qid}><dt className="text-xs text-slate-500">{labels[qid] ?? "Question"}</dt><dd>{a}</dd></div>
          ))}
        </dl>
        {c.status === "open" && (
          <form action={setConversationStatus.bind(null, id, cid, "handoff")}>
            <Submit className="btn-secondary">Pause AI (take over)</Submit>
          </form>
        )}
        {(c.status === "handoff" || c.status === "closed") && (
          <form action={setConversationStatus.bind(null, id, cid, "open")}>
            <Submit className="btn-secondary">Resume AI</Submit>
          </form>
        )}
      </aside>
    </div>
  );
}
