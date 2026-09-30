import { QUOTATION_STATUS_LABELS, type QuotationStatus } from '../types'

const STYLES: Record<QuotationStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
}

export default function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {QUOTATION_STATUS_LABELS[status]}
    </span>
  )
}
