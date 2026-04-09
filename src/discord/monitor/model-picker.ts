// Stub — gutted in RemoteClaw fork (Middleware Boundary Principle)

export type DiscordModelPickerCommandContext = "model" | "models" | (string & {});

export type DiscordModelPickerData = {
  command?: string;
  userId?: string;
  action?: string;
  view?: string;
  provider?: string;
  page?: number;
  providerPage?: number;
  model?: string;
  modelIndex?: number;
  recentSlot?: number;
  providers: string[];
  byProvider: Map<string, Set<string>>;
  resolvedDefault: { provider: string; model: string };
};

export type MessagePayload = Record<string, unknown>;

export const DISCORD_MODEL_PICKER_CUSTOM_ID_KEY = "model-picker";
export const loadDiscordModelPickerData = (..._args: unknown[]): DiscordModelPickerData => ({
  providers: [],
  byProvider: new Map(),
  resolvedDefault: { provider: "", model: "" },
});
export const parseDiscordModelPickerData = (..._args: unknown[]): DiscordModelPickerData | null =>
  null;
export const renderDiscordModelPickerModelsView = (..._args: unknown[]): MessagePayload => ({});
export const renderDiscordModelPickerProvidersView = (..._args: unknown[]): MessagePayload => ({});
export const renderDiscordModelPickerRecentsView = (..._args: unknown[]): MessagePayload => ({});
export const toDiscordModelPickerMessagePayload = (..._args: unknown[]): MessagePayload => ({});
