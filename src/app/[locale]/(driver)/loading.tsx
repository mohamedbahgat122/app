import { PageCard } from "@/components/app-shell/page-card";

export default function DriverRouteLoading() {
  return (
    <main className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded-full bg-primary-soft" />
        <div className="h-7 w-44 animate-pulse rounded-full bg-border/70" />
      </div>
      <PageCard>
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded-full bg-primary-soft" />
          <div className="h-6 w-36 animate-pulse rounded-full bg-border/70" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-14 animate-pulse rounded-[0.75rem] bg-primary-soft/70" />
            <div className="h-14 animate-pulse rounded-[0.75rem] bg-primary-soft/70" />
          </div>
        </div>
      </PageCard>
      <PageCard>
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-primary-soft" />
          <div className="h-16 animate-pulse rounded-[0.75rem] bg-primary-soft/70" />
        </div>
      </PageCard>
    </main>
  );
}
