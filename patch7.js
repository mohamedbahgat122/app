const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');

let str = fs.readFileSync(queriesPath, 'utf8');

// Replace using regex that ignores line endings and spaces
str = str.replace(/startPhotoCapturedAt:\s*shift\.start_photo_captured_at,[\s\r\n]*startReviewStatus:/g,
  'startPhotoCapturedAt: shift.start_photo_captured_at,\n        startOcrReading: shift.start_ocr_reading,\n        startOcrStatus: shift.start_ocr_status,\n        startReviewStatus:');

str = str.replace(/endPhotoCapturedAt:\s*shift\.end_photo_captured_at,[\s\r\n]*endReviewStatus:/g,
  'endPhotoCapturedAt: shift.end_photo_captured_at,\n        endOcrReading: shift.end_ocr_reading,\n        endOcrStatus: shift.end_ocr_status,\n        endReviewStatus:');

str = str.replace(/startPhotoCapturedAt:\s*null,[\s\r\n]*startReviewStatus:/g,
  'startPhotoCapturedAt: null,\n        startOcrReading: null,\n        startOcrStatus: null,\n        startReviewStatus:');

str = str.replace(/endPhotoCapturedAt:\s*null,[\s\r\n]*endReviewStatus:/g,
  'endPhotoCapturedAt: null,\n        endOcrReading: null,\n        endOcrStatus: null,\n        endReviewStatus:');

fs.writeFileSync(queriesPath, str);
console.log('Regex patch applied.');
