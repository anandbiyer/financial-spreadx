interface StatCardProps {
  label: string;
  value: number | string;
  subLabel?: string;
  valueColor?: string;
}

export function StatCard({ label, value, subLabel, valueColor }: StatCardProps) {
  return (
    <div className="rounded-[7px] bg-[#f4f3f0] px-3 py-[10px]">
      <div className="mb-0.5 text-[9px] font-medium uppercase tracking-[0.05em] text-[#8a8880]">
        {label}
      </div>
      <div
        className="text-[19px] font-medium leading-none"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      {subLabel && (
        <div className="mt-0.5 text-[9.5px] text-[#8a8880]">{subLabel}</div>
      )}
    </div>
  );
}
