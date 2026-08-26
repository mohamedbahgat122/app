const fs = require('fs');
const path = require('path');

const dashDir = path.resolve('..', 'logistics-dashboard', 'logistics-dashboard');
const tablePath = path.join(dashDir, 'components/dashboard/app-requests/app-requests-table.tsx');

let tableStr = fs.readFileSync(tablePath, 'utf8');

// The regex replacement in patch2 probably added an extra brace at the end or left one.
// Let's replace the duplicate brace at the end.
tableStr = tableStr.replace(/}\r?\n}\s*$/, '}');

fs.writeFileSync(tablePath, tableStr);
console.log('Fixed extra brace.');
