import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { Copy, Submit } from "@/components/ui";
import { getMerchant } from "@/lib/leads";
import { requireAdmin } from "@/lib/supabase/server";
import { appUrl } from "@/lib/util";
import { updateWidget } from "../../../actions";

export default async function Widget({ params, searchParams }: PageProps<"/admin/merchants/[id]/widget">) {
  await requireAdmin();
  const { id } = await params;
  const m = await getMerchant(id);
  if (!m) notFound();
  const snippet = `<script src="${appUrl()}/widget.js" data-key="${m.widget_key}" async></script>`;
  return (
    <div className="space-y-6">
      <Notice params={await searchParams} />
      <section className="card space-y-3 text-sm">
        <h2 className="text-base font-semibold">Embed code</h2>
        <Copy text={snippet} />
        <p className="font-medium">Add it to a WordPress / Elementor site</p>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li><b>Elementor Pro, whole site:</b> Elementor → Custom Code → Add New → paste the code → Location: <i>&lt;/body&gt; – End</i> → Publish for Entire Site.</li>
          <li><b>Single page:</b> edit the page in Elementor → drag in an <b>HTML</b> widget anywhere → paste the code → Update.</li>
          <li><b>Without Elementor Pro:</b> use a header/footer plugin such as WPCode and paste it in the footer.</li>
        </ul>
        <p className="text-slate-600">A chat bubble appears bottom-right. If a caching or optimization plugin delays scripts, exclude widget.js from it.</p>
      </section>
      <form action={updateWidget.bind(null, id)} className="card space-y-4">
        <h2 className="font-semibold">Appearance</h2>
        <div>
          <label className="label" htmlFor="widget_color">Brand color</label>
          <input id="widget_color" name="widget_color" type="color" defaultValue={m.widget_color} className="h-10 w-20 cursor-pointer rounded border border-slate-300" />
        </div>
        <div>
          <label className="label" htmlFor="widget_greeting">Greeting</label>
          <input className="input" id="widget_greeting" name="widget_greeting" defaultValue={m.widget_greeting} required />
        </div>
        <Submit>Save</Submit>
      </form>
    </div>
  );
}
