import { notFound } from "next/navigation";
import { ValidationView } from "@/components/ValidationView";
import { getDocument, getValidation } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = getDocument(id);
  const v = getValidation(id);
  if (!doc || !v) notFound();
  return <ValidationView doc={doc} initial={v} />;
}
