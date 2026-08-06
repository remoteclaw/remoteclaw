---
summary: "Twilio SMS channel setup, access controls, and webhook configuration"
read_when:
  - You want to connect RemoteClaw to SMS through Twilio
  - You need SMS webhook or allowlist setup
title: "SMS"
---

RemoteClaw can receive and send SMS through a Twilio phone number or Messaging Service. The Gateway registers an inbound webhook route, validates Twilio request signatures by default, and sends replies back through Twilio's Messages API.

SMS defers sender-initiated self-enrollment — no pairing challenge is sent to an unknown number. Authorize senders by adding their number to `allowFrom` before they message.

<CardGroup cols={3}>
  <Card title="Sender access" icon="link" href="#access-control">
    SMS senders are pre-approved through `allowFrom`. There is no self-enrollment.
  </Card>
  <Card title="Gateway security" icon="shield" href="/gateway/security">
    Review webhook exposure and sender access controls.
  </Card>
  <Card title="Channel troubleshooting" icon="wrench" href="/channels/troubleshooting">
    Cross-channel diagnostics and repair playbooks.
  </Card>
</CardGroup>

## Before you begin

You need:

- The bundled SMS plugin enabled with `remoteclaw plugins enable sms`.
- A Twilio account with an SMS-capable phone number, or a Twilio Messaging Service.
- The Twilio Account SID and Auth Token.
- A public HTTPS URL that reaches your RemoteClaw Gateway.
- The E.164 phone number of every sender you want to authorize. SMS has no self-enrollment step, so a sender that is not listed in `allowFrom` is dropped silently under every policy except `open`. Use `allowlist` for a private number, or `open` only for intentionally public SMS access.

Use one Twilio number for both SMS and Voice Call if the number has both capabilities. Configure the SMS webhook and Voice webhook separately in Twilio; this page only covers the SMS webhook.

## Quick Setup

<Steps>
  <Step title="Enable the bundled plugin">
    ```bash
    remoteclaw plugins enable sms
    ```
  </Step>
  <Step title="Create or choose a Twilio sender">
    In Twilio, open **Phone Numbers > Manage > Active numbers** and choose an SMS-capable number. Save:

    - Account SID, for example `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
    - Auth Token
    - Sender phone number, for example `+15551234567`

    If you use a Messaging Service instead of a fixed sender number, save the Messaging Service SID, for example `MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

  </Step>

  <Step title="Configure the SMS channel">

Save this as `sms.patch.json5` and change the placeholders. `allowFrom` holds the phone numbers you authorize to talk to the agent — put your own phone number there:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "twilio-auth-token",
      fromNumber: "+15551234567",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
      dmPolicy: "allowlist",
      allowFrom: ["+15557654321"],
    },
  },
}
```

Apply it:

```bash
remoteclaw config patch --file ./sms.patch.json5 --dry-run
remoteclaw config patch --file ./sms.patch.json5
```

  </Step>

  <Step title="Point Twilio at the Gateway webhook">
    In the Twilio phone number settings, open **Messaging** and set **A message comes in** to:

```text
https://gateway.example.com/webhooks/sms
```

    Use HTTP `POST`. The default local path is `/webhooks/sms`; change `channels.sms.webhookPath` if you need a different route.

  </Step>

  <Step title="Expose the exact SMS webhook path">
    Your public URL must route the SMS path to the Gateway process. If you use Tailscale Funnel for local testing, expose `/webhooks/sms` explicitly:

```bash
tailscale funnel --bg --set-path /webhooks/sms http://127.0.0.1:<gateway-port>/webhooks/sms
tailscale funnel status
```

    Voice Call and SMS use separate webhook paths. If the same Twilio number handles both, keep both routes configured in Twilio and in your tunnel.

  </Step>

  <Step title="Start the Gateway and message from a pre-approved number">

Confirm the sending number is already listed in `channels.sms.allowFrom` from the previous step. A number that is not listed is dropped silently, so authorize it before you test.

```bash
remoteclaw gateway
```

Send a text message to the Twilio number **from the number you put in `allowFrom`**, and confirm the agent replies.

  </Step>
</Steps>

## Configuration Examples

### Config file

Use config-file setup when you want the channel definition to travel with the Gateway config:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "twilio-auth-token",
      fromNumber: "+15551234567",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
      dmPolicy: "allowlist",
      allowFrom: ["+15557654321"],
    },
  },
}
```

### Environment variables

Use env setup for single-account deployments where secrets come from the host environment:

