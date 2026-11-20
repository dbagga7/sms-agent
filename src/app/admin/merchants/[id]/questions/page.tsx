import { Notice } from "@/components/notice";
import { ConfirmSubmit, Submit } from "@/components/ui";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { QualifyingQuestion } from "@/lib/types";
import { deleteQuestion, saveQuestion } from "../../../actions";

export default async function Questions({ params, searchParams }: PageProps<"/admin/merchants/[id]/questions">) {
  await requireAdmin();
  const { id } = await params;
  const { data } = await db()
    .from("qualifying_questions")
    .select("*")
    .eq("merchant_id", id)
    .order("position")
    .order("created_at");
  const questions = (data ?? []) as QualifyingQuestion[];
  return (
    <div className="space-y-4">
      <Notice params={await searchParams} />
      <p className="text-sm text-slate-600">
        The AI asks these, one at a time and in this order, before offering appointment times. Required questions must be
        answered before it can book. Answers are saved on the conversation.
      </p>
      {questions.map((q, i) => (
        <div key={q.id} className="card">
          <form action={saveQuestion.bind(null, id)} className="space-y-3">
            <input type="hidden" name="id" value={q.id} />
            <label className="label" htmlFor={`q-${q.id}`}>Question {i + 1}</label>
            <input className="input" id={`q-${q.id}`} name="question" defaultValue={q.question} required />
            <input className="input" name="guidance" defaultValue={q.guidance} aria-label="Guidance for the AI"
              placeholder="Guidance for the AI (optional)" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="required" defaultChecked={q.required} /> Required before booking
            </label>
            <Submit className="btn-secondary">Save</Submit>
          </form>
          <form action={deleteQuestion.bind(null, id, q.id)} className="mt-2">
            <ConfirmSubmit message="Delete this question?">Delete</ConfirmSubmit>
          </form>
        </div>
      ))}
      <form action={saveQuestion.bind(null, id)} className="card space-y-3 border-dashed">
        <h2 className="font-semibold">Add a qualifying question</h2>
        <input className="input" name="question" placeholder="Do you own the home?" aria-label="Question" required />
        <input className="input" name="guidance" aria-label="Guidance for the AI"
          placeholder="Guidance (optional): e.g. If they rent, explain we need the owner present and hand off to the team." />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" defaultChecked /> Required before booking
        </label>
        <Submit>Add question</Submit>
      </form>
    </div>
  );
}
