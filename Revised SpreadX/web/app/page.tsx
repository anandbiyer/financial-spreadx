import { Topbar } from "@/components/Topbar";
import { DocumentTable } from "@/components/DocumentTable";
import { getDocuments } from "@/lib/db";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function DocumentLibraryPage() {
  const docs = getDocuments();
  const complete = docs.filter((d) => d.uiStatus === "complete").length;
  const review = docs.filter((d) => d.uiStatus === "has_unmapped").length;
  const totalCost = docs.reduce((s, d) => s + (d.costUsd ?? 0), 0);

  return (
    <div className="screen">
      <Topbar
        title="Document Library"
        subtitle={`· ${docs.length} documents · extraction + COA spreading`}
      />
      <div className="screen-body">
        <div className="stats-row stats-4">
          <div className="stat">
            <div className="sl">Documents</div>
            <div className="sn">{docs.length}</div>
            <div className="ss">latest per filename</div>
          </div>
          <div className="stat">
            <div className="sl">Spread Complete</div>
            <div className="sn" style={{ color: "var(--conf-green)" }}>{complete}</div>
            <div className="ss">CoA mapped</div>
          </div>
          <div className="stat">
            <div className="sl">Needs Review</div>
            <div className="sn" style={{ color: "var(--conf-amber)" }}>{review}</div>
            <div className="ss">has unmapped</div>
          </div>
          <div className="stat">
            <div className="sl">Est. LLM Cost</div>
            <div className="sn">{fmtMoney(totalCost)}</div>
            <div className="ss">list price</div>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="card">
            <div className="card-body placeholder-note">
              No documents yet. Seed the test corpus with{" "}
              <code>python -m scripts.seed_test_corpus</code>.
            </div>
          </div>
        ) : (
          <DocumentTable documents={docs} />
        )}
      </div>
    </div>
  );
}
