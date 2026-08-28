"use client";

import { useEffect, useRef } from "react";

/**
 * A "from"/"to" date filter with no timezone info is ambiguous — the
 * browser sends a plain "2026-08-28" with no offset, so the server can't
 * tell where the viewer's midnight actually falls in UTC. This hidden
 * field carries the browser's UTC offset (minutes) along with the form
 * submission so the server can compute the *local* start/end of day
 * instead of UTC's, which otherwise silently drops anything created in
 * the first few hours of the local day (or the last few, depending on
 * the sign) for anyone not in UTC.
 */
export default function TimezoneOffsetInput() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.value = String(new Date().getTimezoneOffset());
  }, []);

  return <input ref={ref} type="hidden" name="tzOffset" />;
}
