// Re-export from src/web/ for cherry-pick compatibility
export {
  DEFAULT_WHATSAPP_MEDIA_MAX_MB,
  listWhatsAppAccountIds,
  resolveDefaultWhatsAppAccountId,
  listWhatsAppAuthDirs,
  hasAnyWhatsAppAuth,
  resolveWhatsAppAuthDir,
  resolveWhatsAppAccount,
  resolveWhatsAppMediaMaxBytes,
  listEnabledWhatsAppAccounts,
} from "../../../src/web/accounts.js";
export type { ResolvedWhatsAppAccount } from "../../../src/web/accounts.js";
