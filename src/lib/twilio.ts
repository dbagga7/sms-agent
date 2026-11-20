import "server-only";
import twilio from "twilio";
import { appUrl } from "./util";

export function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set");
  return twilio(sid, token);
}

export const smsWebhookUrl = () => `${appUrl()}/api/twilio/sms`;

export async function sendSms(from: string, to: string, body: string) {
  return twilioClient().messages.create({ from, to, body });
}

export function validateTwilioSignature(signature: string | null, params: Record<string, string>): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  return twilio.validateRequest(token, signature, smsWebhookUrl(), params);
}

export async function searchAvailableNumbers(areaCode: string) {
  const list = await twilioClient()
    .availablePhoneNumbers("US")
    .local.list({ areaCode: Number(areaCode), smsEnabled: true, limit: 10 });
  return list.map((n) => ({ phoneNumber: n.phoneNumber, locality: n.locality, region: n.region }));
}

/** Numbers already owned by the subaccount. */
export async function listOwnedNumbers() {
  const list = await twilioClient().incomingPhoneNumbers.list({ limit: 200 });
  return list.map((n) => ({ sid: n.sid, phoneNumber: n.phoneNumber, friendlyName: n.friendlyName }));
}

async function attachToMessagingService(numberSid: string) {
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!service) return;
  try {
    await twilioClient().messaging.v1.services(service).phoneNumbers.create({ phoneNumberSid: numberSid });
  } catch (e) {
    // 21710 = already in the service. Anything else is worth seeing in logs.
    if ((e as { code?: number }).code !== 21710) console.error("messaging service attach failed", e);
  }
}

export async function purchaseNumber(phoneNumber: string, friendlyName: string) {
  const n = await twilioClient().incomingPhoneNumbers.create({
    phoneNumber,
    friendlyName,
    smsUrl: smsWebhookUrl(),
    smsMethod: "POST",
  });
  await attachToMessagingService(n.sid);
  return { sid: n.sid, phoneNumber: n.phoneNumber };
}

export async function claimOwnedNumber(sid: string, friendlyName: string) {
  const n = await twilioClient()
    .incomingPhoneNumbers(sid)
    .update({ friendlyName, smsUrl: smsWebhookUrl(), smsMethod: "POST" });
  await attachToMessagingService(n.sid);
  return { sid: n.sid, phoneNumber: n.phoneNumber };
}
