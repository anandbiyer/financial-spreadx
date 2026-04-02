interface ConfidenceBarProps {
  value: number; // 0–1
}

function barColor(v: number) {
  if (v >= 0.9) return '#15803d';
  if (v >= 0.7) return '#b45309';
  return '#b91c1c';
}

export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="inline-block rounded-[2px] overflow-hidden"
        style={{ width: 28, height: 3, background: '#e4e2dc' }}
      >
        <div
          data-testid="confidence-bar-fill"
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor(value),
            borderRadius: 2,
          }}
        />
      </div>
      <span className="text-[9.5px] text-[#4a4844]">{Math.round(pct)}%</span>
    </div>
  );
}
