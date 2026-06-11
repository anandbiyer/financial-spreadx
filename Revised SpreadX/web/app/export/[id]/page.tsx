import { notFound } from "next/navigation";
import { ExportCentre } from "@/components/ExportCentre";
import { getDocument } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();
  return <ExportCentre doc={doc} />;
}
