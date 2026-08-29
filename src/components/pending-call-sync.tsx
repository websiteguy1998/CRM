"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Fires a lightweight background re-sync of the last day's Zoom calls
 * whenever this page loads, then refreshes the page's data if anything
 * changed. See /api/integrations/zoom/sync-recent for why this needs to
 * exist: Zoom's webhook can fire before a call's duration/recording are
 * final and never fire again, so without this a fresh call stays stuck at
 * 0:00 until someone happens to re-pull it.
 */
export default function PendingCallSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/zoom/sync-recent", { method: "POST" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && (data.recorded > 0 || data.updated > 0)) {
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
