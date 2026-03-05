import { appendFile, readFile } from "node:fs/promises";
import type { McpMessageTarget, McpSideEffects } from "./types.js";

// NDJSON side effect record types
type MessageSentRecord = {
  type: "message_sent";
  tool: string;
  provider: string;
  accountId?: string;
  to?: string;
  text: string;
  mediaUrl: string | null;
  ts: number;
};

type CronAddedRecord = {
  type: "cron_added";
  jobId?: string;
  ts: number;
};

type HeartbeatReportRecord = {
  type: "heartbeat_report";
  anythingDone: boolean;
  summary?: string | null;
  ts: number;
};

type SideEffectRecord = MessageSentRecord | CronAddedRecord | HeartbeatReportRecord;

export class McpSideEffectsWriter {
  constructor(private readonly filePath: string) {}

  async recordMessageSent(params: {
    tool: string;
    provider: string;
    accountId?: string;
    to?: string;
    text: string;
    mediaUrl?: string;
  }): Promise<void> {
    const record: MessageSentRecord = {
      type: "message_sent",
      tool: params.tool,
      provider: params.provider,
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.to ? { to: params.to } : {}),
      text: params.text,
      mediaUrl: params.mediaUrl ?? null,
      ts: Date.now(),
    };
    await this.appendRecord(record);
  }

  async recordCronAdd(jobId?: string): Promise<void> {
    const record: CronAddedRecord = {
      type: "cron_added",
      ...(jobId ? { jobId } : {}),
      ts: Date.now(),
    };
    await this.appendRecord(record);
  }

  async recordHeartbeatReport(params: {
    anythingDone: boolean;
    summary?: string | null;
  }): Promise<void> {
    const record: HeartbeatReportRecord = {
      type: "heartbeat_report",
      anythingDone: params.anythingDone,
      ...(params.summary != null ? { summary: params.summary } : {}),
      ts: Date.now(),
    };
    await this.appendRecord(record);
  }

  private async appendRecord(record: SideEffectRecord): Promise<void> {
    await appendFile(this.filePath, JSON.stringify(record) + "\n", "utf-8");
  }
}

export async function readMcpSideEffects(filePath: string): Promise<McpSideEffects> {
  const result: McpSideEffects = {
    sentTexts: [],
    sentMediaUrls: [],
    sentTargets: [],
    cronAdds: 0,
  };

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return result;
  }

  const lines = content.split("\n").filter(Boolean);
  for (const line of lines) {
    let record: SideEffectRecord;
    try {
      record = JSON.parse(line) as SideEffectRecord;
    } catch {
      continue; // skip malformed lines
    }

    if (record.type === "message_sent") {
      result.sentTexts.push(record.text);
      if (record.mediaUrl) {
        result.sentMediaUrls.push(record.mediaUrl);
      }
      const target: McpMessageTarget = {
        tool: record.tool,
        provider: record.provider,
        ...(record.accountId ? { accountId: record.accountId } : {}),
        ...(record.to ? { to: record.to } : {}),
      };
      result.sentTargets.push(target);
    } else if (record.type === "cron_added") {
      result.cronAdds += 1;
    } else if (record.type === "heartbeat_report") {
      // Last heartbeat_report wins if called multiple times.
      result.heartbeatReport = {
        anythingDone: record.anythingDone,
        summary: record.summary,
      };
    }
  }

  return result;
}
