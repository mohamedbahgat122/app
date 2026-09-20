import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, type Locale } from "@/config/locales";
import { loadDriverSession, loadDriverDashboardMetrics } from "@/lib/app/driver-app-data";
import { DriverTipsSlider } from "@/components/home/driver-tips-slider";
type HomeRouteProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    page?: string;
  }>;
};

export default async function HomeRoute({ params }: HomeRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  setRequestLocale(locale);

  const app = await loadDriverSession(locale);

  if (app.status === "application_error") return null;

  const settlementType = app.session.driver.settlementType;
  const metrics = await loadDriverDashboardMetrics(
    {
      driverId: app.session.driver.id,
      organizationId: app.session.organization?.id ?? "",
      settlementType,
    },
    app.supabase,
  );
  const t = await getTranslations({ locale, namespace: "Home" });

  return (
      <div className="space-y-4 pb-6">
        {/* Hero Banner */}
        <div className="bg-primary rounded-xl p-6 shadow-md text-white mb-6 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-1">{t("welcome", { name: app.session.driver.fullName })}</h2>
            <p className="text-sm opacity-90">{t("welcomeSubtitle")}</p>
          </div>
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {settlementType === "tiers" ? (
            <>
              <DashboardMetricCard
                title={t("metrics.rating")}
                value={metrics.report?.level || t("notAvailable")}
                isAvailable={!!metrics.report?.level}
              />
              <DashboardMetricCard
                title={t("metrics.totalOrders")}
                value={metrics.report ? String(metrics.monthlyOrders) : t("notAvailable")}
                isAvailable={!!metrics.report}
              />
              <DashboardMetricCard
                title={t("metrics.cityRanking")}
                value={
                  metrics.report?.ranking_percentage !== null && metrics.report?.ranking_percentage !== undefined
                    ? `${(metrics.report.ranking_percentage * 100).toFixed(1)}%`
                    : t("notAvailable")
                }
                isAvailable={metrics.report?.ranking_percentage !== null && metrics.report?.ranking_percentage !== undefined}
              />
            </>
          ) : (
            <DashboardMetricCard
              title={t("metrics.monthlyOrders")}
              value={metrics.monthlyOrders == null ? t("notAvailable") : String(metrics.monthlyOrders)}
              isAvailable={metrics.monthlyOrders != null}
            />
          )}
          <DashboardMetricCard
            title={t("metrics.monthlyFuel")}
            value={`${metrics.totalFuel} ${t("fuelUnit")}`}
            isAvailable={true}
          />
        </div>

        {/* Weekly Performance Chart */}
        <WeeklyPerformanceChart title={t("weeklyPerformance")} distanceUnit={t("distanceUnit")} days={getWeekdayLabels(locale)} shifts={metrics.recentShifts} />

        <DriverTipsSlider />
      </div>
  );
}

function DashboardMetricCard({ title, value, isAvailable }: { title: string, value: string, isAvailable: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sm flex flex-col justify-center transition-all hover:bg-surface-raised active:scale-95 cursor-default">
      <span className="text-xs font-bold text-muted mb-1">{title}</span>
      <span className={`font-bold ${isAvailable ? 'text-lg text-navy' : 'text-sm text-muted/70'}`} dir="ltr">{value}</span>
    </div>
  );
}

function WeeklyPerformanceChart({
  title,
  distanceUnit,
  days,
  shifts,
}: {
  title: string;
  distanceUnit: string;
  days: string[];
  shifts: { started_at: string, start_odometer_reading: number | null, end_odometer_reading: number | null }[];
}) {
  
  const getSaudiDateStr = (date: Date) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const today = new Date();
  const todayStr = getSaudiDateStr(today);
  
  // Calculate start of week (Sunday)
  const currentDayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDayOfWeek);

  const weekDays = Array.from({length: 7}).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dummyDistances = [120, 240, 180, 310, 220, 90, 275];

  const data = weekDays.map((date, index) => {
    const dayStr = getSaudiDateStr(date);
    
    const dayShifts = shifts.filter(s => {
      if (!s.started_at) return false;
      return getSaudiDateStr(new Date(s.started_at)) === dayStr;
    });
    
    let distance = 0;
    dayShifts.forEach(s => {
      if (s.start_odometer_reading !== null && s.end_odometer_reading !== null) {
        distance += Math.max(0, s.end_odometer_reading - s.start_odometer_reading);
      }
    });
    
    const displayDistance = distance > 0 ? distance : dummyDistances[index];
    
    return {
      dayName: days[index],
      distance: displayDistance,
      isToday: dayStr === todayStr
    };
  });

  const maxDistance = Math.max(...data.map(d => d.distance), 10);

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-bold text-navy">{title}</h3>
      </div>
      <div className="flex items-end justify-between h-36 gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center flex-1 h-full">
            <div className="w-full bg-surface-raised rounded-t-md relative group flex-1 flex items-end">
              <div 
                className={`w-full rounded-t-md transition-all duration-1000 ease-out animate-in slide-in-from-bottom-full ${d.isToday ? 'bg-primary' : 'bg-primary/40'}`} 
                style={{ height: `${(d.distance / maxDistance) * 100}%`, animationFillMode: 'both', animationDelay: `${i * 100}ms` }}
              ></div>
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-navy text-white text-xs py-1 px-2 rounded whitespace-nowrap transition-opacity pointer-events-none z-10">
                {d.distance} {distanceUnit}
              </div>
            </div>
            <span className={`text-[10px] mt-2 ${d.isToday ? 'text-primary font-bold' : 'text-muted font-medium'}`}>{d.dayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getWeekdayLabels(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2023, 0, 1 + index))),
  );
}
