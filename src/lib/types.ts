export type Goal = "in_home" | "phone";
export type Channel = "sms" | "web" | "test";

export type Merchant = {
  id: string;
  name: string;
  timezone: string;
  description: string;
  service_area: string;
  goal: Goal;
  ai_instructions: string;
  opening_message: string;
  owner_notify_phone: string | null;
  twilio_number: string | null;
  twilio_number_sid: string | null;
  webhook_secret: string;
  widget_key: string;
  widget_color: string;
  widget_greeting: string;
  calendar_provider: "calendly" | "calcom" | null;
  calendar_api_key: string | null;
  calendar_event_type_id: string | null;
  calendar_event_type_name: string | null;
  active: boolean;
  created_at: string;
};

export type Faq = { id: string; merchant_id: string; question: string; answer: string; position: number };

export type QualifyingQuestion = {
  id: string;
  merchant_id: string;
  question: string;
  required: boolean;
  guidance: string;
  position: number;
};

export type Collected = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  answers?: Record<string, string>;
};

export type Lead = {
  id: string;
  merchant_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string | null;
  notes: string | null;
  raw: Record<string, unknown>;
  status: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  merchant_id: string;
  lead_id: string | null;
  channel: Channel;
  session_id: string | null;
  status: "open" | "booked" | "handoff" | "closed";
  collected: Collected;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  meta: Record<string, unknown>;
  created_at: string;
};
