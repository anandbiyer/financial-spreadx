interface HealthBarProps {
  value: number; // 0–100
}

function barColor(v: number) {
  if (v >= 90) return '#15803d';
  if (v >= 60) return '#b45309';
  return '#b91c1c';
}

export function HealthBar({ value }: HealthBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="inline-block rounded-[2px] overflow-hidden align-middle"
      style={{ width: 46, height: 4, background: '#e4e2dc' }}
    >
      <div
        data-testid="health-bar-fill"
        style={{
          width: `${pct}%`,
          height: '100%',
          background: barColor(pct),
          borderRadius: 2,
        }}
      />
    </div>
  );
}
