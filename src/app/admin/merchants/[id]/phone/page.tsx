import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { ConfirmSubmit } from "@/components/ui";
import { getMerchant } from "@/lib/leads";
import { db } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import { listOwnedNumbers, searchAvailableNumbers, smsWebhookUrl } from "@/lib/twilio";
import { buyNumber, unassignNumber } from "../../../actions";

export default async function Phone({ params, searchParams }: PageProps<"/admin/merchants/[id]/phone">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const merchant = await getMerchant(id);
  if (!merchant) notFound();

  if (merchant.twilio_number)
    return (
      <>
        <Notice params={sp} />
        <div className="card space-y-3">
          <p className="text-sm text-slate-600">Assigned number</p>
          <p className="text-2xl font-semibold">{merchant.twilio_number}</p>
          <p className="text-sm text-slate-600">
            Incoming texts are sent to <code className="font-mono text-xs">{smsWebhookUrl()}</code>.
          </p>
          <form action={unassignNumber.bind(null, id)}>
            <ConfirmSubmit message="Unassign this number? The AI will stop texting for this business. The number stays in your Twilio account.">
              Unassign number
            </ConfirmSubmit>
          </form>
        </div>
      </>
    );

  const area = typeof sp.area === "string" && /^\d{3}$/.test(sp.area) ? sp.area : null;
  let twilioError: string | null = null;
  let available: Awaited<ReturnType<typeof searchAvailableNumbers>> = [];
  let unassigned: Awaited<ReturnType<typeof listOwnedNumbers>> = [];
  try {
    const [owned, taken] = await Promise.all([
      listOwnedNumbers(),
      db().from("merchants").select("twilio_number").not("twilio_number", "is", null),
    ]);
    const used = new Set((taken.data ?? []).map((r) => r.twilio_number));
    unassigned = owned.filter((n) => !used.has(n.phoneNumber));
    if (area) available = await searchAvailableNumbers(area);
  } catch (e) {
    twilioError = e instanceof Error ? e.message : "Twilio request failed";
  }

  return (
    <div className="space-y-6">
      <Notice params={sp} />
      {twilioError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Twilio: {twilioError}</p>
      )}
      <section className="card">
        <h2 className="mb-3 font-semibold">Buy a new local number</h2>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="area">Area code</label>
            <input className="input w-28" id="area" name="area" inputMode="numeric" pattern="\d{3}" required defaultValue={area ?? ""} />
          </div>
          <button className="btn-secondary">Search</button>
        </form>
        {area && !twilioError && available.length === 0 && (
          <p className="mt-4 text-sm text-slate-600">No SMS-capable numbers found in {area}. Try a nearby area code.</p>
        )}
        <ul className="mt-4 divide-y divide-slate-200">
          {available.map((n) => (
            <li key={n.phoneNumber} className="flex items-center justify-between py-2 text-sm">
              <span><b>{n.phoneNumber}</b> <span className="text-slate-500">{n.locality}, {n.region}</span></span>
              <form action={buyNumber.bind(null, id)}>
                <input type="hidden" name="phoneNumber" value={n.phoneNumber} />
                <ConfirmSubmit className="btn" message={`Buy ${n.phoneNumber}? Twilio will bill your account monthly for it.`}>
                  Buy &amp; assign
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      </section>
      {unassigned.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Or use a number already in the Twilio account</h2>
          <ul className="divide-y divide-slate-200">
            {unassigned.map((n) => (
              <li key={n.sid} className="flex items-center justify-between py-2 text-sm">
                <span><b>{n.phoneNumber}</b> <span className="text-slate-500">{n.friendlyName}</span></span>
                <form action={buyNumber.bind(null, id)}>
                  <input type="hidden" name="sid" value={n.sid} />
                  <ConfirmSubmit className="btn-secondary" message={`Assign ${n.phoneNumber}? Its SMS webhook will be pointed at this app.`}>
                    Assign
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-slate-500">
        US carriers require A2P 10DLC registration before a local number can text leads. Register the brand and campaign in
        Twilio; if TWILIO_MESSAGING_SERVICE_SID is set, new numbers are added to that messaging service automatically.
      </p>
    </div>
  );
}
