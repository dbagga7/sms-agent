import { notFound } from "next/navigation";
import { getMerchant } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { QualifyingQuestion } from "@/lib/types";
import { TestChat } from "./test-chat";

export default async function Test({ params }: PageProps<"/admin/merchants/[id]/test">) {
  await requireAdmin();
  const { id } = await params;
  const m = await getMerchant(id);
  if (!m) notFound();
  const { data } = await db().from("qualifying_questions").select("id, question").eq("merchant_id", id);
  const labels = Object.fromEntries(((data ?? []) as Pick<QualifyingQuestion, "id" | "question">[]).map((q) => [q.id, q.question]));
  return (
    <TestChat
      merchantId={id}
      questionLabels={labels}
      calendarConnected={!!(m.calendar_provider && m.calendar_api_key && m.calendar_event_type_id)}
    />
  );
}
