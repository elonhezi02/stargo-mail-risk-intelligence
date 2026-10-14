import { AlertCircle, LoaderCircle, Clock3 } from 'lucide-react';
import type { ProcessingStatus, RiskLevel } from '../../shared/contracts';
export const riskLabels: Record<RiskLevel, string> = {
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
  none: 'No risk detected',
};
export function StatusBadge({
  risk,
  status,
}: {
  risk: RiskLevel | null;
  status: ProcessingStatus;
}) {
  if (risk !== null)
    return (
      <span className={`badge risk-${risk}`}>
        <span className="badge-dot" />
        {riskLabels[risk]}
      </span>
    );
  return (
    <span className={`badge status-${status}`}>
      {status === 'failed' ? (
        <AlertCircle size={12} />
      ) : status === 'queued' ? (
        <Clock3 size={12} />
      ) : (
        <LoaderCircle size={12} className="spin" />
      )}
      {
        {
          failed: 'Analysis failed',
          queued: 'Not assessed',
          extracting: 'Extracting',
          assessing: 'Assessing',
          completed: 'Not assessed',
        }[status]
      }
    </span>
  );
}
