type StatusKey = 'auto_approved' | 'reviewed' | 'needs_review' | 'rejected' |
  'ready_for_review' | 'uploaded' | 'preprocessing' | 'classifying' |
  'extracting' | 'mapping' | 'exported' | 'error';

const STATUS_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  auto_approved:   { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  reviewed:        { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  exported:        { bg: '#dcfce7', fg: '#166534', label: 'Approved' },
  needs_review:    { bg: '#fef3c7', fg: '#92400e', label: 'Needs review' },
  ready_for_review:{ bg: '#fef3c7', fg: '#92400e', label: 'Review' },
  rejected:        { bg: '#fee2e2', fg: '#991b1b', label: 'Rejected' },
  error:           { bg: '#fee2e2', fg: '#991b1b', label: 'Val. error' },
  uploaded:        { bg: '#dbeafe', fg: '#1e40af', label: 'Processing' },
  preprocessing:   { bg: '#dbeafe', fg: '#1e40af', label: 'Processing' },
  classifying:     { bg: '#dbeafe', fg: '#1e40af', label: 'Processing' },
  extracting:      { bg: '#dbeafe', fg: '#1e40af', label: 'Processing' },
  mapping:         { bg: '#dbeafe', fg: '#1e40af', label: 'Processing' },
};

interface StatusBadgeProps {
  status: string | null | undefined;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status ?? ''] ?? { bg: '#f1f0eb', fg: '#5f5e5a', label: status ?? '—' };
  return (
    <span
      className="inline-flex items-center rounded-[20px] px-1.5 py-0.5 text-[9.5px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}
