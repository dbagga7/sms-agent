import { CalendarError, type BookingInput, type CalendarProvider, type EventType } from "./types";

const BASE = "https://api.calendly.com";
const DAY = 86_400_000;

export class Calendly implements CalendarProvider {
  constructor(private token: string) {}

  private async call<T>(pathOrUrl: string, init?: RequestInit): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
    });
    const text = await res.text();
    if (!res.ok) throw new CalendarError(`Calendly ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async listEventTypes(): Promise<EventType[]> {
    const me = await this.call<{ resource: { uri: string } }>("/users/me");
    const q = new URLSearchParams({ user: me.resource.uri, active: "true", count: "100" });
    const r = await this.call<{ collection: { uri: string; name: string; duration?: number }[] }>(
      `/event_types?${q}`,
    );
    return r.collection.map((e) => ({ id: e.uri, name: e.name, duration: e.duration ?? null }));
  }

  async getSlots(eventTypeUri: string, start: string, end: string): Promise<string[]> {
    // Query in 7-day windows, which every version of the endpoint accepts.
    const out: string[] = [];
    let from = Math.max(new Date(start).getTime(), Date.now() + 60_000);
    const until = new Date(end).getTime();
    while (from < until) {
      const to = Math.min(from + 7 * DAY, until);
      const q = new URLSearchParams({
        event_type: eventTypeUri,
        start_time: new Date(from).toISOString(),
        end_time: new Date(to).toISOString(),
      });
      const r = await this.call<{ collection: { status: string; start_time: string }[] }>(
        `/event_type_available_times?${q}`,
      );
      for (const s of r.collection) if (s.status === "available") out.push(new Date(s.start_time).toISOString());
      from = to;
    }
    return out.sort();
  }

  async book(input: BookingInput): Promise<{ id: string }> {
    // The location kind sent must be one configured on the event type, so read it first.
    let kinds: string[] = [];
    try {
      const et = await this.call<{ resource: { locations?: { kind: string }[] | null } }>(input.eventTypeId);
      kinds = (et.resource.locations ?? []).map((l) => l.kind);
    } catch {
      // Fall through and book without a location.
    }
    let location: Record<string, string> | undefined;
    if (input.address && kinds.includes("ask_invitee")) location = { kind: "ask_invitee", location: input.address };
    else if (input.phone && kinds.includes("outbound_call")) location = { kind: "outbound_call", location: input.phone };
    else if (kinds.length === 1 && !["ask_invitee", "outbound_call"].includes(kinds[0])) location = { kind: kinds[0] };

    const r = await this.call<{ resource: { uri: string } }>("/invitees", {
      method: "POST",
      body: JSON.stringify({
        event_type: input.eventTypeId,
        start_time: input.start,
        invitee: { name: input.name, email: input.email, timezone: input.timeZone },
        ...(location ? { location } : {}),
      }),
    });
    return { id: r.resource.uri };
  }
}
