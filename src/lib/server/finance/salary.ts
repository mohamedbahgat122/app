import "server-only";

import { getFinanceFirestore } from "@/lib/server/finance/firebase";

export type SalaryLine = { name: string; amount: number };

export type PublishedSalary = {
  name: string | null;
  month: string;
  appName: string | null;
  salaryType: string | null;
  accountStatusLabel: string | null;
  ordersActual: number | null;
  target: number | null;
  target2: number | null;
  gross: number | null;
  net: number | null;
  remaining: number | null;
  totalAdditions: number | null;
  totalDeductions: number | null;
  cashPaid: number | null;
  bankTransfer: number | null;
  earnings: SalaryLine[];
  deductions: SalaryLine[];
  publishedAt: string | null;
};

type FeedItem = Record<string, unknown>;

export async function loadPublishedSalaries(keetaDriverId: string): Promise<PublishedSalary[]> {
  const normalizedDelegateId = normalizeFinanceDelegateId(keetaDriverId);
  if (!normalizedDelegateId) return [];

  const snapshot = await getFinanceFirestore()
    .doc(`salaries/public_delegate_salary_feeds/items/${normalizedDelegateId}`)
    .get();

  if (!snapshot.exists) return [];

  const feed = snapshot.data() ?? {};
  const items = readItems(feed);

  return items
    .filter((item) => item.status === "published")
    .map(toPublishedSalary)
    .filter((item): item is PublishedSalary => item !== null)
    .sort((a, b) => compareMonths(b.month, a.month));
}

export function normalizeFinanceDelegateId(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[\s_-]+/g, "")
    .trim();
}

function readItems(feed: Record<string, unknown>): FeedItem[] {
  if (Array.isArray(feed.items)) {
    return feed.items.filter(isRecord);
  }

  if (typeof feed.itemsJson !== "string") return [];

  try {
    const parsed = JSON.parse(feed.itemsJson);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function toPublishedSalary(item: FeedItem): PublishedSalary | null {
  const month = readString(item.month) ?? readString(item.period) ?? readString(item.salaryMonth);
  if (!month) return null;

  return {
    name: readString(item.name),
    month,
    appName: readString(item.appName),
    salaryType: readString(item.salaryType),
    accountStatusLabel: readString(item.accountStatusLabel),
    ordersActual: readNumber(item.ordersActual),
    target: readNumber(item.target),
    target2: readNumber(item.target2),
    gross: readNumber(item.gross),
    net: readNumber(item.net),
    remaining: readNumber(item.remaining),
    totalAdditions: readNumber(item.totalAdditions),
    totalDeductions: readNumber(item.totalDeductions),
    cashPaid: readNumber(item.cashPaid),
    bankTransfer: readNumber(item.bankTransfer),
    earnings: readLines(item.earnings),
    deductions: readLines(item.deductions),
    publishedAt: readTimestamp(item.publishedAt),
  };
}

function readLines(value: unknown): SalaryLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!isRecord(line)) return [];
    const name = readString(line.name);
    const amount = readNumber(line.amount);
    return name !== null && amount !== null ? [{ name, amount }] : [];
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTimestamp(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return null;
}

function compareMonths(left: string, right: string): number {
  const leftKey = left.replace(/\D/g, "");
  const rightKey = right.replace(/\D/g, "");

  if (leftKey && rightKey && leftKey !== rightKey) {
    return leftKey.localeCompare(rightKey, undefined, { numeric: true });
  }

  return left.localeCompare(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
