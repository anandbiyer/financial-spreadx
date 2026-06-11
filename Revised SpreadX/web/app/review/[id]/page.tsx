import { notFound } from "next/navigation";
import { ReviewWorkbench } from "@/components/ReviewWorkbench";
import {
  getCoaOptions,
  getDocument,
  getDocumentPdfPath,
  getNotes,
  getWorkbenchRows,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();
  return (
    <ReviewWorkbench
      doc={doc}
      rows={getWorkbenchRows(id)}
      notes={getNotes(id)}
      coaOptions={getCoaOptions()}
      hasPdf={!!getDocumentPdfPath(id)}
    />
  );
}
