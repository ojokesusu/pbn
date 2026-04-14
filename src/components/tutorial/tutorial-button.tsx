"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dashboardTutorialSteps } from "@/lib/tutorial-steps";

const TUTORIAL_SEEN_KEY = "pbn-tutorial-seen";

export function TutorialButton() {
  const pathname = usePathname();

  const startTutorial = useCallback(() => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: "pbn-tutorial-popover",
      nextBtnText: "Selanjutnya →",
      prevBtnText: "← Sebelumnya",
      doneBtnText: "Selesai ✓",
      progressText: "{{current}} dari {{total}}",
      onDestroyed: () => {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
      },
      steps: dashboardTutorialSteps,
    });

    driverObj.drive();
  }, []);

  // Auto-start tutorial on first visit to dashboard
  useEffect(() => {
    if (pathname !== "/") return;

    const hasSeen = localStorage.getItem(TUTORIAL_SEEN_KEY);
    if (!hasSeen) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        startTutorial();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [pathname, startTutorial]);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={startTutorial}
      data-tour="tutorial-btn"
      title="Tutorial"
    >
      <HelpCircle className="size-4" />
      <span className="sr-only">Tutorial</span>
    </Button>
  );
}
