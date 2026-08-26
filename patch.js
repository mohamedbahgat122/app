const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');

// 1. Update types.ts
const typesPath = path.join(dashDir, 'features/app-requests/types.ts');
let typesStr = fs.readFileSync(typesPath, 'utf8');
typesStr = typesStr.replace(
  "startReviewNote: string | null;\n    endedAt: string | null;",
  "startReviewNote: string | null;\n    startOcrReading: string | null;\n    startOcrStatus: string | null;\n    endedAt: string | null;"
);
typesStr = typesStr.replace(
  "endReviewNote: string | null;\n    distance: number | null;",
  "endReviewNote: string | null;\n    endOcrReading: string | null;\n    endOcrStatus: string | null;\n    distance: number | null;"
);
fs.writeFileSync(typesPath, typesStr);

// 2. Update queries.ts
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');
let queriesStr = fs.readFileSync(queriesPath, 'utf8');
queriesStr = queriesStr.replace(
  "start_photo_path: string | null;\n    start_photo_captured_at: string | null;",
  "start_photo_path: string | null;\n    start_photo_captured_at: string | null;\n    start_ocr_reading: string | null;\n    start_ocr_status: string | null;"
);
queriesStr = queriesStr.replace(
  "end_photo_path: string | null;\n    end_photo_captured_at: string | null;",
  "end_photo_path: string | null;\n    end_photo_captured_at: string | null;\n    end_ocr_reading: string | null;\n    end_ocr_status: string | null;"
);
queriesStr = queriesStr.replace(
  "startPhotoPathPresent: Boolean(shift.start_photo_path),\n        startPhotoCapturedAt: shift.start_photo_captured_at,",
  "startPhotoPathPresent: Boolean(shift.start_photo_path),\n        startPhotoCapturedAt: shift.start_photo_captured_at,\n        startOcrReading: shift.start_ocr_reading,\n        startOcrStatus: shift.start_ocr_status,"
);
queriesStr = queriesStr.replace(
  "endPhotoPathPresent: Boolean(shift.end_photo_path),\n        endPhotoCapturedAt: shift.end_photo_captured_at,",
  "endPhotoPathPresent: Boolean(shift.end_photo_path),\n        endPhotoCapturedAt: shift.end_photo_captured_at,\n        endOcrReading: shift.end_ocr_reading,\n        endOcrStatus: shift.end_ocr_status,"
);
fs.writeFileSync(queriesPath, queriesStr);

// 3. Update app-requests-table.tsx
const tablePath = path.join(dashDir, 'components/dashboard/app-requests/app-requests-table.tsx');
let tableStr = fs.readFileSync(tablePath, 'utf8');

// Update ReviewPhasePanel parameters and local variables
tableStr = tableStr.replace(
  "const reviewNote = isStart ? shift.startReviewNote : shift.endReviewNote;",
  "const reviewNote = isStart ? shift.startReviewNote : shift.endReviewNote;\n    const ocrReading = isStart ? shift.startOcrReading : shift.endOcrReading;\n    const ocrStatus = isStart ? shift.startOcrStatus : shift.endOcrStatus;"
);

const panelFormRegex = /<form action=\{formAction\} className="mt-4 space-y-3">([\s\S]*?)<\/form>/;
const newForm = '<form action={formAction} className="mt-4 space-y-3">\n' +
'            <input type="hidden" name="locale" value={locale} />\n' +
'            <input type="hidden" name="organizationCode" value={organizationCode} />\n' +
'            <input type="hidden" name="organizationId" value={organizationId} />\n' +
'            <input type="hidden" name="shiftId" value={shift.id} />\n' +
'            <input type="hidden" name="phase" value={phase} />\n' +
'            \n' +
'            {reviewStatus === "pending_review" ? (\n' +
'              <div className="space-y-2">\n' +
'                <label className="block text-sm font-bold text-navy">\n' +
'                  قراءة العداد الصحيحة\n' +
'                </label>\n' +
'                <input \n' +
'                  type="number" \n' +
'                  name="odometerReading" \n' +
'                  min="0" \n' +
'                  required \n' +
'                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"\n' +
'                  placeholder="مثال: 25433"\n' +
'                />\n' +
'              </div>\n' +
'            ) : null}\n' +
'\n' +
'            <textarea name="reviewNote" placeholder={dictionary.reviewNote} className="min-h-20 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary" />\n' +
'            <div className="flex flex-wrap gap-2">\n' +
'              <ActionButton action="approved">{isStart ? "اعتماد قراءة البداية" : "اعتماد قراءة النهاية"}</ActionButton>\n' +
'              <ActionButton action="rejected">{dictionary.reject}</ActionButton>\n' +
'            </div>\n' +
'          </form>';
tableStr = tableStr.replace(panelFormRegex, newForm);