```bash
export TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export TWILIO_AUTH_TOKEN="<twilio-auth-token>"
export TWILIO_PHONE_NUMBER="+15551234567"
export SMS_PUBLIC_WEBHOOK_URL="https://gateway.example.com/webhooks/sms"
export SMS_ALLOWED_USERS="+15557654321"
```

Then enable the channel in config:

```json5
{
  channels: {
    sms: {
      enabled: true,
      dmPolicy: "allowlist",
    },
  },
}
```

`SMS_ALLOWED_USERS` is a comma-separated list of authorized senders. It is a fallback for the default account only: when `channels.sms.allowFrom` is present in config it wins, and named entries under `channels.sms.accounts` must set `allowFrom` in config.

`TWILIO_SMS_FROM` is accepted as an alias for `TWILIO_PHONE_NUMBER`. Use `TWILIO_MESSAGING_SERVICE_SID` instead of a phone-number sender when Twilio should choose the sender from a Messaging Service.

### SecretRef auth token

`authToken` can be a SecretRef. Use this when the Gateway should resolve the Twilio Auth Token from the RemoteClaw secrets runtime instead of storing plaintext config:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: { source: "env", provider: "default", id: "TWILIO_AUTH_TOKEN" },
      fromNumber: "+15551234567",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
      dmPolicy: "pairing",
      allowFrom: ["+15557654321"],
    },
  },
}
```

The referenced environment variable or secret provider must be visible to the Gateway runtime. Restart managed Gateway processes after changing host environment variables.

### Allowlist-only private number

This is the recommended onboarding pattern for a private assistant. Use `allowlist` when only known phone numbers should be able to talk to the agent, and add every authorized sender to `allowFrom` before they message:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "twilio-auth-token",
      fromNumber: "+15551234567",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
      dmPolicy: "allowlist",
      allowFrom: ["+15557654321"],
    },
  },
}
```

### Messaging Service sender

