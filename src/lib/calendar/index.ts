import "server-only";
import type { Merchant } from "../types";
import { CalCom } from "./calcom";
import type { CalendarProvider } from "./types";

export function providerFor(apiKey: string): CalendarProvider {
  return new CalCom(apiKey);
}

/** The merchant's connected Cal.com calendar, or null if setup isn't finished. */
export function calendarFor(m: Merchant): CalendarProvider | null {
  if (!m.calendar_api_key || !m.calendar_event_type_id) return null;
  return providerFor(m.calendar_api_key);
}

export * from "./types";
