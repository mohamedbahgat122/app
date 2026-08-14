const fs = require('fs');

const files = [
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/app/[locale]/(driver)/requests/new/leave/page.tsx", replacements: [{old: "flex-shrink-0", new: "shrink-0"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/app/[locale]/(driver)/requests/new/maintenance/page.tsx", replacements: [{old: "flex-shrink-0", new: "shrink-0"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/app/[locale]/(driver)/requests/new/meeting/page.tsx", replacements: [{old: "flex-shrink-0", new: "shrink-0"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/app/[locale]/(driver)/requests/new/oil-change/page.tsx", replacements: [{old: "flex-shrink-0", new: "shrink-0"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/app/[locale]/(driver)/shifts/page.tsx", replacements: [{old: "rounded-[1.5rem]", new: "rounded-3xl"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/components/app-shell/driver-app-shell.tsx", replacements: [{old: "md:max-w-[430px]", new: "md:max-w-107.5"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/components/app-shell/driver-bottom-navigation.tsx", replacements: [{old: "md:w-[430px]", new: "md:w-107.5"}, {old: "max-w-[430px]", new: "max-w-107.5"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/components/app-shell/driver-top-header.tsx", replacements: [{old: "[touch-action:manipulation]", new: "touch-manipulation"}, {old: "focus-visible:outline-2", new: ""}, {old: "end-1.5", new: "inset-e-1.5"}] },
  { path: "d:/001-زمان الفارس/alfaris-driver-pwa/src/components/shifts/shift-change-request-form.tsx", replacements: [{old: "rounded-[1.5rem]", new: "rounded-3xl"}] },
  { path: "d:/001-زمان الفارس/logistics-dashboard/logistics-dashboard/components/dashboard/app-requests/shift-requests-table.tsx", replacements: [{old: "min-w-[1000px]", new: "min-w-250"}, {old: "max-w-[200px]", new: "max-w-50"}] }
];

for (const {path, replacements} of files) {
  if (fs.existsSync(path)) {
    let content = fs.readFileSync(path, 'utf8');
    let changed = false;
    for (const {old: o, new: n} of replacements) {
      if (content.includes(o)) {
        content = content.replaceAll(o, n);
        // Clean up double spaces if we replaced with empty string
        content = content.replaceAll('  ', ' ');
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(path, content, 'utf8');
      console.log(`Updated ${path}`);
    }
  } else {
    console.log(`Not found: ${path}`);
  }
}
