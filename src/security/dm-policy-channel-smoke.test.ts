import { describe, expect, it } from "vitest";
import { isAllowedBlueBubblesSender } from "../../extensions/bluebubbles/src/targets.js";
import { isSignalSenderAllowed, type SignalSender } from "../signal/identity.js";
import { DM_GROUP_ACCESS_REASON, resolveDmGroupAccessWithLists } from "./dm-policy-shared.js";

/** Inline mattermost sender check — fork equivalent of upstream monitor-auth.ts */
function isMattermostSenderAllowed(params: {
  senderId: string;
  senderName?: string;
  allowFrom: string[];
  allowNameMatching?: boolean;
}): boolean {
  if (params.allowFrom.length === 0) {
    return false;
  }
  if (params.allowFrom.includes("*")) {
    return true;
  }
  const normalizedId = params.senderId
    .replace(/^(mattermost|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
  return params.allowFrom.some((entry) => {
    const normalizedEntry = entry
      .replace(/^(mattermost|user):/i, "")
      .replace(/^@/, "")
      .toLowerCase();
    if (normalizedEntry === normalizedId) {
      return true;
    }
    if (!params.allowNameMatching || !params.senderName) {
      return false;
    }
    const normalizedName = params.senderName.replace(/^@/, "").toLowerCase();
    return normalizedEntry === normalizedName;
  });
}

type ChannelSmokeCase = {
  name: string;
  storeAllowFrom: string[];
  isSenderAllowed: (allowFrom: string[]) => boolean;
};

const signalSender: SignalSender = {
  kind: "phone",
  raw: "+15550001111",
  e164: "+15550001111",
};

const cases: ChannelSmokeCase[] = [
  {
    name: "bluebubbles",
    storeAllowFrom: ["attacker-user"],
    isSenderAllowed: (allowFrom) =>
      isAllowedBlueBubblesSender({
        allowFrom,
        sender: "attacker-user",
        chatId: 101,
      }),
  },
  {
    name: "signal",
    storeAllowFrom: [signalSender.e164],
    isSenderAllowed: (allowFrom) => isSignalSenderAllowed(signalSender, allowFrom),
  },
  {
    name: "mattermost",
    storeAllowFrom: ["user:attacker-user"],
    isSenderAllowed: (allowFrom) =>
      isMattermostSenderAllowed({
        senderId: "attacker-user",
        senderName: "Attacker",
        allowFrom,
      }),
  },
];

describe("security/dm-policy-shared channel smoke", () => {
  for (const testCase of cases) {
    for (const ingress of ["message", "reaction"] as const) {
      it(`[${testCase.name}] blocks group ${ingress} when sender is only in pairing store`, () => {
        const access = resolveDmGroupAccessWithLists({
          isGroup: true,
          dmPolicy: "pairing",
          groupPolicy: "allowlist",
          allowFrom: ["owner-user"],
          groupAllowFrom: ["group-owner"],
          storeAllowFrom: testCase.storeAllowFrom,
          isSenderAllowed: testCase.isSenderAllowed,
        });
        expect(access.decision).toBe("block");
        expect(access.reasonCode).toBe(DM_GROUP_ACCESS_REASON.GROUP_POLICY_NOT_ALLOWLISTED);
        expect(access.reason).toBe("groupPolicy=allowlist (not allowlisted)");
      });
    }
  }
});
