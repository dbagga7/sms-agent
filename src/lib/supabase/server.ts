import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Cookie-bound client, used only to identify the logged-in staff member. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component; the proxy refreshes cookies instead.
          }
        },
      },
    },
  );
}

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Staff are people who signed in with Google and whose address is in
 * ADMIN_EMAIL_DOMAINS (e.g. "taplocalnow.com") or listed in ADMIN_EMAILS.
 * Fails closed: with neither variable set, nobody gets in.
 */
export function isAllowedAdmin(user: User | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  if (!user || !email) return false;
  // Only trust the address when Google vouched for it, never a self-declared email signup.
  const providers: unknown = user.app_metadata?.providers;
  if (!Array.isArray(providers) || !providers.includes("google")) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return list(process.env.ADMIN_EMAIL_DOMAINS).includes(domain) || list(process.env.ADMIN_EMAILS).includes(email);
}

/** Call at the top of every admin page and server action. */
export async function requireAdmin() {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !isAllowedAdmin(data.user)) redirect("/login");
  return data.user;
}