Use `messagingServiceSid` instead of `fromNumber` when Twilio should choose the sender through a Messaging Service:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "twilio-auth-token",
      messagingServiceSid: "MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
      dmPolicy: "pairing",
      allowFrom: ["+15557654321"],
    },
  },
}
```

If both `fromNumber` and `messagingServiceSid` are present after config and env resolution, `fromNumber` is used.

### Default outbound target

Set `defaultTo` when automation or agent-initiated delivery should have a default destination if a send flow omits an explicit target:

```json5
{
  channels: {
    sms: {
      enabled: true,
      accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      authToken: "twilio-auth-token",
      fromNumber: "+15551234567",
      defaultTo: "+15557654321",
      publicWebhookUrl: "https://gateway.example.com/webhooks/sms",
    },
  },
}
```

## Access control

`channels.sms.dmPolicy` controls direct SMS access:

- `pairing` (default — for SMS this authorizes from `allowFrom` only; see below)
- `allowlist` (requires at least one sender in `allowFrom`)
- `open` (requires `allowFrom` to include `"*"`)
- `disabled`

`allowFrom` entries should be E.164 phone numbers such as `+15551234567`. `sms:` prefixes are accepted and normalized. For a private assistant, prefer `dmPolicy: "allowlist"` with explicit phone numbers.

Senders are pre-approved by the operator. SMS does not run a sender-initiated pairing exchange: an inbound message from an unlisted number never creates a pairing request, so there is no code for `remoteclaw pairing approve sms` to approve. `allowFrom` is what authorizes a sender, and it is honored under the default `pairing` policy exactly as it is under `allowlist` — the practical difference is that `allowlist` declares the intent explicitly.

Under every policy except `open`, a message from a number that is not in `allowFrom` is dropped silently: the Gateway acknowledges Twilio, and nothing is sent back to the sender. That is deliberate — an SMS reply is billable to the operator, so an unauthorized sender must not be able to trigger any outbound message.

## Sending SMS

Outbound SMS targets use the `sms:` service prefix with the SMS channel selected:

```bash
remoteclaw message send --channel sms --target sms:+15551234567 --message "hello"
```

When channel selection is implicit, `twilio-sms:+15551234567` selects this channel without taking over the existing channel-owned `sms:` service prefix used by iMessage.

```bash
remoteclaw message send --target twilio-sms:+15551234567 --message "hello"
```

The CLI requires an explicit `--target`. `defaultTo` is for automation and agent-initiated delivery paths where the target can be resolved from channel config.

Agent replies from inbound SMS conversations automatically go back to the sender through the configured Twilio sender.

SMS output is plain text. RemoteClaw strips markdown, flattens fenced code blocks, preserves readable links, and chunks long replies before sending them through Twilio.

## Verify Setup

After the Gateway starts:

1. Confirm the Gateway log shows the SMS webhook route.
2. Run a Twilio-side probe:

```bash
remoteclaw channels capabilities --channel sms
remoteclaw channels status --channel sms --probe --json
```

3. Confirm the number you are about to text from is listed in `channels.sms.allowFrom` (or in `SMS_ALLOWED_USERS`).
4. Send an SMS to the Twilio number from that pre-approved number.
5. Confirm the agent replies.

For outbound-only testing, use:

```bash
remoteclaw message send --channel sms --target sms:+15557654321 --message "RemoteClaw SMS test"
```

### End-to-end test from macOS iMessage/SMS

On a Mac that can send carrier SMS through Messages, you can use `imsg` to drive the sender side without touching your phone.

Add the Mac's sending number to `channels.sms.allowFrom` first — an unlisted sender is dropped silently, so an unauthorized run looks identical to a broken webhook:

```json5
{
  channels: {
    sms: {
      dmPolicy: "allowlist",
      allowFrom: ["+15557654321"],
    },
  },
}
```

Then send:

```bash
imsg send --to "+15551234567" --service sms --text "reply exactly SMS pong" --json
```

The message should receive the agent reply through Twilio.

## Webhook security

By default, RemoteClaw validates `X-Twilio-Signature` using `publicWebhookUrl` and `authToken`. Keep `publicWebhookUrl` byte-for-byte aligned with the URL configured in Twilio, including scheme, host, path, and query string.

For local tunnel testing only, you can set:

```json5
{
  channels: {
    sms: {
      dangerouslyDisableSignatureValidation: true,
    },
  },
}
```

Do not use disabled signature validation on a public Gateway.

## Multi-account config

Use `accounts` when you operate more than one Twilio number:

```json5
{
  channels: {
    sms: {
      accounts: {
        support: {
          enabled: true,
          accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          authToken: "twilio-auth-token",
          fromNumber: "+15551234567",
          publicWebhookUrl: "https://gateway.example.com/webhooks/sms/support",
          webhookPath: "/webhooks/sms/support",
          dmPolicy: "allowlist",
          allowFrom: ["+15557654321"],
        },
      },
    },
  },
}
```

Each account should use a distinct `webhookPath`.

## Troubleshooting

### Twilio returns 403 or RemoteClaw rejects the webhook

Check that `publicWebhookUrl` exactly matches the URL configured in Twilio, including scheme, host, path, and query string. Twilio signs the public URL string, so proxy rewrites and alternate hostnames can break signature validation.

### Messages are silently ignored (sender not approved)

Start here. A message from a number that is **not** in `allowFrom` is dropped silently by design: the Gateway acknowledges Twilio, nothing reaches the agent, and no reply is sent. SMS does not auto-enroll senders, so there is no pairing request to look for and nothing to approve — the absence of a reply is the expected behavior, not a webhook fault.

The fix is to authorize the number, not to debug the webhook:

```json5
{
  channels: {
    sms: {
      dmPolicy: "allowlist",
      allowFrom: ["+15557654321"],
    },
  },
}
```

Confirm the number is in E.164 form and matches the sender exactly, then restart the Gateway. Check the Gateway log for a `dropped unauthorized inbound` line, which names the sender and the policy that rejected it.

### Messages from an approved number don't arrive

Once the sender is in `allowFrom` and its messages still produce nothing, the inbound webhook itself is the suspect. Check the Twilio number's **Messaging** webhook URL and method. It must point to the SMS webhook URL and use `POST`. Also confirm the Gateway is reachable from the public internet or through your tunnel.

If the Twilio message log shows error `11200`, Twilio accepted the inbound SMS but could not reach your webhook. Check:

- Twilio **Messaging > A message comes in** points at `publicWebhookUrl`.
- The method is `POST`.
- The tunnel or reverse proxy exposes the exact `webhookPath`; for Tailscale Funnel, run `tailscale funnel status` and confirm `/webhooks/sms` is listed.
- `publicWebhookUrl` uses the same scheme, host, path, and query string Twilio sends, so signature validation can reproduce the signed URL.

### Outbound sends fail

Confirm `accountSid`, `authToken`, and either `fromNumber` or `messagingServiceSid` are resolved. If you use a trial Twilio account, the destination number may need to be verified in Twilio before outbound SMS will send.

### Messages arrive but the agent does not answer

Check `dmPolicy` and `allowFrom`. Every policy except `open` requires the sender to be listed in `allowFrom` before agent turns are processed, and an unlisted sender is dropped without a reply — see [Messages are silently ignored](#messages-are-silently-ignored-sender-not-approved).
