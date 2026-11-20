export type EventType = { id: string; name: string; duration: number | null };

export type BookingInput = {
  eventTypeId: string;
  start: string; // ISO UTC
  name: string;
  email: string;
  phone?: string;
  timeZone: string;
  address?: string;
  notes?: string;
};

export interface CalendarProvider {
  listEventTypes(): Promise<EventType[]>;
  /** ISO start times of open slots between start and end (ISO). */
  getSlots(eventTypeId: string, start: string, end: string, timeZone: string): Promise<string[]>;
  book(input: BookingInput): Promise<{ id: string }>;
}

export class CalendarError extends Error {}
