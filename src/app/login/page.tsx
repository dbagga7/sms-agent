import { Submit } from "@/components/ui";
import { signInWithGoogle } from "../admin/actions";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">LeadBooker</h1>
      <form action={signInWithGoogle} className="card space-y-4">
        <p className="text-sm text-slate-600">Sign in with your company Google account.</p>
        {typeof error === "string" && <p className="text-sm text-red-600">{error}</p>}
        <Submit className="btn w-full">Continue with Google</Submit>
      </form>
    </main>
  );
}
