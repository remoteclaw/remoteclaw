// Chat scroll behavior for the Control UI.
//
// ADR-0023 mapped the fork's ui/src/ui/app-scroll.ts onto this path. The host
// contract (ScrollHost) stays fork-owned in ui/src/ui/app-scroll.ts, which also
// keeps the logs/activity/topbar helpers that have no upstream counterpart.
import type { ScrollHost } from "../../ui/app-scroll.ts";

/** Distance (px) from the bottom within which we consider the user "near bottom". */
const NEAR_BOTTOM_THRESHOLD = 450;
const HEADER_HIDE_SCROLL_DELTA = 12;
const HEADER_SHOW_TOP_THRESHOLD = 24;

function queryHost(host: Partial<ScrollHost>, selectors: string): Element | null {
  return typeof host.querySelector === "function" ? host.querySelector(selectors) : null;
}

export function scheduleChatScroll(host: ScrollHost, force = false, smooth = false) {
  if (host.chatScrollFrame) {
    cancelAnimationFrame(host.chatScrollFrame);
  }
  if (host.chatScrollTimeout != null) {
    clearTimeout(host.chatScrollTimeout);
    host.chatScrollTimeout = null;
  }
  const pickScrollTarget = () => {
    const container = queryHost(host, ".chat-thread") as HTMLElement | null;
    if (container) {
      const overflowY = getComputedStyle(container).overflowY;
      const canScroll =
        overflowY === "auto" ||
        overflowY === "scroll" ||
        container.scrollHeight - container.clientHeight > 1;
      if (canScroll) {
        return container;
      }
    }
    return (document.scrollingElement ?? document.documentElement) as HTMLElement | null;
  };
  // Wait for Lit render to complete, then scroll
  void host.updateComplete.then(() => {
    host.chatScrollFrame = requestAnimationFrame(() => {
      host.chatScrollFrame = null;
      const target = pickScrollTarget();
      if (!target) {
        return;
      }
      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

      // force=true only overrides when we haven't auto-scrolled yet (initial load).
      // After initial load, respect the user's scroll position.
      const effectiveForce = force && !host.chatHasAutoScrolled;
      const shouldStick =
        effectiveForce || host.chatUserNearBottom || distanceFromBottom < NEAR_BOTTOM_THRESHOLD;

      if (!shouldStick) {
        // User is scrolled up — flag that new content arrived below.
        host.chatNewMessagesBelow = true;
        return;
      }
      if (effectiveForce) {
        host.chatHasAutoScrolled = true;
      }
      const smoothEnabled =
        smooth &&
        (typeof window === "undefined" ||
          typeof window.matchMedia !== "function" ||
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const scrollTop = target.scrollHeight;
      if (typeof target.scrollTo === "function") {
        target.scrollTo({ top: scrollTop, behavior: smoothEnabled ? "smooth" : "auto" });
      } else {
        target.scrollTop = scrollTop;
      }
      host.chatUserNearBottom = true;
      host.chatNewMessagesBelow = false;
      const retryDelay = effectiveForce ? 150 : 120;
      host.chatScrollTimeout = window.setTimeout(() => {
        host.chatScrollTimeout = null;
        const latest = pickScrollTarget();
        if (!latest) {
          return;
        }
        const latestDistanceFromBottom =
          latest.scrollHeight - latest.scrollTop - latest.clientHeight;
        const shouldStickRetry =
          effectiveForce ||
          host.chatUserNearBottom ||
          latestDistanceFromBottom < NEAR_BOTTOM_THRESHOLD;
        if (!shouldStickRetry) {
          return;
        }
        latest.scrollTop = latest.scrollHeight;
        host.chatUserNearBottom = true;
      }, retryDelay);
    });
  });
}

export function handleChatScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) {
    return;
  }
  const scrollTop = Math.max(0, container.scrollTop);
  const delta = scrollTop - host.chatLastScrollTop;
  host.chatLastScrollTop = scrollTop;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.chatUserNearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
  const hasUsefulScroll = container.scrollHeight - container.clientHeight > NEAR_BOTTOM_THRESHOLD;

  if (!hasUsefulScroll || scrollTop <= HEADER_SHOW_TOP_THRESHOLD || host.chatUserNearBottom) {
    host.chatHeaderControlsHidden = false;
  } else if (delta > HEADER_HIDE_SCROLL_DELTA) {
    host.chatHeaderControlsHidden = true;
  } else if (delta < -HEADER_HIDE_SCROLL_DELTA) {
    host.chatHeaderControlsHidden = false;
  }

  // Clear the "new messages below" indicator when user scrolls back to bottom.
  if (host.chatUserNearBottom) {
    host.chatNewMessagesBelow = false;
  }
}

export function resetChatScroll(host: ScrollHost) {
  host.chatHasAutoScrolled = false;
  host.chatUserNearBottom = true;
  host.chatLastScrollTop = 0;
  host.chatHeaderControlsHidden = false;
  host.chatNewMessagesBelow = false;
}
