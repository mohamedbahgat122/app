type RequestStatusBadgeProps = {
  label: string;
  status: string;
};

const baseClassName =
  "rounded-full border px-2.5 py-1 text-xs font-bold";

const statusClassNames = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-sky-200 bg-sky-50 text-sky-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-border bg-white text-navy",
} as const;

export function RequestStatusBadge({ label, status }: RequestStatusBadgeProps) {
  const tone = resolveRequestStatusTone(status, label);

  return (
    <span className={`${baseClassName} ${statusClassNames[tone]}`}>
      {label}
    </span>
  );
}

function resolveRequestStatusTone(status: string, label: string) {
  const candidates = [normalizeStatusValue(status), normalizeStatusValue(label)];

  if (candidates.some(isRejectedStatus)) return "rejected";
  if (candidates.some(isApprovedStatus)) return "approved";
  if (candidates.some(isPendingStatus)) return "pending";

  return "neutral";
}

function normalizeStatusValue(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isRejectedStatus(value: string) {
  return value === "rejected" || value === "\u0645\u0631\u0641\u0648\u0636";
}

function isApprovedStatus(value: string) {
  return (
    value === "approved" ||
    value === "\u0645\u0639\u062a\u0645\u062f" ||
    value === "\u0645\u0648\u0627\u0641\u0642_\u0639\u0644\u064a\u0647"
  );
}

function isPendingStatus(value: string) {
  return (
    value === "pending" ||
    value === "pending_review" ||
    value === "in_review" ||
    value === "\u0642\u064a\u062f_\u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629" ||
    value === "\u0628\u0627\u0646\u062a\u0638\u0627\u0631_\u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629"
  );
}
