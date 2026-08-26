const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');

let str = fs.readFileSync(queriesPath, 'utf8');

// 1. the not_started return block:
// It looks something like:
/*
      return {
        id: shift.id,
        ...
        startReading: null,
        startPhotoUrl: null,
        startPhotoPathPresent: false,
        startPhotoCapturedAt: null,
        startReviewStatus: null,
*/

str = str.replace(
  'startPhotoCapturedAt: null,\n        startReviewStatus: null,',
  'startPhotoCapturedAt: null,\n        startOcrReading: null,\n        startOcrStatus: null,\n        startReviewStatus: null,'
);

str = str.replace(
  'endPhotoCapturedAt: null,\n        endReviewStatus: null,',
  'endPhotoCapturedAt: null,\n        endOcrReading: null,\n        endOcrStatus: null,\n        endReviewStatus: null,'
);

// 2. the open/completed return block:
/*
        startPhotoPathPresent: Boolean(shift.start_photo_path),
        startPhotoCapturedAt: shift.start_photo_captured_at,
        startReviewStatus: shift.start_review_status ?? "pending_review",
*/
str = str.replace(
  'startPhotoCapturedAt: shift.start_photo_captured_at,\n        startReviewStatus: shift.start_review_status ?? "pending_review",',
  'startPhotoCapturedAt: shift.start_photo_captured_at,\n        startOcrReading: shift.start_ocr_reading,\n        startOcrStatus: shift.start_ocr_status,\n        startReviewStatus: shift.start_review_status ?? "pending_review",'
);

str = str.replace(
  'endPhotoCapturedAt: shift.end_photo_captured_at,\n        endReviewStatus: shift.end_review_status,',
  'endPhotoCapturedAt: shift.end_photo_captured_at,\n        endOcrReading: shift.end_ocr_reading,\n        endOcrStatus: shift.end_ocr_status,\n        endReviewStatus: shift.end_review_status,'
);

fs.writeFileSync(queriesPath, str);
console.log('Fixed queries.ts strictly.');
