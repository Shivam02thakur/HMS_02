/**
 * Dot + tinted-text status badge. This only changes how a status is
 * *displayed* -- it maps the exact same status strings getStatusColor
 * already handles (see src/lib/utils.ts) to a kind + friendly label.
 * Nothing about the stored status values changes.
 *
 * ADMITTED and OCCUPIED are intentionally kept as danger/red: an
 * occupied bed or an admitted patient is meant to read as "in use, pay
 * attention," not as a bad outcome -- this matches the existing app's
 * colour choice, kept on purpose.
 */
type StatusKind = 'success' | 'caution' | 'danger' | 'info' | 'neutral';

const STATUS_MAP: Record<string, { label: string; kind: StatusKind }> = {
  BOOKED: { label: 'Booked', kind: 'info' },
  COMPLETED: { label: 'Completed', kind: 'success' },
  CANCELLED: { label: 'Cancelled', kind: 'danger' },
  NO_SHOW: { label: 'No show', kind: 'caution' },
  PENDING: { label: 'Pending', kind: 'caution' },
  IN_PROGRESS: { label: 'In progress', kind: 'info' },
  PAID: { label: 'Paid', kind: 'success' },
  PARTIAL: { label: 'Partial', kind: 'caution' },
  ADMITTED: { label: 'Admitted', kind: 'danger' },
  DISCHARGED: { label: 'Discharged', kind: 'success' },
  VACANT: { label: 'Vacant', kind: 'success' },
  OCCUPIED: { label: 'Occupied', kind: 'danger' },
  MAINTENANCE: { label: 'Maintenance', kind: 'neutral' },
};

const KIND_CLASSES: Record<StatusKind, string> = {
  success: 'bg-success-bg text-success-fg',
  caution: 'bg-caution-bg text-caution-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-neutral-bg text-neutral-fg',
};

function friendlyFallback(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const meta = STATUS_MAP[status] ?? { label: friendlyFallback(status), kind: 'neutral' as const };
  return (
    <span className={`status-dot ${KIND_CLASSES[meta.kind]} ${className}`}>
      {meta.label}
    </span>
  );
}
