---
summary: "Outbound delivery guarantees, the needs-review reconciliation queue, and what backups of it contain"
read_when:
  - Reasoning about duplicate or missing outbound messages
  - Taking, restoring, or storing backups of the state directory
  - Reconciling entries in delivery-queue/needs-review
title: "Message delivery"
---

# Message delivery

## Delivery guarantee: at-least-once

RemoteClaw delivers outbound messages **at least once**.

It does **not** provide exactly-once delivery, and it cannot. The acknowledgement
that a message reached a third-party chat platform travels back over the same
unreliable link the message went out on, so there is no bookkeeping on the
gateway side that makes "the platform accepted it" and "we recorded that it
accepted it" one atomic fact. That is the Two Generals problem — it is a property
of talking to a system we do not control, not a gap a better queue closes.

Practical consequences:

- **A message can be delivered more than once.** Assume it, and design around it.
- **Idempotency and de-duplication belong to the consumer and the platform.**
  RemoteClaw does not attach an idempotency key to outbound sends, so nothing
  downstream can collapse a duplicate on your behalf. If a workflow reacts to
  agent output, make the reaction idempotent.
- **The duplicate window is bounded and surfaced, not eliminated.** The gateway
  narrows it in two places and makes what survives visible rather than silent:
  - a per-entry in-flight marker means a process that dies mid-send does not
    blind-replay on the next start;
  - a send that fails ambiguously — a timeout, a reset, a 5xx after the request
    reached the transport — is not retried either, because "we got no result" is
    not "nothing arrived".

  In both cases the entry is moved to a quarantine directory for a human instead
  of being re-sent. Failures that provably did **not** reach the recipient (the
  connection was refused, the name did not resolve, the platform rejected the
  chat outright, or the send never started) still retry normally.

  This applies to **both** senders — the live send, and the retry the recovery
  pass makes on its own at startup — and to **both** ways a send can fail:
  raising an error, or, under `bestEffort`, reporting each payload's failure and
  returning. All four combinations classify with the same predicate, so an
  ambiguous failure is quarantined whichever one hit it. A recovery retry that
  times out after reaching the wire is held for review rather than replayed on
  the next restart, and so is a `bestEffort` recovery retry whose payloads
  failed that way with nothing landed.

  One residual window remains: the in-flight marker is written with an atomic
  rename but is not flushed to stable storage, so a power loss can take the
  marker with it and a post-reboot recovery pass has nothing left to refuse.

## The `needs-review` reconciliation queue

Entries whose delivery outcome cannot be determined are moved to:

```text
$REMOTECLAW_STATE_DIR/delivery-queue/needs-review/<id>.json
```

They are **never retried automatically**. Every recovery pass — that is, every
gateway start — logs the standing backlog, so quarantined mail stays visible long
after the start that quarantined it.

To reconcile one:

1. Open the entry and read `to`, `payloads`, and `platformSendStartedAt`.
2. Check the recipient's message history around that time.
   `deliveredBeforeFailure`, when present, tells you how many message parts were
   confirmed sent before the failure — the rest are the ones in question. When it
   is absent, nothing was confirmed either way.
3. If the message arrived, delete the file.
4. If it did not and you want it sent, move the file back into
   `delivery-queue/`, set its `recoveryState` to `null` and its `retryCount` to
   `0`, then restart the gateway. Recovery only runs at startup; leaving
   `recoveryState` set only re-quarantines the entry, and leaving `retryCount` at
   its current value can file it under `failed/` without sending.

Prune reconciled entries. Nothing expires them for you, and § Backups below is
the reason that matters.

## Backups contain undelivered message content

<Warning>
  **`delivery-queue/needs-review/` holds message payloads, and it is included in
  backups.** Treat any backup of the state directory as carrying message content
  at full sensitivity — recipient identifiers and message bodies, in cleartext.
</Warning>

The rest of the delivery queue is filtered out of backups as volatile: it churns
during a live backup and has no restoration value. `needs-review/` is
deliberately carved out of that filter, because it is the opposite kind of data —
terminal, unique, and the operator's only record that a message's outcome is
undetermined. Dropping it on restore would silently erase a to-do list.

That carve-out has a cost worth stating plainly: **backups travel further than
live state.** They go off-box, to object storage or another operator's laptop,
and they are retained long after the entry they contain was reconciled. Live
state sits in a `0700` directory on one host under one trust boundary; a backup
does not.

So:

- Hold backups of the state directory to the same standard as message
  transcripts, not to the standard of configuration. Encrypt them at rest, and
  keep the retention window as short as your recovery objective allows.
- **Reconcile and prune `needs-review/` on a schedule.** An entry deleted before
  the next backup never enters the backup chain at all — this is the cheapest
  control available, and it is the same hygiene the queue already asks for.
- If you need to share a backup for support or diagnostics, remove
  `delivery-queue/needs-review/` first. Nothing in it is needed to reproduce a
  configuration problem.

Related: [Security](/gateway/security) for the on-disk trust boundary and
filesystem permissions, and [Logging](/gateway/logging) for redaction and
retention of the log surfaces that reference these entries.
