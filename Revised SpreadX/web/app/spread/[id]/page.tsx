import { notFound } from "next/navigation";
import { SpreadReview } from "@/components/SpreadReview";
import {
  getConfidenceRows,
  getDocument,
  getLearnedApplied,
  getSpreadTree,
  getUnmappedItems,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SpreadReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tree = getSpreadTree(id);
  const doc = getDocument(id);
  if (!tree || !doc) notFound();

  return (
    <SpreadReview
      doc={doc}
      tree={tree}
      unmapped={getUnmappedItems(id)}
      confidence={getConfidenceRows(id)}
      learned={getLearnedApplied(id)}
    />
  );
}
