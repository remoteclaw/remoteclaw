// Fork-owned Control UI shell scroll helpers.
//
// The ADR-0023 move mapped ui/src/ui/app-scroll.ts onto upstream's
// ui/src/pages/chat/scroll.ts, which is chat-only. These logs/activity/topbar
// helpers have no upstream counterpart and are still called by the fork shell
// (app.ts, app-lifecycle.ts, app-settings.ts, app-chat.ts).

export type ScrollHost = {
  updateComplete: Promise<unknown>;
  querySelector: (selectors: string) => Element | null;
  style: CSSStyleDeclaration;
  chatScrollFrame: number | null;
  chatScrollTimeout: number | null;
  chatLastScrollTop: number;
  chatHasAutoScrolled: boolean;
  chatUserNearBottom: boolean;
  chatHeaderControlsHidden: boolean;
  chatNewMessagesBelow: boolean;
  logsScrollFrame: number | null;
  logsAtBottom: boolean;
  activityScrollFrame?: number | null;
  activityAutoFollow?: boolean;
  activityAtBottom?: boolean;
  topbarObserver: ResizeObserver | null;
};

function queryHost(host: Partial<ScrollHost>, selectors: string): Element | null {
  return typeof host.querySelector === "function" ? host.querySelector(selectors) : null;
}

export function scheduleLogsScroll(host: ScrollHost, force = false) {
  if (host.logsScrollFrame) {
    cancelAnimationFrame(host.logsScrollFrame);
  }
  void host.updateComplete.then(() => {
    host.logsScrollFrame = requestAnimationFrame(() => {
      host.logsScrollFrame = null;
      const container = queryHost(host, ".log-stream") as HTMLElement | null;
      if (!container) {
        return;
      }
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = force || distanceFromBottom < 80;
      if (!shouldStick) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    });
  });
}

export function scheduleActivityScroll(host: ScrollHost, force = false) {
  if (host.activityScrollFrame) {
    cancelAnimationFrame(host.activityScrollFrame);
  }
  void host.updateComplete.then(() => {
    host.activityScrollFrame = requestAnimationFrame(() => {
      host.activityScrollFrame = null;
      const container = queryHost(host, ".activity-stream") as HTMLElement | null;
      if (!container) {
        return;
      }
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick =
        force ||
        (host.activityAutoFollow !== false &&
          (host.activityAtBottom !== false || distanceFromBottom < 120));
      if (!shouldStick) {
        return;
      }
      container.scrollTop = container.scrollHeight;
      host.activityAtBottom = true;
    });
  });
}

export function handleLogsScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) {
    return;
  }
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.logsAtBottom = distanceFromBottom < 80;
}

export function handleActivityScroll(host: ScrollHost, event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) {
    return;
  }
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  host.activityAtBottom = distanceFromBottom < 120;
}

export function exportLogs(lines: string[], label: string) {
  if (lines.length === 0) {
    return;
  }
  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `remoteclaw-logs-${label}-${stamp}.log`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function observeTopbar(host: ScrollHost) {
  if (typeof ResizeObserver === "undefined") {
    return;
  }
  const topbar = queryHost(host, ".topbar");
  if (!topbar) {
    return;
  }
  const update = () => {
    const { height } = topbar.getBoundingClientRect();
    host.style.setProperty("--topbar-height", `${height}px`);
  };
  update();
  host.topbarObserver = new ResizeObserver(() => update());
  host.topbarObserver.observe(topbar);
}
