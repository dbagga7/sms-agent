import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { ConfirmSubmit, Submit } from "@/components/ui";
import { providerFor, type EventType } from "@/lib/calendar";
import { getMerchant } from "@/lib/leads";
import { requireAdmin } from "@/lib/supabase/server";
import { connectCalendar, disconnectCalendar, selectEventType } from "../../../actions";

export default async function Calendar({ params, searchParams }: PageProps<"/admin/merchants/[id]/calendar">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const m = await getMerchant(id);
  if (!m) notFound();

  if (!m.calendar_api_key)
    return (
      <>
        <Notice params={sp} />
        <form action={connectCalendar.bind(null, id)} className="card space-y-4">
          <h2 className="font-semibold">Connect the customer&apos;s Cal.com account</h2>
          <div>
            <label className="label" htmlFor="api_key">Cal.com API key</label>
            <input className="input" id="api_key" name="api_key" type="password" required autoComplete="off" />
            <p className="hint">
              In the customer&apos;s Cal.com account: Settings → Developer → API keys. Connect their Google or Outlook
              calendar inside Cal.com so busy times block slots.
            </p>
          </div>
          <Submit>Connect</Submit>
        </form>
      </>
    );

  let types: EventType[] = [];
  let loadError: string | null = null;
  try {
    types = await providerFor(m.calendar_api_key).listEventTypes();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load event types";
  }
  return (
    <div className="space-y-6">
      <Notice params={sp} />
      <div className="card space-y-4">
        <p className="text-sm">
          Connected to <b>Cal.com</b> (key ending …{m.calendar_api_key.slice(-4)})
        </p>
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        <form action={selectEventType.bind(null, id)} className="space-y-3">
          <label className="label" htmlFor="event_type">Event type the AI books into</label>
          <select className="input sm:max-w-md" id="event_type" name="event_type" required
            defaultValue={m.calendar_event_type_id ? `${m.calendar_event_type_id}|${m.calendar_event_type_name}` : ""}>
            <option value="" disabled>Select an event type…</option>
            {types.map((t) => (
              <option key={t.id} value={`${t.id}|${t.name}`}>
                {t.name}{t.duration ? ` (${t.duration} min)` : ""}
              </option>
            ))}
          </select>
          <p className="hint">
            Availability and appointment length come from this event type.
            {m.goal === "in_home"
              ? " For in-home visits, set its location to “Attendee address” so the address lands on the calendar event."
              : " For phone consultations, set its location to “Attendee phone number”."}
          </p>
          <Submit>Save event type</Submit>
        </form>
      </div>
      <form action={disconnectCalendar.bind(null, id)}>
        <ConfirmSubmit message="Disconnect this calendar? The AI will hand leads to a person instead of booking.">
          Disconnect calendar
        </ConfirmSubmit>
      </form>
    </div>
  );
}
