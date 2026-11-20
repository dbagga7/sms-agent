import Link from "next/link";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import type { Merchant } from "@/lib/types";

export default async function Merchants() {
  await requireAdmin();
  const { data, error } = await db().from("merchants").select("*").order("created_at", { ascending: false });
  const merchants = (data ?? []) as Merchant[];
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <Link href="/admin/merchants/new" className="btn">Onboard a business</Link>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">Could not load businesses: {error.message}</p>}
      {merchants.length === 0 && !error ? (
        <div className="card text-sm text-slate-600">No businesses yet. Onboard your first one to get started.</div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {merchants.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/merchants/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 hover:bg-slate-50">
                <span>
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-sm text-slate-500">{m.goal === "in_home" ? "In-home" : "Phone"} consultations</span>
                </span>
                <span className="flex flex-wrap gap-2 text-xs">
                  <Badge ok={!!m.twilio_number}>{m.twilio_number ?? "No number"}</Badge>
                  <Badge ok={!!m.calendar_event_type_id}>{m.calendar_event_type_id ? "Calendar connected" : "No calendar"}</Badge>
                  {!m.active && <Badge ok={false}>Paused</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
      {children}
    </span>
  );
}
