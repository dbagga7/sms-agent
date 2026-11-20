import { Notice } from "@/components/notice";
import { ConfirmSubmit, Submit } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { Faq } from "@/lib/types";
import { deleteFaq, saveFaq } from "../../../actions";

export default async function Faqs({ params, searchParams }: PageProps<"/admin/merchants/[id]/faqs">) {
  await requireAdmin();
  const { id } = await params;
  const { data } = await db().from("faqs").select("*").eq("merchant_id", id).order("position").order("created_at");
  const faqs = (data ?? []) as Faq[];
  return (
    <div className="space-y-4">
      <Notice params={await searchParams} />
      <p className="text-sm text-slate-600">
        The AI answers lead questions only from these. Anything not covered here gets &ldquo;the team will confirm that
        during your consultation.&rdquo;
      </p>
      {faqs.map((f) => (
        <div key={f.id} className="card">
          <form action={saveFaq.bind(null, id)} className="space-y-3">
            <input type="hidden" name="id" value={f.id} />
            <input className="input font-medium" name="question" defaultValue={f.question} aria-label="Question" required />
            <textarea className="input" name="answer" rows={2} defaultValue={f.answer} aria-label="Answer" required />
            <Submit className="btn-secondary">Save</Submit>
          </form>
          <form action={deleteFaq.bind(null, id, f.id)} className="mt-2">
            <ConfirmSubmit message="Delete this FAQ?">Delete</ConfirmSubmit>
          </form>
        </div>
      ))}
      <form action={saveFaq.bind(null, id)} className="card space-y-3 border-dashed">
        <h2 className="font-semibold">Add an FAQ</h2>
        <input className="input" name="question" placeholder="Do you offer free estimates?" aria-label="Question" required />
        <textarea className="input" name="answer" rows={2} placeholder="Yes — the in-home consultation and estimate are free." aria-label="Answer" required />
        <Submit>Add FAQ</Submit>
      </form>
    </div>
  );
}
