import "server-only";
import { createServerClient } from "@supabase/ssr";
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

export function isAllowedAdmin(email: string | undefined | null): boolean {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // Fail closed: with no allowlist configured, nobody gets in.
  return !!email && allow.includes(email.toLowerCase());
}

/** Call at the top of every admin page and server action. */
export async function requireAdmin() {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !isAllowedAdmin(data.user.email)) redirect("/login");
  return data.user;
}
