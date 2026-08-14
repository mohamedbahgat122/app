import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/config/locales";
import { loadDriverSession, loadDriverDashboardMetrics } from "@/lib/app/driver-app-data";
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

  const metrics = await loadDriverDashboardMetrics(app.session.driver.id, app.supabase);

  return (
      <div className="space-y-4 pb-6">
        {/* Hero Banner */}
        <div className="bg-primary rounded-xl p-6 shadow-md text-white mb-6 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-1">مرحباً بك، {app.session.driver.fullName}</h2>
            <p className="text-sm opacity-90">أتمنى لك يوم عمل موفق وآمن.</p>
          </div>
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <DashboardMetricCard 
            title="تقييمي" 
            value={metrics.report?.level || "غير متاح"} 
            isAvailable={!!metrics.report?.level} 
          />
          <DashboardMetricCard 
            title="إجمالي الطلبات" 
            value={metrics.report ? String(metrics.monthlyOrders) : "غير متاح"} 
            isAvailable={!!metrics.report} 
          />
          <DashboardMetricCard 
            title="ترتيبي على المدينة" 
            value={
              metrics.report?.ranking_percentage !== null && metrics.report?.ranking_percentage !== undefined
                ? `${(metrics.report.ranking_percentage * 100).toFixed(1)}%`
                : "غير متاح"
            } 
            isAvailable={metrics.report?.ranking_percentage !== null && metrics.report?.ranking_percentage !== undefined} 
          />
          <DashboardMetricCard 
            title="وقود هذا الشهر" 
            value={metrics.totalFuel > 0 ? `${metrics.totalFuel} ر.س` : "0 ر.س"} 
            isAvailable={true} 
          />
        </div>

        {/* Weekly Performance Chart */}
        <WeeklyPerformanceChart shifts={metrics.recentShifts} />

        {/* Achievements Banner */}
        <WeeklyAchievementsBanner 
          shifts={metrics.recentShifts} 
          weeklyReports={metrics.weeklyReports} 
          latestReport={metrics.report} 
        />
      </div>
  );
}

function WeeklyAchievementsBanner({ 
  shifts, 
  weeklyReports, 
  latestReport 
}: { 
  shifts: { started_at: string, start_odometer_reading: number | null, end_odometer_reading: number | null }[],
  weeklyReports: { report_date: string, delivered_tasks: number }[],
  latestReport: { level: string | null } | null
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
  
  const currentDayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDayOfWeek);

  const weekDaysStr = Array.from({length: 7}).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return getSaudiDateStr(d);
  });

  // 1. Weekly Orders
  const currentWeekReports = weeklyReports.filter(r => {
    if (!r.report_date) return false;
    const dStr = r.report_date.split('T')[0];
    return weekDaysStr.includes(dStr);
  });
  const weeklyOrders = currentWeekReports.reduce((sum, r) => sum + (r.delivered_tasks || 0), 0);

  // 2. Attendance (days present >= 5)
  const currentWeekShifts = shifts.filter(s => {
    if (!s.started_at) return false;
    return weekDaysStr.includes(getSaudiDateStr(new Date(s.started_at)));
  });
  const uniqueShiftDays = new Set(currentWeekShifts.map(s => getSaudiDateStr(new Date(s.started_at))));
  const attendanceDays = uniqueShiftDays.size;
  const isCommitted = attendanceDays >= 5;

  // 3. Excellent Performance
  const isExcellent = latestReport?.level === "A";

  // 4. Completed Shifts
  const hasShifts = currentWeekShifts.length > 0;
  const hasIncompleteShifts = currentWeekShifts.some(s => s.start_odometer_reading === null || s.end_odometer_reading === null);
  const isShiftsCompleted = hasShifts && !hasIncompleteShifts;

  const badges = [];

  // Add Orders badge (mutually exclusive)
  if (weeklyOrders >= 150) {
    badges.push({ text: "نجم الطلبات", icon: "⭐", bg: "bg-amber-100", textCol: "text-amber-700" });
  } else if (weeklyOrders >= 100) {
    badges.push({ text: "طلبات جيدة", icon: "👍", bg: "bg-blue-100", textCol: "text-blue-700" });
  } else {
    badges.push({ text: "طلبات ضعيفة", icon: "⚠️", bg: "bg-gray-100", textCol: "text-gray-700" });
  }

  // Add other badges if condition met
  if (isCommitted) {
    badges.push({ text: "ملتزم", icon: "✅", bg: "bg-emerald-100", textCol: "text-emerald-700" });
  }

  if (isExcellent) {
    badges.push({ text: "أداء ممتاز", icon: "🏆", bg: "bg-purple-100", textCol: "text-purple-700" });
  }

  if (isShiftsCompleted) {
    badges.push({ text: "ورديات مكتملة", icon: "⏱️", bg: "bg-teal-100", textCol: "text-teal-700" });
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      <h3 className="text-base font-bold text-navy mb-4">إنجازات الأسبوع</h3>
      <div className="flex flex-wrap gap-2">
        {badges.map((badge, i) => (
          <div key={i} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold shadow-sm ${badge.bg} ${badge.textCol}`}>
            <span className="text-lg">{badge.icon}</span>
            <span>{badge.text}</span>
          </div>
        ))}
      </div>
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

function WeeklyPerformanceChart({ shifts }: { shifts: { started_at: string, start_odometer_reading: number | null, end_odometer_reading: number | null }[] }) {
  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  
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
        <h3 className="text-base font-bold text-navy">أداء الأسبوع</h3>
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
                {d.distance} كم
              </div>
            </div>
            <span className={`text-[10px] mt-2 ${d.isToday ? 'text-primary font-bold' : 'text-muted font-medium'}`}>{d.dayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


