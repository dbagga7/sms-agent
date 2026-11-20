import { db } from "@/lib/supabase/admin";

const cors = { "Access-Control-Allow-Origin": "*" };

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const { data } = await db()
    .from("merchants")
    .select("name, widget_color, widget_greeting, active")
    .eq("widget_key", key)
    .maybeSingle();
  if (!data || !data.active) return Response.json({ ok: false }, { status: 404, headers: cors });
  return Response.json(
    { ok: true, name: data.name, color: data.widget_color, greeting: data.widget_greeting },
    { headers: cors },
  );
}
