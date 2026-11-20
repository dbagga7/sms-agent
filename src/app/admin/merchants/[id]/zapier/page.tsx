import { notFound } from "next/navigation";
import { ConfirmSubmit, Copy } from "@/components/ui";
import { getMerchant } from "@/lib/leads";
import { requireAdmin } from "@/lib/supabase/server";
import { appUrl } from "@/lib/util";
import { rotateWebhookSecret } from "../../../actions";

const FIELDS: [string, string, string][] = [
  ["phone", "Required", "Lead's mobile number. Any US format works; it is converted to +1XXXXXXXXXX."],
  ["name", "Recommended", "Full name. Or send first_name and last_name separately."],
  ["email", "Recommended", "Used for the calendar confirmation. The AI asks for it if missing."],
  ["address", "In-home only", "Street address. You can also send city, state and zip as separate fields."],
  ["source", "Optional", "Where the lead came from, e.g. Facebook Lead Ad, Google LSA, Website form."],
  ["notes", "Optional", "What they asked for. The AI uses this to personalize the first text."],
  ["anything else", "Optional", "Extra fields (service, budget, timeframe…) are passed to the AI as context."],
];

export default async function Zapier({ params }: PageProps<"/admin/merchants/[id]/zapier">) {
  await requireAdmin();
  const { id } = await params;
  const m = await getMerchant(id);
  if (!m) notFound();
  const url = `${appUrl()}/api/hooks/zapier/${m.id}`;
  const sample = JSON.stringify(
    { name: "Jane Smith", phone: "(602) 555-0142", email: "jane@example.com", address: "123 Main St", city: "Phoenix", state: "AZ", zip: "85001", source: "Facebook Lead Ad", notes: "Wants a quote on replacing 8 windows" },
    null, 2,
  );
  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold">Webhook for {m.name}</h2>
        <div><p className="label">URL</p><Copy text={url} /></div>
        <div><p className="label">Secret (send as the X-Webhook-Secret header)</p><Copy text={m.webhook_secret} /></div>
        <form action={rotateWebhookSecret.bind(null, id)}>
          <ConfirmSubmit message="Generate a new secret? Existing Zaps for this business will stop working until you update them.">
            Rotate secret
          </ConfirmSubmit>
        </form>
        {!m.twilio_number && (
          <p className="text-sm text-amber-700">No phone number assigned yet — leads will be saved but not texted.</p>
        )}
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="text-base font-semibold">Zapier setup</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Create a Zap. <b>Trigger</b>: the lead source (Facebook Lead Ads, Google Ads lead form, Typeform, Gravity Forms, a CRM…).</li>
          <li><b>Action</b>: choose <b>Webhooks by Zapier</b> → event <b>POST</b>.</li>
          <li><b>URL</b>: paste the webhook URL above.</li>
          <li><b>Payload Type</b>: <b>json</b>.</li>
          <li><b>Data</b>: add one row per field below. Type the field name on the left exactly as shown, and map the matching value from the trigger on the right.</li>
          <li><b>Headers</b>: add <code className="font-mono">X-Webhook-Secret</code> with the secret above.</li>
          <li>Leave <i>Wrap Request In Array</i> and <i>Unflatten</i> on their defaults (No / Yes).</li>
          <li>Click <b>Test step</b>. A response of <code className="font-mono">{`{"ok": true}`}</code> means the lead was saved; the lead then appears under Conversations and gets the first text.</li>
        </ol>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Fields</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-1 pr-4 font-medium">Field name</th><th className="py-1 pr-4 font-medium">Needed</th><th className="py-1 font-medium">What to map</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {FIELDS.map(([name, need, desc]) => (
                <tr key={name}>
                  <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">{name}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{need}</td>
                  <td className="py-2 text-slate-600">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="label mt-4">Example payload</p>
        <code className="code">{sample}</code>
        <p className="hint">
          A lead sent twice with the same phone number within 24 hours is ignored, and anyone who replied STOP is never
          texted again.
        </p>
      </section>
    </div>
  );
}
