import { notFound } from "next/navigation";
import { MerchantForm } from "@/components/merchant-form";
import { Notice } from "@/components/notice";
import { getMerchant } from "@/lib/leads";
import { requireAdmin } from "@/lib/supabase/server";
import { updateMerchant } from "../../actions";

export default async function Settings({ params, searchParams }: PageProps<"/admin/merchants/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const merchant = await getMerchant(id);
  if (!merchant) notFound();
  return (
    <>
      <Notice params={await searchParams} />
      <MerchantForm merchant={merchant} action={updateMerchant.bind(null, id)} />
    </>
  );
}
