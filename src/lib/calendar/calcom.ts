import { CalendarError, type BookingInput, type CalendarProvider, type EventType } from "./types";

const BASE = "https://api.cal.com/v2";

export class CalCom implements CalendarProvider {
  constructor(private apiKey: string) {}

  private async call<T>(path: string, version: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "cal-api-version": version,
        "Content-Type": "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) throw new CalendarError(`Cal.com ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async listEventTypes(): Promise<EventType[]> {
    const r = await this.call<{ data: { id: number; title: string; lengthInMinutes?: number }[] }>(
      "/event-types",
      "2024-06-14",
    );
    return (r.data ?? []).map((e) => ({ id: String(e.id), name: e.title, duration: e.lengthInMinutes ?? null }));
  }

  async getSlots(eventTypeId: string, start: string, end: string, timeZone: string): Promise<string[]> {
    const q = new URLSearchParams({ eventTypeId, start, end, timeZone });
    const r = await this.call<{ data: Record<string, { start: string }[]> }>(`/slots?${q}`, "2024-09-04");
    return Object.values(r.data ?? {})
      .flat()
      .map((s) => new Date(s.start).toISOString())
      .sort();
  }

  async book(input: BookingInput): Promise<{ id: string }> {
    const base = {
      start: input.start,
      eventTypeId: Number(input.eventTypeId),
      attendee: {
        name: input.name,
        email: input.email,
        timeZone: input.timeZone,
        ...(input.phone ? { phoneNumber: input.phone } : {}),
      },
      metadata: {
        source: "leadbooker",
        ...(input.address ? { address: input.address.slice(0, 500) } : {}),
      },
    };
    // The location must be one the event type is configured with. Try the one that fits
    // the appointment; if Cal.com rejects it, book with the event type's default location.
    const location = input.address
      ? { type: "attendeeAddress", address: input.address }
      : input.phone
        ? { type: "attendeePhone", phone: input.phone }
        : null;
    type Res = { data: { uid: string } };
    const post = (body: unknown) =>
      this.call<Res>("/bookings", "2024-08-13", { method: "POST", body: JSON.stringify(body) });
    if (location) {
      try {
        return { id: (await post({ ...base, location })).data.uid };
      } catch (e) {
        if (!(e instanceof CalendarError) || !/Cal\.com 400/.test(e.message) || !/location/i.test(e.message)) throw e;
      }
    }
    return { id: (await post(base)).data.uid };
  }
}
