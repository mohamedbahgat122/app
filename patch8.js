const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');

let str = fs.readFileSync(queriesPath, 'utf8');

str = str.replace(
  'start_photo_captured_at: string | null;',
  'start_photo_captured_at: string | null;\n    start_ocr_reading: string | null;\n    start_ocr_status: string | null;'
);

str = str.replace(
  'end_photo_captured_at: string | null;',
  'end_photo_captured_at: string | null;\n    end_ocr_reading: string | null;\n    end_ocr_status: string | null;'
);

fs.writeFileSync(queriesPath, str);
console.log('Fixed OdometerShiftRecord missing properties.');
