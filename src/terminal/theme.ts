import chalk, { Chalk } from "chalk";
import { PALETTE } from "./palette.js";

const hasForceColor =
  typeof process.env.FORCE_COLOR === "string" &&
  process.env.FORCE_COLOR.trim().length > 0 &&
  process.env.FORCE_COLOR.trim() !== "0";

const baseChalk = process.env.NO_COLOR && !hasForceColor ? new Chalk({ level: 0 }) : chalk;

const hex = (value: string) => baseChalk.hex(value);

export const theme = {
  accent: hex(PALETTE.accent),
  accentBright: hex(PALETTE.accentBright),
  accentDim: hex(PALETTE.accentDim),
  info: hex(PALETTE.info),
  success: hex(PALETTE.success),
  warn: hex(PALETTE.warn),
  error: hex(PALETTE.error),
  muted: hex(PALETTE.muted),
  heading: baseChalk.bold.hex(PALETTE.accent),
  command: hex(PALETTE.accentBright),
  option: hex(PALETTE.warn),
} as const;

export const isRich = () => Boolean(baseChalk.level > 0);

export const colorize = (rich: boolean, color: (value: string) => string, value: string) =>
  rich ? color(value) : value;
