"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const COOKIE_NAME = "tzOffset";

function readCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

/**
 * Keeps a `tzOffset` cookie (Date.getTimezoneOffset(), same convention as
 * TimezoneOffsetInput) in sync with the browser's actual timezone, so
 * Server Components with no date-picker form of their own — dashboard
 * stats, "today" counts on Lead Entry / Sellers — can still compute the
 * viewer's local day boundary via localStartOfToday/localStartOfMonth
 * instead of the server's UTC clock. Refreshes once when the cookie is
 * missing or stale (e.g. travel across timezones) so the next render picks
 * it up; silent no-op otherwise.
 */
export default function TimezoneCookieSync() {
  const router = useRouter();

  useEffect(() => {
    const offset = String(new Date().getTimezoneOffset());
    if (readCookie(COOKIE_NAME) !== offset) {
      document.cookie = `${COOKIE_NAME}=${offset}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    }
  }, [router]);

  return null;
}
