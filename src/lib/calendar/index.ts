import "server-only";
import type { Merchant } from "../types";
import { CalCom } from "./calcom";
import { Calendly } from "./calendly";
import type { CalendarProvider } from "./types";

export function providerFor(kind: "calendly" | "calcom", apiKey: string): CalendarProvider {
  return kind === "calendly" ? new Calendly(apiKey) : new CalCom(apiKey);
}

/** The merchant's connected calendar, or null if setup isn't finished. */
export function calendarFor(m: Merchant): CalendarProvider | null {
  if (!m.calendar_provider || !m.calendar_api_key || !m.calendar_event_type_id) return null;
  return providerFor(m.calendar_provider, m.calendar_api_key);
}

export * from "./types";
