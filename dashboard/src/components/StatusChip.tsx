import { STATUS_LABEL, type LeadStatus } from "../types";

export default function StatusChip({ status }: { status: LeadStatus }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;
}
