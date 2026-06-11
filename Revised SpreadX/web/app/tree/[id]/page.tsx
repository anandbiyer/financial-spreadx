import { notFound } from "next/navigation";
import { StatementTree } from "@/components/StatementTree";
import { getDocument, getExtractedRows, getNotes } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TreePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();
  return <StatementTree doc={doc} rows={getExtractedRows(id)} notes={getNotes(id)} />;
}
