import { notFound } from "next/navigation";
import { CompareResolve } from "@/components/CompareResolve";
import { getDocument, getDocumentPdfPath, getSpreadTree, getUnmappedDetail } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = getDocument(id);
  const tree = getSpreadTree(id);
  if (!doc || !tree) notFound();
  return (
    <CompareResolve
      doc={doc}
      tree={tree}
      unmapped={getUnmappedDetail(id)}
      hasPdf={!!getDocumentPdfPath(id)}
    />
  );
}
