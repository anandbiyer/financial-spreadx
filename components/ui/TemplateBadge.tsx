const TEMPLATE_COLORS: Record<string, { bg: string; fg: string }> = {
  T1: { bg: '#dbeafe', fg: '#1e40af' },
  T2: { bg: '#dbeafe', fg: '#1e40af' },
  T3: { bg: '#ede9fe', fg: '#4c1d95' },
  T4: { bg: '#ede9fe', fg: '#4c1d95' },
  T5: { bg: '#ccfbf1', fg: '#134e4a' },
  T6: { bg: '#fef3c7', fg: '#92400e' },
  T7: { bg: '#ffedd5', fg: '#9a3412' },
  T8: { bg: '#ccfbf1', fg: '#134e4a' },
};

interface TemplateBadgeProps {
  templateType: string | null | undefined;
}

export function TemplateBadge({ templateType }: TemplateBadgeProps) {
  const label = templateType ?? '—';
  const colors = TEMPLATE_COLORS[label] ?? { bg: '#f1f0eb', fg: '#5f5e5a' };
  return (
    <span
      className="inline-flex items-center rounded-[20px] px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ background: colors.bg, color: colors.fg }}
    >
      {label}
    </span>
  );
}
