import { requireEntitled } from "@/lib/auth";
import { TemplateForm } from "./TemplateForm";

export default async function TemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireEntitled();
  const saved = (await searchParams).saved === "1";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Answer template</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your saved answers drive the Guided autofill in the browser extension. Blank fields fall
        back to a sensible default. Changes sync to the extension the next time you open this site
        while signed in.
      </p>

      {saved && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Template saved.
        </div>
      )}

      <TemplateForm template={profile.answer_template} />
    </div>
  );
}
