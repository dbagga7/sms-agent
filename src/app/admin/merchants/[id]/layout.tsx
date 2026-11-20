import Link from "next/link";
import { notFound } from "next/navigation";
import { Tabs } from "@/components/ui";
import { getMerchant } from "@/lib/leads";
import { requireAdmin } from "@/lib/supabase/server";

const TABS = [
  { href: "", label: "Settings" },
  { href: "/phone", label: "Phone number" },
  { href: "/calendar", label: "Calendar" },
  { href: "/faqs", label: "FAQs" },
  { href: "/questions", label: "Qualifying questions" },
  { href: "/zapier", label: "Zapier" },
  { href: "/widget", label: "Website chat" },
  { href: "/test", label: "Test" },
  { href: "/conversations", label: "Conversations" },
];

export default async function MerchantLayout({ children, params }: LayoutProps<"/admin/merchants/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const merchant = await getMerchant(id);
  if (!merchant) notFound();
  return (
    <>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800">← All businesses</Link>
      <h1 className="mt-1 mb-4 text-2xl font-semibold">{merchant.name}</h1>
      <Tabs base={`/admin/merchants/${id}`} tabs={TABS} />
      {children}
    </>
  );
}
