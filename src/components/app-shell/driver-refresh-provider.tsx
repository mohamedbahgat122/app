"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { RefreshIcon } from "@/components/app-shell/icons";
import { useRouter } from "@/i18n/navigation";

type DriverRefreshContextValue = { isRefreshing: boolean; refresh: () => void };
const DriverRefreshContext = createContext<DriverRefreshContextValue | null>(null);
const pullThreshold = 64;
const maxPullDistance = 96;

export function DriverRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startRouterTransition] = useTransition();
  const [refreshRequested, setRefreshRequested] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const transitionObservedRef = useRef(false);
  const refreshingRef = useRef(false);
  const touchRef = useRef({ active: false, startX: 0, startY: 0 });

  const refresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    transitionObservedRef.current = false;
    setRefreshRequested(true);
    startRouterTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (refreshRequested && isPending && !transitionObservedRef.current) {
      transitionObservedRef.current = true;
      return;
    }
    if (!refreshRequested || !transitionObservedRef.current || isPending) return;
    const timer = window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshRequested(false);
      transitionObservedRef.current = false;
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isPending, refreshRequested]);

  useEffect(() => {
    function isIgnoredTarget(target: EventTarget | null) {
      return target instanceof Element && Boolean(target.closest("button, input, select, textarea, a"));
    }
    function isAtTop() {
      return window.scrollY <= 0 && (document.scrollingElement?.scrollTop ?? 0) <= 0;
    }
    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || !isAtTop() || isIgnoredTarget(event.target)) {
        touchRef.current.active = false;
        return;
      }
      const touch = event.touches[0];
      touchRef.current = { active: true, startX: touch.clientX, startY: touch.clientY };
    }
    function handleTouchMove(event: TouchEvent) {
      if (!touchRef.current.active || event.touches.length !== 1 || !isAtTop()) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - touchRef.current.startX;
      const deltaY = touch.clientY - touchRef.current.startY;
      if (deltaY <= 0 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2) {
        setPullDistance(0);
        return;
      }
      event.preventDefault();
      const distance = Math.min(maxPullDistance, deltaY * 0.45);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    }
    function handleTouchEnd() {
      if (!touchRef.current.active) return;
      touchRef.current.active = false;
      if (pullDistanceRef.current >= pullThreshold * 0.45) refresh();
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [refresh]);

  const isRefreshing = refreshRequested || isPending;
  const showIndicator = isRefreshing || pullDistance > 0;
  return (
    <DriverRefreshContext.Provider value={{ isRefreshing, refresh }}>
      {children}
      {showIndicator ? <PullRefreshIndicator distance={pullDistance} isRefreshing={isRefreshing} /> : null}
    </DriverRefreshContext.Provider>
  );
}

export function DriverRefreshButton() {
  const context = useDriverRefresh();
  const t = useTranslations("Shell.refresh");
  return (
    <button type="button" aria-label={t("button")} title={t("button")} disabled={context.isRefreshing} onClick={context.refresh}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-navy transition [touch-action:manipulation] hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">
      <RefreshIcon className={context.isRefreshing ? "size-5 animate-spin" : "size-5"} />
    </button>
  );
}

function PullRefreshIndicator({ distance, isRefreshing }: { distance: number; isRefreshing: boolean }) {
  const t = useTranslations("Shell.refresh");
  const reachedThreshold = distance >= pullThreshold * 0.45;
  const message = isRefreshing ? t("refreshing") : reachedThreshold ? t("release") : t("pull");
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.35rem,env(safe-area-inset-top))] z-[60] flex justify-center" style={{ transform: `translateY(${isRefreshing ? 0 : distance}px)` }} aria-live="polite">
      <div className="flex items-center gap-2 rounded-full border border-primary/15 bg-white/95 px-3 py-2 text-xs font-bold text-primary shadow-md backdrop-blur">
        <RefreshIcon className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
        <span>{message}</span>
      </div>
    </div>
  );
}

function useDriverRefresh() {
  const context = useContext(DriverRefreshContext);
  if (!context) throw new Error("Driver refresh controls must be inside DriverRefreshProvider");
  return context;
}
