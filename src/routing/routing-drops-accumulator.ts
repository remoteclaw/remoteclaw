import { onDiagnosticEvent } from "../infra/diagnostic-events.js";

export type RoutingDropCounts = {
  total: number;
  byChannel: Record<string, number>;
  byReason: Record<string, number>;
};

type AccumulatorState = {
  total: number;
  byChannel: Map<string, number>;
  byReason: Map<string, number>;
  unsubscribe: (() => void) | null;
};

function getAccumulatorState(): AccumulatorState {
  const globalStore = globalThis as typeof globalThis & {
    __remoteclawRoutingDropsState?: AccumulatorState;
  };
  if (!globalStore.__remoteclawRoutingDropsState) {
    globalStore.__remoteclawRoutingDropsState = {
      total: 0,
      byChannel: new Map<string, number>(),
      byReason: new Map<string, number>(),
      unsubscribe: null,
    };
  }
  return globalStore.__remoteclawRoutingDropsState;
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Subscribe the accumulator to the diagnostic event bus. Called once at
 * application startup. Subsequent calls are no-ops (idempotent).
 */
export function installRoutingDropsAccumulator(): () => void {
  const state = getAccumulatorState();
  if (state.unsubscribe) {
    return state.unsubscribe;
  }
  const unsubscribe = onDiagnosticEvent((evt) => {
    if (evt.type !== "routing.drop") {
      return;
    }
    state.total += 1;
    incrementMap(state.byChannel, evt.channel || "unknown");
    incrementMap(state.byReason, evt.reason || "unknown");
  });
  state.unsubscribe = () => {
    unsubscribe();
    state.unsubscribe = null;
  };
  return state.unsubscribe;
}

/**
 * Snapshot of rolling routing-drop counts since process start (or last reset).
 * Consumed by the `/remoteclaw status` command to surface operator-visible
 * drop totals.
 */
export function getRoutingDropCounts(): RoutingDropCounts {
  const state = getAccumulatorState();
  return {
    total: state.total,
    byChannel: Object.fromEntries(state.byChannel),
    byReason: Object.fromEntries(state.byReason),
  };
}

/** @internal Reset accumulator for tests. */
export function resetRoutingDropsAccumulatorForTest(): void {
  const state = getAccumulatorState();
  if (state.unsubscribe) {
    state.unsubscribe();
  }
  state.total = 0;
  state.byChannel.clear();
  state.byReason.clear();
  state.unsubscribe = null;
}
