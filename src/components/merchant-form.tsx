import type { Merchant } from "@/lib/types";
import { Submit } from "./ui";

const ZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
];

export function MerchantForm({
  merchant: m,
  action,
}: {
  merchant?: Merchant;
  action: (form: FormData) => Promise<void>;
}) {
  const zones = m && !ZONES.includes(m.timezone) ? [m.timezone, ...ZONES] : ZONES;
  return (
    <form action={action} className="card space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Business name</label>
          <input className="input" id="name" name="name" required defaultValue={m?.name} />
        </div>
        <div>
          <label className="label" htmlFor="timezone">Time zone</label>
          <select className="input" id="timezone" name="timezone" defaultValue={m?.timezone ?? ZONES[0]}>
            {zones.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Appointment goal</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-md border border-slate-300 p-3 text-sm has-checked:border-blue-500 has-checked:bg-blue-50">
            <input type="radio" name="goal" value="in_home" defaultChecked={(m?.goal ?? "in_home") === "in_home"} />
            <span><b>In-home consultation</b><br /><span className="text-slate-600">Collects the service address, then books a time.</span></span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-md border border-slate-300 p-3 text-sm has-checked:border-blue-500 has-checked:bg-blue-50">
            <input type="radio" name="goal" value="phone" defaultChecked={m?.goal === "phone"} />
            <span><b>Phone consultation</b><br /><span className="text-slate-600">Only needs a time. No address asked.</span></span>
          </label>
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="description">About the business</label>
        <textarea className="input" id="description" name="description" rows={3} defaultValue={m?.description}
          placeholder="What they do, what the consultation covers, how long it takes…" />
      </div>
      <div>
        <label className="label" htmlFor="service_area">Service area</label>
        <input className="input" id="service_area" name="service_area" defaultValue={m?.service_area}
          placeholder="e.g. Phoenix metro: Scottsdale, Tempe, Mesa, Chandler" />
      </div>
      <div>
        <label className="label" htmlFor="ai_instructions">Extra AI instructions (optional)</label>
        <textarea className="input" id="ai_instructions" name="ai_instructions" rows={3} defaultValue={m?.ai_instructions}
          placeholder="Tone, things to avoid, promotions to mention…" />
      </div>
      <div>
        <label className="label" htmlFor="opening_message">First text to new leads (optional)</label>
        <textarea className="input" id="opening_message" name="opening_message" rows={2} defaultValue={m?.opening_message}
          placeholder="Hi {first_name}, this is the scheduling assistant for {business}…  Reply STOP to opt out." />
        <p className="hint">Leave blank to let the AI write it from the lead&apos;s form details. Supports {"{first_name}"} and {"{business}"}.</p>
      </div>
      <div>
        <label className="label" htmlFor="owner_notify_phone">Notify this mobile number on bookings and handoffs (optional)</label>
        <input className="input sm:max-w-xs" id="owner_notify_phone" name="owner_notify_phone" type="tel" defaultValue={m?.owner_notify_phone ?? ""} />
      </div>
      {m && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={m.active} />
          Active — AI replies to leads for this business
        </label>
      )}
      <Submit>{m ? "Save changes" : "Create business"}</Submit>
    </form>
  );
}
