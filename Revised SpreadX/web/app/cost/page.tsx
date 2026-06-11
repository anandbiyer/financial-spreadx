import { CostView } from "@/components/CostView";
import { getUsageDetail } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function CostPage() {
  return <CostView usage={getUsageDetail()} />;
}
