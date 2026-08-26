const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const queriesPath = path.join(dashDir, 'features/app-requests/queries.ts');

let queriesStr = fs.readFileSync(queriesPath, 'utf8');

// Match precisely `startPhotoCapturedAt: null,` and replace if not already replaced
queriesStr = queriesStr.replace(/startPhotoCapturedAt:\s*null,(\s*startReviewStatus)/g, "startPhotoCapturedAt: null,\n        startOcrReading: null,\n        startOcrStatus: null,$1");
queriesStr = queriesStr.replace(/endPhotoCapturedAt:\s*null,(\s*endReviewStatus)/g, "endPhotoCapturedAt: null,\n        endOcrReading: null,\n        endOcrStatus: null,$1");

fs.writeFileSync(queriesPath, queriesStr);
console.log('Fixed queries.ts missing keys definitively.');
