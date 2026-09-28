"use client";

import { useEffect } from "react";
import { DONATION_SUPPORTED_AT_KEY, stripSupportedParam } from "@/lib/donation-return";

export function DonationReturnHandler() {
  useEffect(() => {
    const cleaned = stripSupportedParam(window.location.href);
    if (cleaned === null) return;
    try {
      window.localStorage.setItem(DONATION_SUPPORTED_AT_KEY, String(Date.now()));
    } catch {
      // Storage can be blocked (private mode, disabled site data); still clean the URL.
    }
    window.history.replaceState(window.history.state, "", cleaned);
  }, []);
  return null;
}
