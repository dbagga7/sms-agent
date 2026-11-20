import { NextResponse } from "next/server";
import { authClient, isAllowedAdmin } from "@/lib/supabase/server";
import { appUrl } from "@/lib/util";

const back = (message: string) =>
  NextResponse.redirect(`${appUrl()}/login?error=${encodeURIComponent(message)}`);

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return back("Google sign-in was cancelled.");
  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return back("Google sign-in failed. Please try again.");
  if (!isAllowedAdmin(data.user)) {
    await supabase.auth.signOut();
    return back("That Google account isn't allowed. Use your company account.");
  }
  return NextResponse.redirect(`${appUrl()}/admin`);
}
