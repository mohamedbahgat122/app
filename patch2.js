const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');

// 1. Re-Update types.ts
const typesPath = path.join(dashDir, 'features/app-requests/types.ts');
let typesStr = fs.readFileSync(typesPath, 'utf8');

// It's possible the original replacement failed because of exact string matching. Let's use regex.
typesStr = typesStr.replace(/startReviewNote: string \| null;\n\s*endedAt: string \| null;/, "startReviewNote: string | null;\n    startOcrReading: string | null;\n    startOcrStatus: string | null;\n    endedAt: string | null;");
typesStr = typesStr.replace(/endReviewNote: string \| null;\n\s*distance: number \| null;/, "endReviewNote: string | null;\n    endOcrReading: string | null;\n    endOcrStatus: string | null;\n    distance: number | null;");
fs.writeFileSync(typesPath, typesStr);

// 2. Update app-requests-table.tsx error mappings
const tablePath = path.join(dashDir, 'components/dashboard/app-requests/app-requests-table.tsx');
let tableStr = fs.readFileSync(tablePath, 'utf8');

const errorMapping = 'function getActionErrorMessage(dictionary: AppRequestsDictionary, code: string | undefined) {\n' +
'  if (!code) return "فشلت العملية";\n' +
'  switch (code) {\n' +
'    case "SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING": return "قراءة البداية يجب أن تكون أكبر من أو تساوي القراءة السابقة للمركبة.";\n' +
'    case "SHIFT_START_ABOVE_END": return "قراءة البداية يجب أن تكون أقل من قراءة النهاية لهذه الوردية.";\n' +
'    case "SHIFT_END_BELOW_START": return "قراءة النهاية يجب أن تكون أكبر من أو تساوي قراءة البداية.";\n' +
'    case "SHIFT_END_ABOVE_NEXT_VEHICLE_READING": return "قراءة النهاية يجب أن تكون أقل من القراءة التالية المسجلة للمركبة.";\n' +
'    case "APPROVAL_READING_REQUIRED": return "يجب إدخال قراءة العداد للاعتماد.";\n' +
'    case "SHIFT_INVALID_READING": return "قراءة غير صالحة.";\n' +
'    case "unauthorized":\n' +
'    case "review_permission_denied":\n' +
'      return "غير مصرح لك بالقيام بهذه العملية";\n' +
'    case "action_failed":\n' +
'    default:\n' +
'      return "فشلت العملية";\n' +
'  }\n' +
'}';
tableStr = tableStr.replace(/function getActionErrorMessage[\s\S]*?\}/, errorMapping);

fs.writeFileSync(tablePath, tableStr);
console.log('Patch2 complete.');
