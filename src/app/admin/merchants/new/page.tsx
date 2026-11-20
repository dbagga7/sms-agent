import { MerchantForm } from "@/components/merchant-form";
import { Notice } from "@/components/notice";
import { requireAdmin } from "@/lib/supabase/server";
import { createMerchant } from "../../actions";

export default async function NewMerchant({ searchParams }: PageProps<"/admin/merchants/new">) {
  await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Onboard a business</h1>
      <Notice params={await searchParams} />
      <MerchantForm action={createMerchant} />
    </>
  );
}
