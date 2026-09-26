export const OIL_CHANGE_CATEGORIES = [
  { value: "تغيير زيت", labelKey: "oil" },
  { value: "تغيير سيفون", labelKey: "siphon" },
  { value: "تغيير فلتر مكينة", labelKey: "engineFilter" },
  { value: "تغيير فلتر مكيف", labelKey: "cabinFilter" },
] as const;

export type OilChangeCategory = (typeof OIL_CHANGE_CATEGORIES)[number]["value"];

const oilChangeCategoryValues = new Set<string>(
  OIL_CHANGE_CATEGORIES.map(({ value }) => value),
);

export function isOilChangeCategory(value: string): value is OilChangeCategory {
  return oilChangeCategoryValues.has(value);
}

export function normalizeOilChangeCategories(values: string[]) {
  const selected = new Set(values.filter(isOilChangeCategory));

  return OIL_CHANGE_CATEGORIES
    .filter(({ value }) => selected.has(value))
    .map(({ value }) => value);
}
