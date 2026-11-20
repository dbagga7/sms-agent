export function Notice({ params }: { params: Record<string, string | string[] | undefined> }) {
  if (typeof params.error === "string")
    return <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>;
  if (params.saved)
    return <p className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>;
  return null;
}
