import { notFound } from "next/navigation";
import { UnmappedResolver } from "@/components/UnmappedResolver";
import { getDocument, getUnmappedDetail } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ResolverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = getDocument(id);
  if (!doc) notFound();
  return <UnmappedResolver doc={doc} items={getUnmappedDetail(id)} />;
}
