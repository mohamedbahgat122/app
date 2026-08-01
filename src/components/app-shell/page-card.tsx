import type { ReactNode } from "react";

export function PageCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      {children}
    </section>
  );
}

export function EmptyState({
  description,
  title,
}: {
  description?: string;
  title: string;
}) {
  return (
    <PageCard>
      <h2 className="text-base font-bold text-navy">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm font-medium leading-6 text-muted">
          {description}
        </p>
      ) : null}
    </PageCard>
  );
}
