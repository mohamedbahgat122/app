"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function GlobalNavigationLoader({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Reset navigation state when route actually changes
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find the closest anchor tag
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      
      const href = target.getAttribute("href");
      if (!href) return;
      
      // Ignore external links or modified clicks (open in new tab)
      if (
        target.getAttribute("target") === "_blank" ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      
      // Ignore if navigating to the exact same URL
      try {
        const destUrl = new URL(target.href);
        if (
          destUrl.origin === window.location.origin &&
          destUrl.pathname === window.location.pathname &&
          destUrl.search === window.location.search
        ) {
          return;
        }
      } catch (err) {
        // Fallback for invalid URLs
      }

      // Prevent multiple clicks while already navigating
      if (isNavigating) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Start navigation UX
      setIsNavigating(true);
    };

    // Use capture phase to intercept before React or Next.js handles it
    document.addEventListener("click", handleClick, true);
    
    // Also handle browser back/forward buttons
    const handlePopState = () => setIsNavigating(true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isNavigating]);

  return (
    <>
      <div 
        className={`transition-opacity duration-200 ${
          isNavigating ? "pointer-events-none opacity-50" : "opacity-100"
        }`}
      >
        {children}
      </div>
      
      {isNavigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="h-12 w-12 animate-spin rounded-full border-[4px] border-primary border-t-transparent shadow-lg"></div>
        </div>
      )}
    </>
  );
}