const dlRegex = /<dl className="mt-3 space-y-2 text-sm">([\s\S]*?)<\/dl>/;
const dlMatch = tableStr.match(dlRegex);
if (dlMatch) {
  let dlContent = dlMatch[1];
  const ocrFields = '\n' +
'          {ocrReading !== null ? (\n' +
'             <Detail label="قراءة النظام (OCR)" value={ocrReading} />\n' +
'          ) : null}\n' +
'          {ocrStatus !== null ? (\n' +
'             <Detail label="حالة قراءة النظام" value={ocrStatus} />\n' +
'          ) : null}\n' +
'          <Detail label={dictionary.columns.captureTime}';
  dlContent = dlContent.replace('<Detail label={dictionary.columns.captureTime}', ocrFields);
  tableStr = tableStr.replace(dlMatch[0], '<dl className="mt-3 space-y-2 text-sm">' + dlContent + '</dl>');
}

const startReadingCell = '<Cell nowrap>{row.startReading === null ? dictionary.notAvailable : row.startReading.toLocaleString(locale)}</Cell>';
const endReadingCell = '<Cell nowrap>{row.endReading === null ? dictionary.notAvailable : row.endReading.toLocaleString(locale)}</Cell>';

const newStartReadingCell = '<Cell nowrap>\n' +
'                  {row.startReading === null \n' +
'                    ? (row.startReviewStatus === "pending_review" ? "بانتظار المراجعة" : row.startReviewStatus === "rejected" ? "مرفوض" : dictionary.notAvailable)\n' +
'                    : row.startReading.toLocaleString(locale)}\n' +
'                </Cell>';
const newEndReadingCell = '<Cell nowrap>\n' +
'                  {row.endReading === null \n' +
'                    ? (row.endReviewStatus === "pending_review" ? "بانتظار المراجعة" : row.endReviewStatus === "rejected" ? "مرفوض" : dictionary.notAvailable)\n' +
'                    : row.endReading.toLocaleString(locale)}\n' +
'                </Cell>';

tableStr = tableStr.replace(startReadingCell, newStartReadingCell);
tableStr = tableStr.replace(endReadingCell, newEndReadingCell);

const errorMapping = 'function getActionErrorMessage(dictionary: AppRequestsDictionary, code: string | undefined) {\n' +
'  if (!code) return dictionary.actionFailed;\n' +
'  switch (code) {\n' +
'    case "SHIFT_START_BELOW_PREVIOUS_VEHICLE_READING": return "قراءة البداية يجب أن تكون أكبر من أو تساوي القراءة السابقة للمركبة.";\n' +
'    case "SHIFT_START_ABOVE_END": return "قراءة البداية يجب أن تكون أقل من قراءة النهاية لهذه الوردية.";\n' +
'    case "SHIFT_END_BELOW_START": return "قراءة النهاية يجب أن تكون أكبر من أو تساوي قراءة البداية.";\n' +
'    case "SHIFT_END_ABOVE_NEXT_VEHICLE_READING": return "قراءة النهاية يجب أن تكون أقل من القراءة التالية المسجلة للمركبة.";\n' +
'    case "APPROVAL_READING_REQUIRED": return "يجب إدخال قراءة العداد للاعتماد.";\n' +
'    case "SHIFT_INVALID_READING": return "قراءة غير صالحة.";\n' +
'    case "unauthorized":\n' +
'    case "review_permission_denied":\n' +
'      return dictionary.unauthorized;\n' +
'    case "action_failed":\n' +
'    default:\n' +
'      return dictionary.actionFailed;\n' +
'  }\n' +
'}';
tableStr = tableStr.replace(/function getActionErrorMessage[\s\S]*?\}/, errorMapping);

fs.writeFileSync(tablePath, tableStr);
console.log('Patch complete.');
