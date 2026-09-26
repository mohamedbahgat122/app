export const MAINTENANCE_CATEGORIES = [
  { value: "تغيير كفرات", labelKey: "tireChange" },
  { value: "صيانة كهرباء", labelKey: "electrical" },
  { value: "صيانة مكيف", labelKey: "airConditioning" },
  { value: "صيانة عفشة", labelKey: "suspension" },
  { value: "صيانة مكينة", labelKey: "engine" },
] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number]["value"];

export function isMaintenanceCategory(value: string): value is MaintenanceCategory {
  return MAINTENANCE_CATEGORIES.some((category) => category.value === value);
}
