import { BAND_COLOR, confBand } from "@/lib/format";

/** Confidence bar + numeric (cosmetic bands, Q18). */
export function ConfidenceBar({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const color = BAND_COLOR[confBand(value)];
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span className="cbar2">
        <span className="cbarf" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
      </span>
      <span style={{ fontSize: 10, color }}>{value.toFixed(2)}</span>
    </span>
  );
}

const SRC_CLASS: Record<string, string> = {
  claude: "sc-claude",
  learned: "sc-learned",
  manual: "sc-manual",
  auto: "sc-auto",
};
export function SourceChip({ source }: { source: string }) {
  return <span className={`src-chip ${SRC_CLASS[source] ?? "sc-claude"}`}>{source}</span>;
}

const SP: Record<string, { cls: string; label: string }> = {
  complete: { cls: "sp-complete", label: "✓ Complete" },
  has_unmapped: { cls: "sp-unmapped", label: "⚠ Unmapped" },
  processing: { cls: "sp-processing", label: "● Processing" },
  queued: { cls: "sp-processing", label: "Queued" },
  error: { cls: "sp-error", label: "Error" },
};
export function StatusPill({ status }: { status: string }) {
  const s = SP[status] ?? SP.has_unmapped;
  return <span className={`sp-status ${s.cls}`}>{s.label}</span>;
}

export function HealthBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const color = score >= 0.75 ? "#15803d" : score >= 0.5 ? "#b45309" : "#b91c1c";
  return (
    <span className="hbar" title={`${Math.round(pct)}%`}>
      <span className="hf" style={{ width: `${pct}%`, background: color }} />
    </span>
  );
}

export function ReconChip({
  pass,
  missingLeaf,
}: {
  pass: boolean | null;
  missingLeaf: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {pass === true && <span className="recon-chip rc-pass">FOOTS</span>}
      {pass === false && <span className="recon-chip rc-fail">FAIL</span>}
      {missingLeaf && <span className="recon-chip rc-missing">missing leaf</span>}
    </span>
  );
}
