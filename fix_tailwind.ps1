$files = @(
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\app\[locale]\(driver)\requests\new\leave\page.tsx"; old = "flex-shrink-0"; new = "shrink-0" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\app\[locale]\(driver)\requests\new\maintenance\page.tsx"; old = "flex-shrink-0"; new = "shrink-0" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\app\[locale]\(driver)\requests\new\meeting\page.tsx"; old = "flex-shrink-0"; new = "shrink-0" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\app\[locale]\(driver)\requests\new\oil-change\page.tsx"; old = "flex-shrink-0"; new = "shrink-0" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\app\[locale]\(driver)\shifts\page.tsx"; old = "rounded-[1.5rem]"; new = "rounded-3xl" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-app-shell.tsx"; old = "md:max-w-[430px]"; new = "md:max-w-107.5" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-bottom-navigation.tsx"; old = "md:w-[430px]"; new = "md:w-107.5" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-bottom-navigation.tsx"; old = "max-w-[430px]"; new = "max-w-107.5" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-top-header.tsx"; old = "[touch-action:manipulation]"; new = "touch-manipulation" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-top-header.tsx"; old = "focus-visible:outline-2"; new = "" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\app-shell\driver-top-header.tsx"; old = "end-1.5"; new = "inset-e-1.5" },
  @{ path = "d:\001-زمان الفارس\alfaris-driver-pwa\src\components\shifts\shift-change-request-form.tsx"; old = "rounded-[1.5rem]"; new = "rounded-3xl" },
  @{ path = "d:\001-زمان الفارس\logistics-dashboard\logistics-dashboard\components\dashboard\app-requests\shift-requests-table.tsx"; old = "min-w-[1000px]"; new = "min-w-250" },
  @{ path = "d:\001-زمان الفارس\logistics-dashboard\logistics-dashboard\components\dashboard\app-requests\shift-requests-table.tsx"; old = "max-w-[200px]"; new = "max-w-50" }
)

foreach ($f in $files) {
    if (Test-Path $f.path) {
        $content = [System.IO.File]::ReadAllText($f.path, [System.Text.Encoding]::UTF8)
        if ($content.Contains($f.old)) {
            $content = $content.Replace($f.old, $f.new)
            # Remove any double spaces that might happen if replacing with empty string
            $content = $content.Replace("  ", " ")
            [System.IO.File]::WriteAllText($f.path, $content, [System.Text.Encoding]::UTF8)
            Write-Host "Updated $($f.path)"
        }
    } else {
        Write-Host "Not found $($f.path)"
    }
}
