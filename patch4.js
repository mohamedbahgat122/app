const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');

let queriesStr = fs.readFileSync(queriesPath, 'utf8');

// The objects returned must have startOcrReading, startOcrStatus, endOcrReading, endOcrStatus

// 1. Fix the not_started return object
const notStartedSearch = `startPhotoPathPresent: false,
        startPhotoCapturedAt: null,`;
const notStartedReplace = `startPhotoPathPresent: false,
        startPhotoCapturedAt: null,
        startOcrReading: null,
        startOcrStatus: null,`;
queriesStr = queriesStr.replace(notStartedSearch, notStartedReplace);

const notStartedEndSearch = `endPhotoPathPresent: false,
        endPhotoCapturedAt: null,`;
const notStartedEndReplace = `endPhotoPathPresent: false,
        endPhotoCapturedAt: null,
        endOcrReading: null,
        endOcrStatus: null,`;
queriesStr = queriesStr.replace(notStartedEndSearch, notStartedEndReplace);

// 2. Fix the open/completed return object
// We already patched the startPhotoPathPresent block, but let's make sure it covers both places or is done right.
// Wait, in my previous patch I replaced:
// startPhotoPathPresent: Boolean(shift.start_photo_path),
//         startPhotoCapturedAt: shift.start_photo_captured_at,
// with the ocr fields. BUT I might have missed the not_started block if it was different!
// Yes, the not_started block has `startPhotoPathPresent: false,` not `Boolean(shift.start_photo_path)`.
// Let's also check if I missed anything in the open/completed return object.
// In the open/completed return block, `satisfies OdometerShiftRow` is at line 575.
// Let's look for `endPhotoCapturedAt: shift.end_photo_captured_at,` and `startPhotoCapturedAt: shift.start_photo_captured_at,`
// If it was already replaced, we just need to fix the `not_started` block.

fs.writeFileSync(queriesPath, queriesStr);
console.log('Fixed queries.ts missing keys.');
