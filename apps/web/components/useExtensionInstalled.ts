"use client";

import { useEffect, useState } from "react";

// Is the JobAssistUI extension installed in THIS browser?
//
// The extension's web-bridge content script sets
// data-jobassistui-extension on <html> when it runs on our origin. This hook
// reads that.
//
// Three states, and the third one matters: null means "we don't know yet".
// The content script runs at document_idle, which can be after React has
// mounted, so a plain read on mount reports "not installed" for a user who has
// it. Showing an install prompt to someone already running the extension makes
// the product look broken, so callers render nothing while this is null and
// the MutationObserver below resolves it a moment later.
//
// Nothing here can detect an extension that is installed but disabled, or one
// that has not yet re-injected into a tab that was open before it was
// installed. Both resolve on the next page load; treat this as a UI hint, never
// as an entitlement check.
export function useExtensionInstalled(): boolean | null {
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () =>
      document.documentElement.hasAttribute("data-jobassistui-extension");

    if (read()) {
      setInstalled(true);
      return;
    }

    // Not there yet — it may still be injecting. Watch for it, and settle on
    // "not installed" after a short grace period so the UI never hangs on null.
    const observer = new MutationObserver(() => {
      if (read()) {
        setInstalled(true);
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-jobassistui-extension"],
    });

    const timer = setTimeout(() => {
      setInstalled(read());
      observer.disconnect();
    }, 1500);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return installed;
}
