---
summary: "Generated heading map for RemoteClaw docs pages"
read_when: "Finding which docs page covers a topic before reading the page"
title: "Docs map"
---

# RemoteClaw docs map

This file is generated from `docs/**/*.md` and `docs/**/*.mdx` headings to help agents navigate the documentation tree.
Do not edit it by hand; run `pnpm docs:map:gen`.

## auth-credential-semantics.md

- Route: /auth-credential-semantics
- Headings:
  - H2: Stable probe reason codes
  - H2: Token credentials
  - H3: Eligibility rules
  - H3: Resolution rules
  - H2: Agent copy portability
  - H2: Config-only auth routes
  - H2: Explicit auth order filtering
  - H2: Probe target resolution
  - H2: External CLI credential discovery
  - H2: OAuth SecretRef Policy Guard
  - H2: Legacy-Compatible Messaging
  - H2: Related

## automation/auth-monitoring.md

- Route: /automation/auth-monitoring
- Headings:
  - H1: Auth Monitoring

## automation/cron-jobs.md

- Route: /automation/cron-jobs
- Headings:
  - H1: Scheduled Tasks (Cron)
  - H2: Quick start
  - H2: How cron works
  - H2: Adding jobs
  - H3: Schedule types
  - H3: CLI examples
  - H2: Execution styles
  - H3: Payload options for isolated jobs
  - H2: Delivery and output
  - H2: Webhooks
  - H3: Authentication
  - H3: POST /hooks/wake
  - H3: POST /hooks/agent
  - H3: Mapped hooks (POST /hooks/\&lt;name\&gt;)
  - H3: Security
  - H2: Gmail PubSub integration
  - H3: Wizard setup (recommended)
  - H3: Gateway auto-start
  - H3: Manual one-time setup
  - H3: Gmail model override
  - H3: Test
  - H2: Managing jobs
  - H2: JSON schema for tool calls
  - H2: Configuration
  - H3: Retry policy
  - H3: Maintenance
  - H2: Troubleshooting
  - H3: Command ladder
  - H3: Cron not firing
  - H3: Cron fired but no delivery
  - H3: Heartbeat suppressed or skipped
  - H3: Timezone gotchas
  - H2: Related

## automation/cron-vs-heartbeat.md

- Route: /automation/cron-vs-heartbeat
- Headings:
  - H1: Cron vs Heartbeat

## automation/hooks.md

- Route: /automation/hooks
- Headings:
  - H1: Hooks
  - H2: Getting Oriented
  - H2: Overview
  - H2: Getting Started
  - H3: Bundled Hooks
  - H3: Onboarding
  - H3: Trust Boundary
  - H2: Hook Discovery
  - H2: Hook Packs (npm/archives)
  - H2: Hook Structure
  - H3: HOOK.md Format
  - H3: Metadata Fields
  - H3: Handler Implementation
  - H4: Event Context
  - H2: Event Types
  - H3: Command Events
  - H3: Session Events
  - H3: Agent Events
  - H3: Gateway Events
  - H3: Session Patch Events
  - H4: Session Event Context
  - H4: Example: Session Patch Logger Hook
  - H3: Message Events
  - H4: Message Event Context
  - H4: Example: Message Logger Hook
  - H3: Tool Result Hooks (Plugin API)
  - H3: Plugin Hook Events
  - H4: beforetoolcall
  - H4: beforeinstall
  - H4: Compaction lifecycle
  - H3: Complete Plugin Hook Reference
  - H4: Model and prompt hooks
  - H4: Agent lifecycle hooks
  - H4: Session lifecycle hooks
  - H4: Message flow hooks
  - H4: Tool execution hooks
  - H4: Subagent hooks
  - H4: Gateway hooks
  - H4: Install hooks
  - H3: Future Events
  - H2: Creating Custom Hooks
  - H3: 1. Choose Location
  - H3: 2. Create Directory Structure
  - H3: 3. Create HOOK.md
  - H3: 4. Create handler.ts
  - H3: 5. Enable and Test
  - H2: Configuration
  - H3: New Config Format (Recommended)
  - H3: Per-Hook Configuration
  - H3: Extra Directories
  - H3: Legacy Config Format (Still Supported)
  - H2: CLI Commands
  - H3: List Hooks
  - H3: Hook Information
  - H3: Check Eligibility
  - H3: Enable/Disable
  - H2: Bundled hook reference
  - H3: session-memory
  - H3: bootstrap-extra-files
  - H3: command-logger
  - H3: boot-md
  - H2: Best Practices
  - H3: Keep Handlers Fast
  - H3: Handle Errors Gracefully
  - H3: Filter Events Early
  - H3: Use Specific Event Keys
  - H2: Debugging
  - H3: Enable Hook Logging
  - H3: Check Discovery
  - H3: Check Registration
  - H3: Verify Eligibility
  - H2: Testing
  - H3: Gateway Logs
  - H3: Test Hooks Directly
  - H2: Architecture
  - H3: Core Components
  - H3: Discovery Flow
  - H3: Event Flow
  - H2: Troubleshooting
  - H3: Hook Not Discovered
  - H3: Hook Not Eligible
  - H3: Hook Not Executing
  - H3: Handler Errors
  - H2: Migration Guide
  - H3: From Legacy Config to Discovery
  - H2: See Also

## automation/poll.md

- Route: /automation/poll
- Headings:
  - H1: Polls

## automation/standing-orders.md

- Route: /automation/standing-orders
- Headings:
  - H1: Standing Orders
  - H2: Why Standing Orders?
  - H2: How They Work
  - H2: Anatomy of a Standing Order
  - H2: Standing Orders + Cron Jobs
  - H2: Examples
  - H3: Example 1: Content &amp; Social Media (Weekly Cycle)
  - H3: Example 2: Finance Operations (Event-Triggered)
  - H3: Example 3: Monitoring &amp; Alerts (Continuous)
  - H2: The Execute-Verify-Report Pattern
  - H2: Multi-Program Architecture
  - H2: Best Practices
  - H3: Do
  - H3: Avoid
  - H2: Related

## automation/taskflow.md

- Route: /automation/taskflow
- Headings:
  - H1: Task Flow
  - H2: Sync modes
  - H2: Durable state and revision tracking
  - H2: CLI commands
  - H2: How flows relate to tasks
  - H2: Related

## automation/troubleshooting.md

- Route: /automation/troubleshooting
- Headings:
  - H1: Automation Troubleshooting

## automation/webhook.md

- Route: /automation/webhook
- Headings:
  - H1: Webhooks

## brave-search.md

- Route: /brave-search
- Headings:
  - H2: Related

## channels/access-groups.md

- Route: /channels/access-groups
- Headings:
  - H2: Static message sender groups
  - H2: Reference groups from allowlists
  - H2: Supported message-channel paths
  - H2: Discord channel audiences
  - H2: Plugin diagnostics
  - H2: Security notes
  - H2: Troubleshooting

## channels/ambient-room-events.md

- Route: /channels/ambient-room-events
- Headings:
  - H2: Recommended setup
  - H2: What changes
  - H2: Discord example
  - H2: Slack example
  - H2: Telegram example
  - H2: Agent specific policy
  - H2: Visible reply modes
  - H2: History
  - H2: Troubleshooting
  - H2: Related

## channels/bluebubbles.md

- Route: /channels/bluebubbles
- Headings:
  - H2: Overview
  - H2: Quick start
  - H2: Keeping Messages.app alive (VM / headless setups)
  - H2: Onboarding
  - H2: Access control (DMs + groups)
  - H3: Contact name enrichment (macOS, optional)
  - H3: Mention gating (groups)
  - H3: Command gating
  - H3: Per-group system prompt
  - H4: Worked example: threaded replies and tapback reactions (Private API)
  - H2: ACP conversation bindings
  - H2: Typing + read receipts
  - H2: Advanced actions
  - H3: Message IDs (short vs full)
  - H2: Coalescing split-send DMs (command + URL in one composition)
  - H3: Scenarios and what the agent sees
  - H3: Split-send coalescing troubleshooting
  - H2: Block streaming
  - H2: Media + limits
  - H2: Configuration reference
  - H2: Addressing / delivery targets
  - H3: iMessage vs SMS routing
  - H2: Security
  - H2: Troubleshooting
  - H2: Related

## channels/bot-loop-protection.md

- Route: /channels/bot-loop-protection
- Headings:
  - H2: Defaults
  - H2: Configure shared defaults
  - H2: Override per channel, account, or room
  - H2: Channel support

## channels/broadcast-groups.md

- Route: /channels/broadcast-groups
- Headings:
  - H2: Overview
  - H2: Use cases
  - H2: Configuration
  - H3: Basic setup
  - H3: Processing strategy
  - H3: Complete example
  - H2: How it works
  - H3: Message flow
  - H3: Session isolation
  - H3: Example: isolated sessions
  - H2: Best practices
  - H2: Compatibility
  - H3: Providers
  - H3: Routing
  - H2: Troubleshooting
  - H2: Examples
  - H2: API reference
  - H3: Config schema
  - H3: Fields
  - H2: Limitations
  - H2: Future enhancements
  - H2: Related

## channels/channel-routing.md

- Route: /channels/channel-routing
- Headings:
  - H1: Channels &amp; routing
  - H2: Key terms
  - H2: Outbound target prefixes
  - H2: Session key shapes (examples)
  - H2: Main DM route pinning
  - H2: Guarded inbound recording
  - H2: Routing rules (how an agent is chosen)
  - H2: Broadcast groups (run multiple agents)
  - H2: Config overview
  - H2: Session storage
  - H2: WebChat behavior
  - H2: Reply context
  - H2: Related

## channels/clickclack.md

- Route: /channels/clickclack
- Headings:
  - H2: Quick setup
  - H2: Access control
  - H3: ClickClack admits nobody until you set allowFrom
  - H3: Allowlist entries
  - H2: Multiple bots
  - H2: Reply timeout
  - H2: Targets
  - H2: Permissions
  - H2: Network posture
  - H2: Troubleshooting

## channels/discord.mdx

- Route: /channels/discord
- Headings:
  - H1: Discord (Bot API)
  - H2: Quick setup
  - H2: Recommended: Set up a guild workspace
  - H2: Runtime model
  - H2: Forum channels
  - H2: Interactive components
  - H2: Access control and routing
  - H3: Role-based agent routing
  - H2: Developer Portal setup
  - H2: Native commands and command auth
  - H2: Feature details
  - H2: Tools and action gates
  - H2: Components v2 UI
  - H2: Voice channels
  - H2: Voice messages
  - H2: Troubleshooting
  - H2: Configuration reference pointers
  - H2: Safety and operations
  - H2: Related

## channels/feishu.md

- Route: /channels/feishu
- Headings:
  - H2: Quick start
  - H2: Access control
  - H3: Direct messages
  - H3: Group chats
  - H2: Group configuration examples
  - H3: Allow all groups, no @mention required
  - H3: Allow all groups, still require @mention
  - H3: Allow specific groups only
  - H3: Restrict senders within a group
  - H2: Get group/user IDs
  - H3: Group IDs (chatid, format: ocxxx)
  - H3: User IDs (openid, format: ouxxx)
  - H2: Common commands
  - H2: Troubleshooting
  - H3: Bot does not respond in group chats
  - H3: Bot does not receive messages
  - H3: QR setup does not react in the Feishu mobile app
  - H3: App Secret leaked
  - H2: Advanced configuration
  - H3: Multiple accounts
  - H3: Message limits
  - H3: Streaming
  - H3: Quota optimization
  - H3: ACP sessions
  - H4: Persistent ACP binding
  - H4: Spawn ACP from chat
  - H3: Multi-agent routing
  - H2: Per-user agent isolation (Dynamic Agent Creation)
  - H3: Quick setup
  - H3: How it works
  - H3: Configuration options
  - H3: Session scope
  - H3: Typical multi-user deployment
  - H3: Verification
  - H3: Notes
  - H2: Configuration reference
  - H2: Supported message types
  - H3: Receive
  - H3: Send
  - H3: Threads and replies
  - H2: Related

## channels/googlechat.md

- Route: /channels/googlechat
- Headings:
  - H2: Install
  - H2: Quick setup (beginner)
  - H2: Add to Google Chat
  - H2: Public URL (Webhook-only)
  - H3: Option A: Tailscale Funnel (Recommended)
  - H3: Option B: Reverse Proxy (Caddy)
  - H3: Option C: Cloudflare Tunnel
  - H2: How it works
  - H2: Targets
  - H2: Config highlights
  - H2: Troubleshooting
  - H3: 405 Method Not Allowed
  - H3: Other issues
  - H2: Related

## channels/group-messages.md

- Route: /channels/group-messages
- Headings:
  - H2: Behavior
  - H2: Config example (WhatsApp)
  - H3: Activation command (owner-only)
  - H2: How to use
  - H2: Testing / verification
  - H2: Known considerations
  - H2: Related

## channels/groups.md

- Route: /channels/groups
- Headings:
  - H2: Beginner intro (2 minutes)
  - H2: Visible replies
  - H2: Context visibility and allowlists
  - H2: Session keys
  - H2: Pattern: personal DMs + public groups (single agent)
  - H2: Display labels
  - H2: Group policy
  - H2: Mention gating (default)
  - H2: Scope configured mention patterns
  - H2: Group/channel tool restrictions (optional)
  - H2: Group allowlists
  - H2: Activation (owner-only)
  - H2: Context fields
  - H2: iMessage specifics
  - H2: WhatsApp system prompts
  - H2: WhatsApp specifics
  - H2: Related

## channels/imessage-from-bluebubbles.md

- Route: /channels/imessage-from-bluebubbles
- Headings:
  - H2: Migration checklist
  - H2: When this migration makes sense
  - H2: What imsg does
  - H2: Before you start
  - H2: Config translation
  - H2: Group registry footgun
  - H2: Step-by-step
  - H2: Action parity at a glance
  - H2: Pairing, sessions, and ACP bindings
  - H2: No rollback channel
  - H2: Related

## channels/imessage.mdx

- Route: /channels/imessage
- Headings:
  - H1: iMessage (legacy: imsg)
  - H2: Quick setup
  - H2: Requirements and permissions (macOS)
  - H2: Access control and routing
  - H2: Deployment patterns
  - H2: Media, chunking, and delivery targets
  - H2: Config writes
  - H2: Troubleshooting
  - H2: Configuration reference pointers

## channels/index.md

- Route: /channels
- Headings:
  - H2: Delivery notes
  - H2: Supported channels
  - H2: Notes

## channels/irc.md

- Route: /channels/irc
- Headings:
  - H2: Quick start
  - H2: Connection settings
  - H2: Security defaults
  - H2: Access control
  - H3: Common gotcha: allowFrom is for DMs, not channels
  - H2: Reply triggering (mentions)
  - H2: Security note (recommended for public channels)
  - H3: Same tools for everyone in the channel
  - H3: Different tools per sender (owner gets more power)
  - H2: NickServ
  - H2: Environment variables
  - H2: Troubleshooting
  - H2: Related

## channels/line.md

- Route: /channels/line
- Headings:
  - H2: Install
  - H2: Setup
  - H2: Configure
  - H2: Access control
  - H2: Message behavior
  - H2: Channel data (rich messages)
  - H2: ACP support
  - H2: Outbound media
  - H2: Troubleshooting
  - H2: Related

## channels/location.md

- Route: /channels/location
- Headings:
  - H2: Text formatting
  - H2: Context fields
  - H2: Channel notes
  - H2: Related

## channels/matrix-migration.md

- Route: /channels/matrix-migration
- Headings:
  - H2: What the migration does automatically
  - H2: What the migration cannot do automatically
  - H2: Recommended upgrade flow
  - H2: How encrypted migration works
  - H2: Common messages and what they mean
  - H3: Upgrade and detection messages
  - H3: Encrypted-state recovery messages
  - H3: Manual recovery messages
  - H3: Custom plugin install messages
  - H2: If encrypted history still does not come back
  - H2: If you want to start fresh for future messages
  - H2: Related

## channels/matrix-presentation.md

- Route: /channels/matrix-presentation
- Headings:
  - H2: Event content
  - H2: Fallback behavior
  - H2: Supported blocks
  - H2: Interactions
  - H2: Relationship to approval metadata
  - H2: Media messages

## channels/matrix-push-rules.md

- Route: /channels/matrix-push-rules
- Headings:
  - H2: Prerequisites
  - H2: Steps
  - H2: Multi-bot notes
  - H2: Homeserver notes
  - H2: Related

## channels/matrix.md

- Route: /channels/matrix
- Headings:
  - H2: Install
  - H2: Setup
  - H3: Interactive setup
  - H3: Minimal config
  - H3: Auto-join
  - H3: Allowlist target formats
  - H3: Account ID normalization
  - H3: Cached credentials
  - H3: Environment variables
  - H2: Configuration example
  - H2: Streaming previews
  - H2: Voice messages
  - H2: Approval metadata
  - H3: Self-hosted push rules for quiet finalized previews
  - H2: Bot-to-bot rooms
  - H2: Encryption and verification
  - H3: Enable encryption
  - H3: Status and trust signals
  - H3: Verify this device with a recovery key
  - H3: Bootstrap or repair cross-signing
  - H3: Room-key backup
  - H3: Listing, requesting, and responding to verifications
  - H3: Multi-account notes
  - H2: Profile management
  - H2: Threads
  - H3: Session routing (sessionScope)
  - H3: Reply threading (threadReplies)
  - H3: Thread inheritance and slash commands
  - H2: ACP conversation bindings
  - H3: Thread binding config
  - H2: Reactions
  - H2: History context
  - H2: Context visibility
  - H2: DM and room policy
  - H2: Direct room repair
  - H2: Exec approvals
  - H2: Slash commands
  - H2: Multi-account
  - H2: Private/LAN homeservers
  - H2: Proxying Matrix traffic
  - H2: Target resolution
  - H2: Configuration reference
  - H3: Account and connection
  - H3: Encryption
  - H3: Access and policy
  - H3: Reply behavior
  - H3: Reaction settings
  - H3: Tooling and per-room overrides
  - H3: Exec approval settings
  - H2: Related

## channels/mattermost.md

- Route: /channels/mattermost
- Headings:
  - H2: Install
  - H2: Quick setup
  - H2: Native slash commands
  - H2: Environment variables (default account)
  - H2: Chat modes
  - H2: Threading and sessions
  - H2: Access control (DMs)
  - H2: Channels (groups)
  - H2: Targets for outbound delivery
  - H2: DM channel retry
  - H2: Preview streaming
  - H2: Reactions (message tool)
  - H2: Interactive buttons (message tool)
  - H3: Direct API integration (external scripts)
  - H2: Directory adapter
  - H2: Multi-account
  - H2: Troubleshooting
  - H2: Related

## channels/msteams.md

- Route: /channels/msteams
- Headings:
  - H2: Bundled plugin
  - H2: Quick setup
  - H2: Goals
  - H2: Config writes
  - H2: Access control (DMs + groups)
  - H3: How it works
  - H3: Step 1: Create Azure Bot
  - H3: Step 2: Get Credentials
  - H3: Step 3: Configure Messaging Endpoint
  - H3: Step 4: Enable Teams Channel
  - H3: Step 5: Build Teams App Manifest
  - H3: Step 6: Configure RemoteClaw
  - H3: Step 7: Run the Gateway
  - H2: Federated authentication (certificate plus managed identity)
  - H3: Option A: Certificate-based authentication
  - H3: Option B: Azure Managed Identity
  - H3: AKS Workload Identity Setup
  - H3: Auth type comparison
  - H2: Local development (tunneling)
  - H2: Testing the Bot
  - H2: Environment variables
  - H2: Member info action
  - H2: History context
  - H2: Current Teams RSC permissions (manifest)
  - H2: Example Teams manifest (redacted)
  - H3: Manifest caveats (must-have fields)
  - H3: Updating an existing app
  - H2: Capabilities: RSC only vs Graph
  - H3: With Teams RSC only (app installed, no Graph API permissions)
  - H3: With Teams RSC + Microsoft Graph Application permissions
  - H3: RSC vs Graph API
  - H2: Graph-enabled media + history (required for channels)
  - H2: Known limitations
  - H3: Webhook timeouts
  - H3: Teams cloud and service URL support
  - H3: Formatting
  - H2: Configuration
  - H2: Routing and sessions
  - H2: Reply style: threads vs posts
  - H3: Resolution precedence
  - H3: Thread context preservation
  - H2: Attachments and images
  - H2: Sending files in group chats
  - H3: Why group chats need SharePoint
  - H3: Setup
  - H3: Sharing behavior
  - H3: Fallback behavior
  - H3: Files stored location
  - H2: Polls (Adaptive Cards)
  - H2: Presentation cards
  - H2: Target formats
  - H2: Proactive messaging
  - H2: Team and Channel IDs (Common Gotcha)
  - H2: Private channels
  - H2: Troubleshooting
  - H3: Common issues
  - H3: Manifest upload errors
  - H3: RSC permissions not working
  - H2: References
  - H2: Related

## channels/nextcloud-talk.md

- Route: /channels/nextcloud-talk
- Headings:
  - H2: Bundled plugin
  - H2: Quick setup (beginner)
  - H2: Notes
  - H2: Access control (DMs)
  - H2: Rooms (groups)
  - H2: Capabilities
  - H2: Configuration reference (Nextcloud Talk)
  - H2: Related

## channels/nostr.md

- Route: /channels/nostr
- Headings:
  - H2: Bundled plugin
  - H3: Older/custom installs
  - H3: Non-interactive setup
  - H2: Quick setup
  - H2: Configuration reference
  - H2: Profile metadata
  - H2: Access control
  - H3: DM policies
  - H3: Allowlist example
  - H2: Key formats
  - H2: Relays
  - H2: Protocol support
  - H2: Testing
  - H3: Local relay
  - H3: Manual test
  - H2: Troubleshooting
  - H3: Not receiving messages
  - H3: Not sending responses
  - H3: Duplicate responses
  - H2: Security
  - H2: Limitations (MVP)
  - H2: Related

## channels/pairing.md

- Route: /channels/pairing
- Headings:
  - H2: 1) DM pairing (inbound chat access)
  - H3: Approve a sender
  - H3: Reusable sender groups
  - H3: Where the state lives
  - H2: 2) Node device pairing (iOS/Android/macOS/headless nodes)
  - H3: Pair from the Control UI (recommended)
  - H3: Pair via Telegram
  - H3: Approve a node device
  - H3: Optional trusted-CIDR node auto-approve
  - H3: Node pairing state storage
  - H3: Notes
  - H2: Related docs

## channels/qa-channel.md

- Route: /channels/qa-channel
- Headings:
  - H2: What it does
  - H2: Config
  - H2: Runners
  - H2: Related

## channels/qqbot.md

- Route: /channels/qqbot
- Headings:
  - H2: Install
  - H2: Setup
  - H2: Configure
  - H3: Multi-account setup
  - H3: Group chats
  - H3: Voice (STT / TTS)
  - H2: Target formats
  - H2: Slash commands
  - H2: Engine architecture
  - H2: QR-code onboarding
  - H2: Troubleshooting
  - H2: Related

## channels/signal.md

- Route: /channels/signal
- Headings:
  - H2: Prerequisites
  - H2: Quick setup (beginner)
  - H2: What it is
  - H2: Config writes
  - H2: The number model (important)
  - H2: Setup path A: link existing Signal account (QR)
  - H2: Setup path B: register dedicated bot number (SMS, Linux)
  - H2: External daemon mode (httpUrl)
  - H2: Container mode (bbernhard/signal-cli-rest-api)
  - H2: Access control (DMs + groups)
  - H2: How it works (behavior)
  - H2: Media + limits
  - H2: Typing + read receipts
  - H2: Reactions (message tool)
  - H2: Approval reactions
  - H2: Delivery targets (CLI/cron)
  - H2: Troubleshooting
  - H2: Security notes
  - H2: Configuration reference (Signal)
  - H2: Related

## channels/slack.mdx

- Route: /channels/slack
- Headings:
  - H1: Slack
  - H2: Quick setup
  - H2: Token model
  - H2: Access control and routing
  - H2: Commands and slash behavior
  - H2: Threading, sessions, and reply tags
  - H2: Media, chunking, and delivery
  - H2: Actions and gates
  - H2: Events and operational behavior
  - H2: Ack reactions
  - H2: Manifest and scope checklist
  - H2: Troubleshooting
  - H2: Text streaming
  - H3: Requirements
  - H3: Behavior
  - H2: Configuration reference pointers
  - H2: Related

## channels/sms.md

- Route: /channels/sms
- Headings:
  - H2: Before you begin
  - H2: Quick Setup
  - H2: Configuration Examples
  - H3: Config file
  - H3: Environment variables
  - H3: SecretRef auth token
  - H3: Allowlist-only private number
  - H3: Messaging Service sender
  - H3: Default outbound target
  - H2: Access control
  - H2: Sending SMS
  - H2: Verify Setup
  - H3: End-to-end test from macOS iMessage/SMS
  - H2: Webhook security
  - H2: Multi-account config
  - H2: Troubleshooting
  - H3: Twilio returns 403 or RemoteClaw rejects the webhook
  - H3: Messages are silently ignored (sender not approved)
  - H3: Messages from an approved number don't arrive
  - H3: Outbound sends fail
  - H3: Messages arrive but the agent does not answer

## channels/synology-chat.md

- Route: /channels/synology-chat
- Headings:
  - H2: Install
  - H2: Quick setup
  - H2: Environment variables
  - H2: DM policy and access control
  - H2: Outbound delivery
  - H2: Multi-account
  - H2: Security notes
  - H2: Troubleshooting
  - H2: Related

## channels/telegram.mdx

- Route: /channels/telegram
- Headings:
  - H1: Telegram (Bot API)
  - H2: Quick setup
  - H2: Telegram side settings
  - H2: Access control and activation
  - H2: Runtime behavior
  - H2: Feature reference
  - H2: Troubleshooting
  - H2: Telegram config reference pointers
  - H2: Related

## channels/tlon.md

- Route: /channels/tlon
- Headings:
  - H2: Bundled plugin
  - H2: Setup
  - H2: Private/LAN ships
  - H2: Group channels
  - H2: Access control
  - H2: Owner and approval system
  - H2: Auto-accept settings
  - H2: Delivery targets (CLI/cron)
  - H2: Bundled skill
  - H2: Capabilities
  - H2: Troubleshooting
  - H2: Configuration reference
  - H2: Notes
  - H2: Related

## channels/troubleshooting.md

- Route: /channels/troubleshooting
- Headings:
  - H2: Command ladder
  - H2: WhatsApp
  - H3: WhatsApp failure signatures
  - H2: Telegram
  - H3: Telegram failure signatures
  - H2: Discord
  - H3: Discord failure signatures
  - H2: Slack
  - H3: Slack failure signatures
  - H2: iMessage
  - H3: iMessage failure signatures
  - H2: Signal
  - H3: Signal failure signatures
  - H2: QQ Bot
  - H3: QQ Bot failure signatures
  - H2: Matrix
  - H3: Matrix failure signatures
  - H2: Related

## channels/twitch.md

- Route: /channels/twitch
- Headings:
  - H2: Bundled plugin
  - H2: Quick setup (beginner)
  - H2: What it is
  - H2: Setup (detailed)
  - H3: Generate credentials
  - H3: Configure the bot
  - H3: Access control (recommended)
  - H2: Token refresh (optional)
  - H2: Multi-account support
  - H2: Access control
  - H2: Troubleshooting
  - H2: Config
  - H3: Account config
  - H3: Provider options
  - H2: Tool actions
  - H2: Safety and ops
  - H2: Limits
  - H2: Related

## channels/wechat.md

- Route: /channels/wechat
- Headings:
  - H2: Naming
  - H2: How it works
  - H2: Install
  - H2: Login
  - H2: Access control
  - H2: Compatibility
  - H2: Sidecar process
  - H2: Troubleshooting
  - H2: Related docs

## channels/whatsapp.mdx

- Route: /channels/whatsapp
- Headings:
  - H1: WhatsApp (Web channel)
  - H2: Quick setup
  - H2: Deployment patterns
  - H2: Runtime model
  - H2: Access control and activation
  - H2: Personal-number and self-chat behavior
  - H2: Message normalization and context
  - H2: Delivery, chunking, and media
  - H2: Acknowledgment reactions
  - H2: Multi-account and credentials
  - H2: Tools, actions, and config writes
  - H2: Troubleshooting
  - H2: Configuration reference pointers
  - H2: Related

## channels/yuanbao.md

- Route: /channels/yuanbao
- Headings:
  - H2: Quick start
  - H3: Interactive setup (alternative)
  - H2: Access control
  - H3: Direct messages
  - H3: Group chats
  - H2: Configuration examples
  - H2: Common commands
  - H2: Troubleshooting
  - H2: Advanced configuration
  - H3: Multiple accounts
  - H3: Message limits
  - H3: Streaming
  - H3: Group chat history context
  - H3: Reply-to mode
  - H3: Markdown hint injection
  - H3: Debug mode
  - H3: Multi-agent routing
  - H2: Configuration reference
  - H2: Supported message types
  - H2: Related

## channels/zalo.md

- Route: /channels/zalo
- Headings:
  - H2: Bundled plugin
  - H2: Quick setup (beginner)
  - H2: What it is
  - H2: Setup (fast path)
  - H3: 1) Create a bot token (Zalo Bot Platform)
  - H3: 2) Configure the token (env or config)
  - H2: How it works (behavior)
  - H2: Limits
  - H2: Access control (DMs)
  - H3: DM access
  - H2: Access control (Groups)
  - H2: Long-polling vs webhook
  - H2: Supported message types
  - H2: Capabilities
  - H2: Delivery targets (CLI/cron)
  - H2: Troubleshooting
  - H2: Configuration reference (Zalo)
  - H2: Related

## channels/zaloclawbot.md

- Route: /channels/zaloclawbot
- Headings:
  - H2: Compatibility
  - H2: Prerequisites
  - H2: Install with onboard (recommended)
  - H2: Manual Installation
  - H3: 1. Install the plugin
  - H3: 2. Enable the plugin in config
  - H3: 3. Generate QR code and log in
  - H3: 4. Restart the gateway
  - H2: How It Works
  - H2: Under the Hood
  - H2: Troubleshooting

## channels/zalouser.md

- Route: /channels/zalouser
- Headings:
  - H2: Bundled plugin
  - H2: Quick setup (beginner)
  - H2: What it is
  - H2: Naming
  - H2: Finding IDs (directory)
  - H2: Limits
  - H2: Access control (DMs)
  - H2: Group access (optional)
  - H3: Group mention gating
  - H2: Multi-account
  - H2: Environment variables
  - H2: Typing, reactions, and delivery acknowledgements
  - H2: Troubleshooting
  - H2: Related

## ci.md

- Route: /ci
- Headings:
  - H2: Pipeline overview
  - H2: Fail-fast order
  - H2: PR context and evidence
  - H2: Scope and routing
  - H2: ClawSweeper activity forwarding
  - H2: Manual dispatches
  - H2: Runners
  - H2: Runner registration budget
  - H2: Local equivalents
  - H2: RemoteClaw Performance
  - H2: Full Release Validation
  - H2: Live and E2E shards
  - H2: Package Acceptance
  - H3: Jobs
  - H3: Candidate sources
  - H3: Suite profiles
  - H3: Legacy compatibility windows
  - H3: Examples
  - H2: Install smoke
  - H2: Local Docker E2E
  - H3: Tunables
  - H3: Reusable live/E2E workflow
  - H3: Release-path chunks
  - H2: Plugin Prerelease
  - H2: QA Lab
  - H2: CodeQL
  - H3: Security categories
  - H3: Platform-specific security shards
  - H3: Critical Quality categories
  - H2: Maintenance workflows
  - H3: Docs Agent
  - H3: Test Performance Agent
  - H3: Duplicate PRs After Merge
  - H2: Local check gates and changed routing
  - H2: Testbox validation
  - H2: Related

## cli/acp.md

- Route: /cli/acp
- Headings:
  - H2: What this is not
  - H2: Compatibility Matrix
  - H2: Known Limitations
  - H2: Usage
  - H2: ACP client (debug)
  - H2: Protocol smoke testing
  - H2: How to use this
  - H2: Selecting agents
  - H2: Use from acpx (Codex, Claude, other ACP clients)
  - H2: Zed editor setup
  - H2: Session mapping
  - H2: Options
  - H3: acp client options
  - H2: Related

## cli/agent.md

- Route: /cli/agent
- Headings:
  - H1: remoteclaw agent
  - H2: Options
  - H2: Examples
  - H2: Notes
  - H2: JSON delivery status
  - H2: Related

## cli/agents.md

- Route: /cli/agents
- Headings:
  - H1: remoteclaw agents
  - H2: Examples
  - H2: Command surface
  - H3: agents list
  - H3: agents add [name]
  - H3: agents bindings
  - H3: agents bind
  - H3: agents unbind
  - H3: agents set-identity
  - H3: agents delete &lt;id&gt;
  - H2: Routing bindings
  - H3: --bind format
  - H3: Binding scope behavior
  - H2: Identity files
  - H2: Set identity
  - H2: Related

## cli/approvals.md

- Route: /cli/approvals
- Headings:
  - H1: remoteclaw approvals
  - H2: remoteclaw exec-policy
  - H2: Common commands
  - H2: Replace approvals from a file
  - H2: "Never prompt" / YOLO example
  - H2: Allowlist helpers
  - H2: Common options
  - H2: Notes
  - H2: Related

## cli/attach.md

- Route: /cli/attach
- Headings: none

## cli/audit.md

- Route: /cli/audit
- Headings:
  - H1: remoteclaw audit
  - H2: Filters
  - H2: Recorded events
  - H2: Gateway RPC
  - H2: Related

## cli/browser.md

- Route: /cli/browser
- Headings:
  - H1: remoteclaw browser
  - H2: Common flags
  - H2: Quick start (local)
  - H2: Quick troubleshooting
  - H2: Lifecycle
  - H2: If the command is missing
  - H2: Profiles
  - H2: Tabs
  - H2: Snapshot / screenshot / actions
  - H2: State and storage
  - H2: Debugging
  - H2: Existing Chrome via MCP
  - H2: Remote browser control (node host proxy)
  - H2: Related

## cli/channels.md

- Route: /cli/channels
- Headings:
  - H1: remoteclaw channels
  - H2: Common commands
  - H2: Status / capabilities / resolve / logs
  - H2: Add / remove accounts
  - H2: Login and logout (interactive)
  - H2: Troubleshooting
  - H2: Capabilities probe
  - H2: Resolve names to IDs
  - H2: Related

## cli/clawbot.md

- Route: /cli/clawbot
- Headings:
  - H1: remoteclaw clawbot
  - H2: Migration
  - H2: Related

## cli/commitments.md

- Route: /cli/commitments
- Headings:
  - H2: Usage
  - H2: Options
  - H2: Examples
  - H2: Output
  - H2: Related

## cli/completion.md

- Route: /cli/completion
- Headings:
  - H1: remoteclaw completion
  - H2: Usage
  - H2: Options
  - H2: Install flow
  - H2: Notes
  - H2: Related

## cli/config.md

- Route: /cli/config
- Headings:
  - H2: Root options
  - H2: Examples
  - H3: Paths
  - H3: config get
  - H3: config file
  - H3: config schema
  - H3: config validate
  - H2: Values
  - H2: config set modes
  - H3: Provider builder flags
  - H2: config patch
  - H2: Dry run
  - H3: JSON output shape
  - H2: Applying changes
  - H2: Write safety
  - H2: Repair loop
  - H2: Related

## cli/configure.md

- Route: /cli/configure
- Headings:
  - H1: remoteclaw configure
  - H2: Options
  - H2: Model section
  - H2: Web section
  - H2: Other notes
  - H2: Related

## cli/crestodian.md

- Route: /cli/crestodian
- Headings:
  - H1: openclaw crestodian
  - H2: When it starts
  - H2: What Crestodian shows
  - H2: Examples
  - H2: Operations and approval
  - H2: Setup bootstrap
  - H2: AI conversation
  - H3: CLI harness trust model
  - H2: Switching to an agent
  - H2: Message rescue mode
  - H2: Related

## cli/cron.md

- Route: /cli/cron
- Headings:
  - H1: remoteclaw cron
  - H2: Create jobs quickly
  - H2: Sessions
  - H2: Delivery
  - H3: Delivery ownership
  - H3: Failure delivery
  - H2: Scheduling
  - H3: One-shot jobs
  - H3: Recurring jobs
  - H3: Manual runs
  - H2: Models
  - H3: Isolated cron model precedence
  - H3: Fast mode
  - H3: Live model switch retries
  - H2: Run output and denials
  - H3: Stale acknowledgement suppression
  - H3: Silent token suppression
  - H3: Structured denials
  - H2: Retention
  - H2: Migrating older jobs
  - H2: Common edits
  - H2: Common admin commands
  - H2: Related

## cli/daemon.md

- Route: /cli/daemon
- Headings:
  - H1: remoteclaw daemon
  - H2: Usage
  - H2: Subcommands and options
  - H2: Notes
  - H2: Related

## cli/dashboard.md

- Route: /cli/dashboard
- Headings:
  - H1: remoteclaw dashboard
  - H2: Related

## cli/devices.md

- Route: /cli/devices
- Headings:
  - H1: remoteclaw devices
  - H2: Common options
  - H2: Commands
  - H3: remoteclaw devices list
  - H3: remoteclaw devices approve [requestId] [--latest]
  - H3: remoteclaw devices reject &lt;requestId&gt;
  - H3: remoteclaw devices remove &lt;deviceId&gt;
  - H3: remoteclaw devices clear --yes [--pending]
  - H3: remoteclaw devices rotate --device &lt;id&gt; --role &lt;role&gt; [--scope &lt;scope...&gt;]
  - H3: remoteclaw devices revoke --device &lt;id&gt; --role &lt;role&gt;
  - H2: Notes
  - H2: Token drift recovery checklist
  - H2: Paperclip / remoteclawgateway first-run approval
  - H2: Related

## cli/directory.md

- Route: /cli/directory
- Headings:
  - H1: remoteclaw directory
  - H2: Common flags
  - H2: Notes
  - H2: Using results with message send
  - H2: ID formats by channel
  - H2: Self ("me")
  - H2: Peers (contacts/users)
  - H2: Groups
  - H2: Related

## cli/dns.md

- Route: /cli/dns
- Headings:
  - H1: remoteclaw dns
  - H2: dns setup
  - H2: Related

## cli/docs.md

- Route: /cli/docs
- Headings:
  - H1: remoteclaw docs
  - H2: Usage
  - H2: Examples
  - H2: How it works
  - H2: Output
  - H2: Exit codes
  - H2: Related

## cli/doctor.md

- Route: /cli/doctor
- Headings:
  - H1: remoteclaw doctor
  - H2: Why Use It
  - H2: Examples
  - H2: Options
  - H2: Lint mode
  - H2: Structured Health Checks
  - H2: Check Selection
  - H2: Post-upgrade mode
  - H2: macOS: launchctl env overrides
  - H2: Related

## cli/flows.md

- Route: /cli/flows
- Headings:
  - H1: remoteclaw tasks flow
  - H2: Subcommands
  - H3: Status filter values
  - H2: Examples
  - H2: Related

## cli/gateway.md

- Route: /cli/gateway
- Headings:
  - H2: Run the Gateway
  - H3: Options
  - H2: Restart the Gateway
  - H3: Gateway profiling
  - H2: Query a running Gateway
  - H3: gateway health
  - H3: gateway usage-cost
  - H3: gateway stability
  - H3: gateway diagnostics export
  - H3: gateway status
  - H3: gateway probe
  - H4: Remote over SSH (Mac app parity)
  - H3: gateway call &lt;method&gt;
  - H2: Manage the Gateway service
  - H3: Install with a wrapper
  - H2: Discover gateways (Bonjour)
  - H3: gateway discover
  - H2: Related

## cli/health.md

- Route: /cli/health
- Headings:
  - H1: remoteclaw health
  - H2: Options
  - H2: Behavior
  - H2: Related

## cli/hooks.md

- Route: /cli/hooks
- Headings:
  - H1: remoteclaw hooks
  - H2: List all hooks
  - H2: Get hook information
  - H2: Check hooks eligibility
  - H2: Enable a Hook
  - H2: Disable a Hook
  - H2: Notes
  - H2: Install hook packs
  - H2: Update hook packs
  - H2: Bundled hooks
  - H3: session-memory
  - H3: bootstrap-extra-files
  - H3: command-logger
  - H3: boot-md
  - H2: Related

## cli/index.md

- Route: /cli
- Headings:
  - H2: Command pages
  - H2: Global flags
  - H2: Output modes
  - H2: Command tree
  - H2: Chat slash commands
  - H2: Usage tracking
  - H2: Related

## cli/infer.md

- Route: /cli/infer
- Headings:
  - H2: Turn infer into a skill
  - H2: Why use infer
  - H2: Command tree
  - H2: Common tasks
  - H2: Behavior
  - H2: Model
  - H2: Image
  - H2: Audio
  - H2: TTS
  - H2: Video
  - H2: Web
  - H2: Embedding
  - H2: JSON output
  - H2: Common pitfalls
  - H2: Notes
  - H2: Related

## cli/logs.md

- Route: /cli/logs
- Headings:
  - H1: remoteclaw logs
  - H2: Options
  - H2: Shared Gateway RPC options
  - H2: Examples
  - H2: Fallback and recovery behavior
  - H2: Related

## cli/message.md

- Route: /cli/message
- Headings:
  - H1: remoteclaw message
  - H2: Channel selection
  - H2: Target formats (-t, --target)
  - H2: Common flags
  - H2: SecretRef resolution
  - H2: Actions
  - H3: Core
  - H3: Send
  - H3: Poll
  - H3: Threads
  - H3: Emojis
  - H3: Stickers
  - H3: Roles, channels, voice, events (Discord)
  - H3: Moderation (Discord)
  - H3: Broadcast
  - H2: Related

## cli/migrate.md

- Route: /cli/migrate
- Headings:
  - H1: remoteclaw migrate
  - H2: Commands
  - H2: Safety model
  - H2: Claude provider
  - H3: What Claude imports
  - H3: Archive and manual-review state
  - H2: Codex provider
  - H3: What Codex imports
  - H3: Manual-review Codex state
  - H2: Hermes provider
  - H3: What Hermes imports
  - H3: Supported .env keys
  - H3: Archive-only state
  - H3: After applying
  - H2: Plugin contract
  - H2: Onboarding integration
  - H2: Related

## cli/node.md

- Route: /cli/node
- Headings:
  - H1: remoteclaw node
  - H2: Why use a node host?
  - H2: Browser proxy (zero-config)
  - H2: Run (foreground)
  - H2: Gateway auth for node host
  - H2: Service (background)
  - H2: Pairing
  - H2: Exec approvals
  - H2: Related

## cli/nodes.md

- Route: /cli/nodes
- Headings:
  - H1: remoteclaw nodes
  - H2: Status
  - H2: Pairing
  - H2: Invoke
  - H2: Notify, push, location, screen
  - H2: Related

## cli/onboard.md

- Route: /cli/onboard
- Headings:
  - H1: remoteclaw onboard
  - H2: Related guides
  - H2: Examples
  - H2: Common follow-up commands

## cli/pairing.md

- Route: /cli/pairing
- Headings:
  - H1: remoteclaw pairing
  - H2: Commands
  - H2: pairing list
  - H2: pairing approve
  - H3: Owner bootstrap
  - H2: Related

## cli/path.md

- Route: /cli/path
- Headings:
  - H1: remoteclaw path
  - H2: Why use it
  - H2: How it is used
  - H2: How it works
  - H2: Subcommands
  - H2: Global flags
  - H2: oc:// syntax
  - H2: Addressing by file kind
  - H2: Mutation contract
  - H2: Examples
  - H2: Recipes by file kind
  - H3: Markdown
  - H3: JSONC
  - H3: JSONL
  - H3: YAML
  - H2: Subcommand reference
  - H3: resolve &lt;oc-path&gt;
  - H3: find &lt;pattern&gt;
  - H3: set &lt;oc-path&gt; &lt;value&gt;
  - H3: validate &lt;oc-path&gt;
  - H3: emit &lt;file&gt;
  - H2: Exit codes
  - H2: Output mode
  - H2: Notes
  - H2: Related

## cli/plugins.md

- Route: /cli/plugins
- Headings:
  - H2: Commands
  - H3: Author
  - H3: Install
  - H4: Marketplace shorthand
  - H3: List
  - H3: Plugin index
  - H3: Uninstall
  - H3: Update
  - H3: Inspect
  - H3: Doctor
  - H3: Registry
  - H3: Marketplace
  - H2: Related

## cli/policy.md

- Route: /cli/policy
- Headings:
  - H1: remoteclaw policy
  - H2: Quick start
  - H3: Policy rule reference
  - H4: Scoped overlays
  - H4: Channels
  - H4: MCP servers
  - H4: Model providers
  - H4: Network
  - H4: Ingress and channel access
  - H4: Gateway
  - H4: Agent workspace
  - H4: Sandbox posture
  - H4: Data Handling
  - H4: Secrets
  - H4: Exec approvals
  - H4: Auth profiles
  - H4: Tool metadata
  - H4: Tool posture
  - H2: Run checks
  - H2: Configure policy
  - H2: Accept policy state
  - H2: Findings
  - H2: Repair
  - H2: Exit codes
  - H2: Related

## cli/promos.md

- Route: /cli/promos
- Headings:
  - H1: remoteclaw promos
  - H2: Commands
  - H2: remoteclaw promos list
  - H2: remoteclaw promos claim &lt;slug&gt;
  - H2: Passive discovery in models list

## cli/proxy.md

- Route: /cli/proxy
- Headings:
  - H1: remoteclaw proxy
  - H2: Validate
  - H3: Options
  - H2: Debug proxy
  - H2: Related

## cli/qr.md

- Route: /cli/qr
- Headings:
  - H1: remoteclaw qr
  - H2: Usage
  - H2: Options
  - H2: Notes
  - H2: Related

## cli/reset.md

- Route: /cli/reset
- Headings:
  - H1: remoteclaw reset
  - H2: Options
  - H2: Scopes
  - H2: Notes
  - H2: Related

## cli/security.md

- Route: /cli/security
- Headings:
  - H1: remoteclaw security
  - H2: Audit modes
  - H2: What it checks
  - H2: SecretRef behavior
  - H2: Suppressions
  - H2: JSON output
  - H2: What --fix changes
  - H2: Related

## cli/sessions.md

- Route: /cli/sessions
- Headings:
  - H1: remoteclaw sessions
  - H2: Tail trajectory progress
  - H2: Export a trajectory bundle
  - H2: Cleanup maintenance
  - H2: Compact a session
  - H3: sessions.compact RPC
  - H2: Related

## cli/setup.md

- Route: /cli/setup
- Headings:
  - H1: remoteclaw setup
  - H2: Options
  - H3: Wizard auto-trigger
  - H2: Examples
  - H2: Notes
  - H2: Related

## cli/status.md

- Route: /cli/status
- Headings:
  - H2: Session and model resolution
  - H2: Usage and quota
  - H2: Overview and update status
  - H2: Secrets
  - H2: Memory
  - H2: Related

## cli/system.md

- Route: /cli/system
- Headings:
  - H1: remoteclaw system
  - H2: Common commands
  - H2: system event
  - H2: system heartbeat last|enable|disable
  - H2: system presence
  - H2: Notes
  - H2: Related

## cli/tasks.md

- Route: /cli/tasks
- Headings:
  - H2: Usage
  - H2: Root Options
  - H2: Subcommands
  - H3: list
  - H3: show
  - H3: notify
  - H3: cancel
  - H3: audit
  - H3: maintenance
  - H3: flow
  - H2: Related

## cli/transcripts.md

- Route: /cli/transcripts
- Headings:
  - H1: remoteclaw transcripts
  - H2: Commands
  - H2: Output
  - H2: Many sessions per day
  - H2: Missing summaries
  - H2: Configuration

## cli/tui.md

- Route: /cli/tui
- Headings:
  - H1: remoteclaw tui
  - H2: Options
  - H2: Examples
  - H2: Config repair loop
  - H2: Related

## cli/uninstall.md

- Route: /cli/uninstall
- Headings:
  - H1: remoteclaw uninstall
  - H2: Options
  - H2: Examples
  - H2: Notes
  - H2: Related

## cli/update.md

- Route: /cli/update
- Headings:
  - H1: remoteclaw update
  - H2: Usage
  - H2: Options
  - H2: update status
  - H2: update wizard
  - H2: What it does
  - H3: Control-plane response shape
  - H2: Git checkout flow
  - H3: Channel selection
  - H3: Update steps
  - H2: --update shorthand
  - H2: Related

## cli/voicecall.md

- Route: /cli/voicecall
- Headings:
  - H1: remoteclaw voicecall
  - H2: Subcommands
  - H2: Setup and smoke
  - H3: setup
  - H3: smoke
  - H2: Call lifecycle
  - H3: call
  - H3: start
  - H3: continue
  - H3: speak
  - H3: dtmf
  - H3: end
  - H3: status
  - H2: Logs and metrics
  - H3: tail
  - H3: latency
  - H2: Exposing webhooks
  - H3: expose
  - H2: Related

## cli/wiki.md

- Route: /cli/wiki
- Headings:
  - H1: remoteclaw wiki
  - H2: What it is for
  - H2: Common commands
  - H2: Commands
  - H3: wiki status
  - H3: wiki doctor
  - H3: wiki init
  - H3: wiki ingest &lt;path-or-url&gt;
  - H3: wiki compile
  - H3: wiki lint
  - H3: wiki search &lt;query&gt;
  - H3: wiki get &lt;lookup&gt;
  - H3: wiki apply
  - H3: wiki bridge import
  - H3: wiki unsafe-local import
  - H3: wiki obsidian ...
  - H2: Practical usage guidance
  - H2: Configuration tie-ins
  - H2: Related

## cli/workboard.md

- Route: /cli/workboard
- Headings:
  - H2: Usage
  - H2: list
  - H2: create
  - H2: show
  - H2: dispatch
  - H2: Slash command parity
  - H2: Permissions
  - H2: Troubleshooting
  - H3: No cards appear
  - H3: Dispatch says data-only
  - H3: Dispatch starts nothing
  - H2: Related

## concepts/agent-runtimes.md

- Route: /concepts/agent-runtimes
- Headings:
  - H1: Agent Runtimes
  - H2: The AgentRuntime Interface
  - H3: Execute Parameters
  - H3: The Event Stream
  - H2: CLIRuntimeBase — Subprocess Machinery
  - H3: Subprocess Lifecycle
  - H3: Startup Timeout
  - H3: Signal Escalation
  - H3: Per-Execution State Reset
  - H2: CLI Runtimes
  - H3: Claude
  - H3: Gemini
  - H3: Codex
  - H3: OpenCode
  - H2: MCP Configuration Patterns
  - H2: Runtime Selection

## concepts/agent-workspace.md

- Route: /concepts/agent-workspace
- Headings:
  - H1: Agent workspace
  - H2: Default location
  - H2: Extra workspace folders
  - H2: Workspace file map (what each file means)
  - H2: What is NOT in the workspace
  - H2: Git backup (recommended, private)
  - H3: 1) Initialize the repo
  - H3: 2) Add a private remote (beginner-friendly options)
  - H3: 3) Ongoing updates
  - H2: Do not commit secrets
  - H2: Moving the workspace to a new machine
  - H2: Advanced notes
  - H2: Related

## concepts/agent.md

- Route: /concepts/agent
- Headings:
  - H1: Agent Runtime
  - H2: Workspace (required)
  - H2: Bootstrap files (injected)
  - H2: Built-in tools
  - H2: Skills
  - H2: Runtime boundaries
  - H2: Sessions
  - H2: Steering while streaming
  - H2: Model refs
  - H2: Configuration (minimal)

## concepts/architecture.md

- Route: /concepts/architecture
- Headings:
  - H1: Gateway architecture
  - H2: Overview
  - H2: Components and flows
  - H3: Gateway (daemon)
  - H3: Clients (mac app / CLI / web admin)
  - H3: Nodes (macOS / iOS / Android / headless)
  - H3: WebChat
  - H2: Connection lifecycle (single client)
  - H2: Wire protocol (summary)
  - H2: Pairing + local trust
  - H2: Protocol typing and codegen
  - H2: Remote access
  - H2: Operations snapshot
  - H2: Invariants
  - H2: Related

## concepts/channel-bridge.md

- Route: /concepts/channel-bridge
- Headings:
  - H1: ChannelBridge
  - H2: Overview
  - H2: The handle() Pipeline
  - H3: Step 1 — Session Lookup
  - H3: Step 2 — System Prompt Construction
  - H3: Step 3 — MCP Server and Temp Directory
  - H3: Step 4 — Pre-Spawn Hooks
  - H3: Step 5 — Runtime Execution
  - H3: Step 6 — Delivery Processing
  - H3: Step 7 — Error Classification
  - H3: Step 8 — Side Effect Collection
  - H3: Step 9 — Session State Update
  - H3: Step 10 — Post-Exit Hooks
  - H2: The Delivery Result
  - H2: Message Flow
  - H2: Cross-Channel Routing
  - H2: Followup Handling

## concepts/context-engine.md

- Route: /concepts/context-engine
- Headings:
  - H1: Context Engine
  - H2: Quick start
  - H3: Installing a context engine plugin
  - H2: How it works
  - H3: Subagent lifecycle (optional)
  - H3: System prompt addition
  - H2: The legacy engine
  - H2: Plugin engines
  - H3: The ContextEngine interface
  - H3: ownsCompaction
  - H2: Configuration reference
  - H2: Relationship to compaction
  - H2: Tips
  - H2: Related

## concepts/context.md

- Route: /concepts/context
- Headings:
  - H1: Context
  - H2: Quick start (inspect context)
  - H2: Example output
  - H3: /context list
  - H3: /context detail
  - H2: What counts toward the context window
  - H2: How RemoteClaw builds the system prompt
  - H2: Injected workspace files (Project Context)
  - H2: Skills: injected vs loaded on-demand
  - H2: Tools: there are two costs
  - H2: Commands, directives, and "inline shortcuts"
  - H2: Sessions, compaction, and pruning (what persists)
  - H2: What /context actually reports
  - H2: Related

## concepts/delegate-architecture.md

- Route: /concepts/delegate-architecture
- Headings:
  - H1: Delegate Architecture
  - H2: What is a delegate?
  - H2: Why delegates?
  - H2: Capability tiers
  - H3: Tier 1: Read-Only + Draft
  - H3: Tier 2: Send on Behalf
  - H3: Tier 3: Proactive
  - H2: Prerequisites: isolation and hardening
  - H3: Hard blocks (non-negotiable)
  - H3: Tool restrictions
  - H3: Sandbox isolation
  - H3: Audit trail
  - H2: Setting up a delegate
  - H3: 1. Create the delegate agent
  - H3: 2. Configure identity provider delegation
  - H4: Microsoft 365
  - H4: Google Workspace
  - H3: 3. Bind the delegate to channels
  - H3: 4. Add credentials to the delegate agent
  - H2: Example: organizational assistant
  - H2: Scaling pattern

## concepts/exec-approvals-architecture.md

- Route: /concepts/exec-approvals-architecture
- Headings:
  - H1: Exec-approvals architecture
  - H2: Context
  - H2: Considered paths
  - H3: Path A — Gut decorative fields (chosen)
  - H3: Path B — Wire the AgentRuntime authority bridge (rejected)
  - H2: Decision and rationale
  - H2: Consequences
  - H2: Non-goals (re-affirmed)
  - H2: Related

## concepts/features.mdx

- Route: /concepts/features
- Headings:
  - H2: Highlights
  - H2: Full list

## concepts/markdown-formatting.md

- Route: /concepts/markdown-formatting
- Headings:
  - H1: Markdown formatting
  - H2: Goals
  - H2: Pipeline
  - H2: IR example
  - H2: Where it is used
  - H2: Table handling
  - H2: Chunking rules
  - H2: Link policy
  - H2: Spoilers
  - H2: How to add or update a channel formatter
  - H2: Common gotchas

## concepts/messages.md

- Route: /concepts/messages
- Headings:
  - H1: Messages
  - H2: Message flow (high level)
  - H2: Inbound dedupe
  - H2: Inbound debouncing
  - H2: Sessions and devices
  - H2: Inbound bodies and history context
  - H2: Queueing and followups
  - H2: Streaming, chunking, and batching
  - H2: Reasoning visibility and tokens
  - H2: Prefixes, threading, and replies
  - H2: Related

## concepts/middleware-architecture.md

- Route: /concepts/middleware-architecture
- Headings:
  - H1: Middleware Architecture
  - H2: The Middleware Model
  - H2: Bring Your Own Agent
  - H2: How This Differs from OpenClaw
  - H2: The Middleware Boundary Principle
  - H2: Key Components

## concepts/multi-agent.mdx

- Route: /concepts/multi-agent
- Headings:
  - H1: Multi-Agent Routing
  - H2: What is “one agent”?
  - H2: Paths (quick map)
  - H3: Single-agent mode (default)
  - H2: Agent helper
  - H2: Quick start
  - H2: Multiple agents = multiple people, multiple personalities
  - H2: One WhatsApp number, multiple people (DM split)
  - H2: Routing rules (how messages pick an agent)
  - H2: Multiple accounts / phone numbers
  - H2: Concepts
  - H2: Platform examples
  - H3: Discord bots per agent
  - H3: Telegram bots per agent
  - H3: WhatsApp numbers per agent
  - H2: Example: WhatsApp daily chat + Telegram deep work
  - H2: Example: same channel, one peer to dedicated agent
  - H2: Family agent bound to a WhatsApp group
  - H2: Per-Agent Sandbox and Tool Configuration

## concepts/presence.md

- Route: /concepts/presence
- Headings:
  - H1: Presence
  - H2: Presence fields (what shows up)
  - H2: Producers (where presence comes from)
  - H3: 1) Gateway self entry
  - H3: 2) WebSocket connect
  - H4: Why one-off CLI commands do not show up
  - H3: 3) system-event beacons
  - H3: 4) Node connects (role: node)
  - H2: Merge + dedupe rules (why instanceId matters)
  - H2: TTL and bounded size
  - H2: Remote/tunnel caveat (loopback IPs)
  - H2: Consumers
  - H3: macOS Instances tab
  - H2: Debugging tips

## concepts/queue.md

- Route: /concepts/queue
- Headings:
  - H1: Command Queue (2026-01-16)
  - H2: Why
  - H2: How it works
  - H2: Queue modes (per channel)
  - H2: Queue options
  - H2: Per-session overrides
  - H2: Scope and guarantees
  - H2: Troubleshooting

## concepts/retry.md

- Route: /concepts/retry
- Headings:
  - H1: Retry policy
  - H2: Goals
  - H2: Defaults
  - H2: Behavior
  - H3: Discord
  - H3: Telegram
  - H2: Configuration
  - H2: Notes

## concepts/session-pruning.md

- Route: /concepts/session-pruning
- Headings:
  - H1: Session Pruning
  - H2: When it runs
  - H2: Smart defaults
  - H2: What this improves
  - H2: What can be pruned
  - H2: Context window estimation
  - H2: Mode
  - H3: cache-ttl
  - H2: Soft vs hard pruning
  - H2: Tool selection
  - H2: Interaction with other limits
  - H2: Defaults (when enabled)
  - H2: Examples

## concepts/session-tool.md

- Route: /concepts/session-tool
- Headings:
  - H1: Session Tools
  - H2: Tool Names
  - H2: Key Model
  - H2: sessionslist
  - H2: sessionshistory
  - H2: Gateway session history and live transcript APIs
  - H2: sessionssend
  - H2: Channel Field
  - H2: Security / Send Policy
  - H2: sessionsspawn
  - H2: Sandbox Session Visibility

## concepts/session.md

- Route: /concepts/session
- Headings:
  - H1: Session Management
  - H2: Secure DM mode (recommended for multi-user setups)
  - H2: Gateway is the source of truth
  - H2: Where state lives
  - H2: Maintenance
  - H3: Defaults
  - H3: How it works
  - H3: Performance caveat for large stores
  - H3: Customize examples
  - H2: Session pruning
  - H2: Pre-compaction memory flush
  - H2: Mapping transports → session keys
  - H2: Lifecycle
  - H2: Send policy (optional)
  - H2: Configuration (optional rename example)
  - H2: Inspecting
  - H2: Tips
  - H2: Session origin metadata

## concepts/streaming.md

- Route: /concepts/streaming
- Headings:
  - H1: Streaming + chunking
  - H2: Block streaming (channel messages)
  - H2: Chunking algorithm (low/high bounds)
  - H2: Coalescing (merge streamed blocks)
  - H2: Human-like pacing between blocks
  - H2: "Stream chunks or everything"
  - H2: Preview streaming modes
  - H3: Channel mapping
  - H3: Runtime behavior
  - H2: Related

## concepts/system-prompt.md

- Route: /concepts/system-prompt
- Headings:
  - H1: System Prompt
  - H2: Structure
  - H2: Prompt modes
  - H2: Workspace bootstrap injection
  - H2: Time handling
  - H2: Skills
  - H2: Documentation

## concepts/timezone.md

- Route: /concepts/timezone
- Headings:
  - H1: Timezones
  - H2: Message envelopes (local by default)
  - H3: Examples
  - H2: Tool payloads (raw provider data + normalized fields)
  - H2: User timezone for the system prompt
  - H2: Related

## concepts/typebox.md

- Route: /concepts/typebox
- Headings:
  - H1: TypeBox as protocol source of truth
  - H2: Mental model (30 seconds)
  - H2: Where the schemas live
  - H2: Current pipeline
  - H2: How the schemas are used at runtime
  - H2: Example frames
  - H2: Minimal client (Node.js)
  - H2: Worked example: add a method end-to-end
  - H2: Swift codegen behavior
  - H2: Versioning + compatibility
  - H2: Schema patterns and conventions
  - H2: Live schema JSON
  - H2: When you change schemas

## concepts/typing-indicators.md

- Route: /concepts/typing-indicators
- Headings:
  - H1: Typing indicators
  - H2: Defaults
  - H2: Modes
  - H2: Configuration
  - H2: Notes

## concepts/usage-tracking.md

- Route: /concepts/usage-tracking
- Headings:
  - H1: Usage tracking
  - H2: What it is
  - H2: Where it shows up
  - H2: Runtimes

## configuration.md

- Route: /configuration
- Headings:
  - H1: Configuration Reference
  - H2: Runtime Selection
  - H2: API Key Configuration
  - H2: Channel Setup
  - H3: Telegram
  - H3: WhatsApp (Baileys)
  - H3: Slack
  - H2: MCP Server Configuration
  - H3: File System and Execution
  - H2: Session Management
  - H2: Cron Scheduling
  - H2: All Top-Level Keys
  - H2: Agent Configuration
  - H2: Gateway
  - H2: Plugins
  - H2: Deprecated Sections
  - H3: skills
  - H3: models
  - H3: plugins (partially deprecated)

## date-time.md

- Route: /date-time
- Headings:
  - H2: Message envelopes (local by default)
  - H3: Examples
  - H2: System prompt: current date and time
  - H2: System event lines (local by default)
  - H3: Configure user timezone + format
  - H2: Time format detection (auto)
  - H2: Tool payloads + connectors (raw provider time + normalized fields)
  - H2: Related docs

## debug/node-issue.md

- Route: /debug/node-issue
- Headings:
  - H1: Node + tsx "\\name is not a function" crash
  - H2: Summary
  - H2: Environment
  - H2: Repro (Node-only)
  - H2: Minimal repro in repo
  - H2: Node version check
  - H2: Notes / hypothesis
  - H2: Regression history
  - H2: Workarounds
  - H2: References
  - H2: Next steps
  - H2: Related

## diagnostics/flags.md

- Route: /diagnostics/flags
- Headings:
  - H2: How it works
  - H2: Known flags
  - H2: Enable via config
  - H2: Env override (one-off)
  - H2: Profiler flags
  - H2: Timeline artifacts
  - H2: Where logs go
  - H2: Extract logs
  - H2: Notes
  - H2: Related

## experiments/onboarding-config-protocol.md

- Route: /experiments/onboarding-config-protocol
- Headings:
  - H1: Onboarding + Config Protocol
  - H2: Components
  - H2: Gateway RPC
  - H2: UI Hints
  - H2: Notes

## experiments/plans/acp-persistent-bindings-discord-channels-telegram-topics.md

- Route: /experiments/plans/acp-persistent-bindings-discord-channels-telegram-topics
- Headings:
  - H1: ACP Persistent Bindings for Discord Channels and Telegram Topics
  - H2: Summary
  - H2: Why
  - H2: Goals
  - H2: Non-Goals
  - H2: UX Direction
  - H3: 1) Two binding types
  - H3: 2) Command behavior
  - H3: 3) Conversation identity
  - H2: Config Model (Proposed)
  - H3: Minimal Example (No Per-Binding ACP Overrides)
  - H3: Backend Selection
  - H2: Architecture Fit in Current System
  - H3: Reuse existing components
  - H3: New/extended components
  - H2: Phased Delivery
  - H3: Phase 1: Typed binding schema foundation
  - H3: Phase 2: Runtime resolution + Discord/Telegram parity
  - H3: Phase 3: Command parity and resets
  - H3: Phase 4: Hardening
  - H2: Guardrails and Policy
  - H2: Testing Plan
  - H2: Open Questions
  - H2: Rollout

## experiments/plans/browser-evaluate-cdp-refactor.md

- Route: /experiments/plans/browser-evaluate-cdp-refactor
- Headings:
  - H1: Browser Evaluate CDP Refactor Plan
  - H2: Context
  - H2: Goals
  - H2: Non-goals
  - H2: Current Architecture (Why It Gets Stuck)
  - H2: Proposed Architecture
  - H3: 1. Deadline Propagation
  - H3: 2. Separate Evaluate Engine (CDP Path)
  - H3: 3. Ref Story (Element Targeting Without A Full Rewrite)
  - H4: 3.1 Extend Stored Ref Info
  - H4: 3.2 Populate backendDOMNodeId At Snapshot Time
  - H4: 3.3 Evaluate Behavior With Ref
  - H3: 4. Keep A Last Resort Recovery Path
  - H2: Implementation Plan (Single Iteration)
  - H3: Deliverables
  - H3: Implementation Checklist
  - H3: Acceptance Criteria
  - H2: Testing Plan
  - H2: Risks And Mitigations
  - H2: Open Questions

## experiments/plans/discord-async-inbound-worker.md

- Route: /experiments/plans/discord-async-inbound-worker
- Headings:
  - H1: Discord Async Inbound Worker Plan
  - H2: Objective
  - H2: Current status
  - H2: Why this exists
  - H2: Non-goals
  - H2: Current constraints
  - H2: Target architecture
  - H3: 1. Listener stage
  - H3: 2. Normalized job payload
  - H3: 3. Worker stage
  - H3: 4. Ordering model
  - H3: 5. Timeout model
  - H2: Recommended implementation phases
  - H3: Phase 1: normalization boundary
  - H3: Phase 2: in-memory worker queue
  - H3: Phase 3: process split
  - H3: Phase 4: command semantics
  - H3: Phase 5: observability and operator UX
  - H3: Phase 6: optional durability follow-up
  - H2: File impact
  - H2: Next step now
  - H2: Testing plan
  - H2: Risks and mitigations
  - H2: Acceptance criteria
  - H2: Remaining landing strategy

## experiments/plans/pty-process-supervision.md

- Route: /experiments/plans/pty-process-supervision
- Headings:
  - H1: PTY and Process Supervision Plan
  - H2: 1. Problem and goal
  - H2: 2. Scope and boundaries
  - H2: 3. Implemented in this branch
  - H3: Supervisor baseline already present
  - H3: This pass completed
  - H2: 4. Remaining gaps and decisions
  - H3: Reliability status
  - H3: Durability and startup reconciliation
  - H3: Maintainability follow-ups
  - H2: 5. Implementation plan
  - H2: 6. File map
  - H3: Process supervisor
  - H3: Exec and process integration
  - H3: CLI reliability
  - H2: 7. Validation run in this pass
  - H2: 8. Operational guarantees preserved
  - H2: 9. Definition of done
  - H2: 10. Summary

## experiments/plans/session-binding-channel-agnostic.md

- Route: /experiments/plans/session-binding-channel-agnostic
- Headings:
  - H1: Session Binding Channel Agnostic Plan
  - H2: Overview
  - H2: Why this exists
  - H2: Iteration 1 scope
  - H3: 1. Add channel agnostic core interfaces
  - H3: 2. Add one core delivery router for subagent completions
  - H3: 3. Keep Discord as adapter
  - H3: 4. Fix currently known correctness issues
  - H3: 5. Preserve current runtime safety defaults
  - H2: Not in iteration 1
  - H2: Routing invariants
  - H2: Compatibility and rollout
  - H2: Tests required in iteration 1
  - H2: Proposed implementation files
  - H2: Done criteria for iteration 1

## experiments/plans/ui-stored-settings-legacy-migration.md

- Route: /experiments/plans/ui-stored-settings-legacy-migration
- Headings:
  - H1: UI Stored-Settings Audit
  - H2: Context
  - H2: Inventory
  - H2: Findings
  - H3: Finding 1 — openclaw. localStorage artifacts are out of scope (non-finding).
  - H3: Finding 2 — Pre-boot theme script carries dead OpenClaw multi-theme logic.
  - H3: Finding 3 — Silent drop of removed fields is working as intended (no action).
  - H3: Finding 4 — Non-findings: agentsPanel, plugin discriminator, session/agent state.
  - H2: Proposal
  - H2: AC (this spike)
  - H2: Related

## experiments/proposals/acp-bound-command-auth.md

- Route: /experiments/proposals/acp-bound-command-auth
- Headings:
  - H1: ACP Bound Command Authorization (Proposal)
  - H2: Problem
  - H2: Long-term shape
  - H3: 1) Add auth policy metadata to command definitions
  - H3: 2) Share one evaluator across channels
  - H3: 3) Use binding-match as the bypass boundary
  - H2: Why this is better
  - H2: Rollout plan (future)
  - H2: Non-goals
  - H2: Note

## experiments/proposals/model-config.md

- Route: /experiments/proposals/model-config
- Headings:
  - H1: Model Config (Exploration)
  - H2: Motivation
  - H2: Possible direction (high level)
  - H2: Open questions

## gateway/authentication.md

- Route: /gateway/authentication
- Headings:
  - H2: Recommended setup (API key, any provider)
  - H2: Anthropic: Claude CLI and token compatibility
  - H2: Anthropic note
  - H2: Checking model auth status
  - H2: API key rotation behavior (gateway)
  - H2: Removing provider auth while the gateway is running
  - H2: Controlling which credential is used
  - H3: OpenAI and legacy openai-codex ids
  - H3: During login (CLI)
  - H3: Per-session (chat command)
  - H3: Per-agent (CLI override)
  - H2: Troubleshooting
  - H3: "No credentials found"
  - H3: Token expiring/expired
  - H2: Related

## gateway/background-process.md

- Route: /gateway/background-process
- Headings:
  - H2: exec tool
  - H3: Env overrides
  - H3: Config (preferred over env overrides)
  - H2: Child process bridging
  - H2: process tool
  - H2: Examples
  - H2: Related

## gateway/bonjour.md

- Route: /gateway/bonjour
- Headings:
  - H2: Wide-area Bonjour (Unicast DNS-SD) over Tailscale
  - H3: Gateway config
  - H3: One-time DNS server setup (gateway host, macOS only)
  - H3: Tailscale DNS settings
  - H3: Gateway listener security
  - H2: What advertises
  - H2: Service types
  - H2: TXT keys (non-secret hints)
  - H2: Debugging on macOS
  - H2: Debugging in Gateway logs
  - H2: Debugging on iOS node
  - H2: When to enable Bonjour
  - H2: When to disable Bonjour
  - H2: Docker gotchas
  - H2: Troubleshooting disabled Bonjour
  - H2: Common failure modes
  - H2: Escaped instance names (\032)
  - H2: Enabling / disabling / configuration
  - H2: Related docs

## gateway/bridge-protocol.md

- Route: /gateway/bridge-protocol
- Headings:
  - H2: Why it existed
  - H2: Transport
  - H2: Handshake and pairing
  - H2: Frames
  - H2: Exec lifecycle events
  - H2: Historical tailnet usage
  - H2: Versioning
  - H2: Related

## gateway/cli-backends.md

- Route: /gateway/cli-backends
- Headings:
  - H1: CLI backends (fallback runtime)
  - H2: Beginner-friendly quick start
  - H2: Using it as a fallback
  - H2: Configuration overview
  - H3: Example configuration
  - H2: How it works
  - H2: Sessions
  - H2: Fallback prelude from claude-cli sessions
  - H2: Images (pass-through)
  - H2: Inputs / outputs
  - H2: Defaults (plugin-owned)
  - H2: Plugin-owned defaults
  - H2: Native compaction ownership
  - H2: Bundle MCP overlays
  - H2: Reseed history cap
  - H2: Limitations
  - H2: Troubleshooting
  - H2: Related

## gateway/config-agents.md

- Route: /gateway/config-agents
- Headings:
  - H2: Agent defaults
  - H3: agents.defaults.workspace
  - H3: agents.defaults.repoRoot
  - H3: agents.defaults.skills
  - H3: agents.defaults.skipBootstrap
  - H3: agents.defaults.skipOptionalBootstrapFiles
  - H3: agents.defaults.contextInjection
  - H3: agents.defaults.bootstrapMaxChars
  - H3: agents.defaults.bootstrapTotalMaxChars
  - H3: Per-agent bootstrap profile overrides
  - H3: agents.defaults.bootstrapPromptTruncationWarning
  - H3: Context budget ownership map
  - H4: agents.defaults.startupContext
  - H4: agents.defaults.contextLimits
  - H4: agents.list[].contextLimits
  - H4: skills.limits.maxSkillsPromptChars
  - H4: agents.list[].skillsLimits.maxSkillsPromptChars
  - H3: agents.defaults.imageMaxDimensionPx
  - H3: agents.defaults.imageQuality
  - H3: agents.defaults.userTimezone
  - H3: agents.defaults.timeFormat
  - H3: agents.defaults.model
  - H3: Runtime policy
  - H3: agents.defaults.cliBackends
  - H3: agents.defaults.promptOverlays
  - H3: agents.defaults.heartbeat
  - H3: agents.defaults.compaction
  - H3: agents.defaults.runRetries
  - H3: agents.defaults.contextPruning
  - H3: Block streaming
  - H3: Typing indicators
  - H3: agents.defaults.sandbox
  - H3: agents.list (per-agent overrides)
  - H2: Multi-agent routing
  - H3: Binding match fields
  - H3: Per-agent access profiles
  - H2: Session
  - H2: Messages
  - H3: Response prefix
  - H3: Ack reaction
  - H3: Inbound debounce
  - H3: TTS (text-to-speech)
  - H2: Talk
  - H2: Related

## gateway/config-channels.md

- Route: /gateway/config-channels
- Headings:
  - H2: Channels
  - H3: DM and group access
  - H3: Channel model overrides
  - H3: Channel defaults and heartbeat
  - H3: WhatsApp
  - H3: Telegram
  - H3: Discord
  - H3: Google Chat
  - H3: Slack
  - H3: Mattermost
  - H3: Signal
  - H3: iMessage
  - H3: Matrix
  - H3: Microsoft Teams
  - H3: IRC
  - H3: Multi-account (all channels)
  - H3: Other plugin channels
  - H3: Group chat mention gating
  - H4: DM history limits
  - H4: Self-chat mode
  - H3: Commands (chat command handling)
  - H2: Related

## gateway/config-tools.md

- Route: /gateway/config-tools
- Headings:
  - H2: Tools
  - H3: Tool profiles
  - H3: Tool groups
  - H3: MCP and plugin tools inside sandbox tool policy
  - H3: tools.codeMode
  - H3: tools.allow / tools.deny
  - H3: tools.byProvider
  - H3: tools.toolsBySender
  - H3: tools.elevated
  - H3: tools.exec
  - H3: tools.loopDetection
  - H3: tools.web
  - H3: tools.media
  - H3: tools.agentToAgent
  - H3: tools.sessions
  - H3: tools.sessionsspawn
  - H3: tools.experimental
  - H3: agents.defaults.subagents
  - H2: Custom providers and base URLs
  - H3: Provider field details
  - H3: Provider examples
  - H2: Related

## gateway/configuration-examples.md

- Route: /gateway/configuration-examples
- Headings:
  - H2: Quick start
  - H3: Absolute minimum
  - H3: Recommended starter
  - H2: Expanded example (major options)
  - H3: Symlinked sibling skill repo
  - H2: Common patterns
  - H3: Shared skill baseline with one override
  - H3: Multi-platform setup
  - H3: Trusted node network auto-approval
  - H3: Secure DM mode (shared inbox / multi-user DMs)
  - H3: Anthropic API key + MiniMax fallback
  - H3: Work bot (restricted access)
  - H3: Local models only
  - H2: Tips
  - H2: Related

## gateway/configuration-reference.md

- Route: /gateway/configuration-reference
- Headings:
  - H2: Channels
  - H2: Agent defaults, multi-agent, sessions, and messages
  - H2: Tools and custom providers
  - H2: Models
  - H2: MCP
  - H2: Skills
  - H2: Plugins
  - H3: Codex harness plugin config
  - H2: Commitments
  - H2: Browser
  - H2: UI
  - H2: Gateway
  - H3: OpenAI-compatible endpoints
  - H3: Multi-instance isolation
  - H3: gateway.tls
  - H3: gateway.reload
  - H2: Hooks
  - H3: Gmail integration
  - H2: Canvas plugin host
  - H2: Discovery
  - H3: mDNS (Bonjour)
  - H3: Wide-area (DNS-SD)
  - H2: Environment
  - H3: env (inline env vars)
  - H3: Env var substitution
  - H2: Secrets
  - H3: SecretRef
  - H3: Supported credential surface
  - H3: Secret providers config
  - H2: Auth storage
  - H3: auth.cooldowns
  - H2: Audit
  - H2: Logging
  - H2: Diagnostics
  - H2: Update
  - H2: ACP
  - H2: CLI
  - H2: Wizard
  - H2: Identity
  - H2: Bridge (legacy, removed)
  - H2: Cron
  - H3: cron.retry
  - H3: cron.failureAlert
  - H3: cron.failureDestination
  - H2: Media model template variables
  - H2: Config includes ($include)
  - H2: Related

## gateway/configuration.mdx

- Route: /gateway/configuration
- Headings:
  - H1: Configuration
  - H2: Minimal config
  - H2: Editing config
  - H2: Strict validation
  - H2: Common tasks
  - H2: Config hot reload
  - H3: Reload modes
  - H3: What hot-applies vs what needs a restart
  - H2: Config RPC (programmatic updates)
  - H2: Environment variables
  - H2: Full reference

## gateway/diagnostics.md

- Route: /gateway/diagnostics
- Headings:
  - H2: Quick start
  - H2: Chat command
  - H2: What the export contains
  - H2: Privacy model
  - H2: Stability recorder
  - H2: Useful options
  - H2: Disable diagnostics
  - H2: Related

## gateway/discovery.md

- Route: /gateway/discovery
- Headings:
  - H2: Terms
  - H2: Why direct and SSH both exist
  - H2: Discovery inputs
  - H3: 1) Bonjour / DNS-SD
  - H4: Service beacon details
  - H3: 2) Tailnet (cross-network)
  - H3: 3) Manual / SSH target
  - H2: Transport selection (client policy)
  - H2: Pairing and auth (direct transport)
  - H2: Responsibilities by component
  - H2: Related

## gateway/doctor.md

- Route: /gateway/doctor
- Headings:
  - H2: Quick start
  - H3: Headless and automation modes
  - H2: Read-only lint mode
  - H2: What it does (summary)
  - H2: Dreams UI backfill and reset
  - H2: Detailed behavior and rationale
  - H2: Related

## gateway/external-apps.md

- Route: /gateway/external-apps
- Headings:
  - H2: What is available today
  - H2: Recommended path
  - H2: App code vs plugin code
  - H2: Related

## gateway/gateway-lock.md

- Route: /gateway/gateway-lock
- Headings:
  - H2: Why
  - H2: Mechanism
  - H2: Error surface
  - H2: Operational notes
  - H2: Related

## gateway/health.md

- Route: /gateway/health
- Headings:
  - H2: Quick checks
  - H2: Deep diagnostics
  - H2: Health monitor config
  - H2: Uptime monitoring
  - H3: Monitoring service setup examples
  - H2: When something fails
  - H2: Dedicated "health" command
  - H2: Related

## gateway/heartbeat.md

- Route: /gateway/heartbeat
- Headings:
  - H2: Quick start (beginner)
  - H2: Defaults
  - H2: What the heartbeat prompt is for
  - H2: Response contract
  - H2: Config
  - H3: Scope and precedence
  - H3: Per-agent heartbeats
  - H3: Active hours example
  - H3: 24/7 setup
  - H3: Multi-account example
  - H3: Field notes
  - H2: Delivery behavior
  - H2: Visibility controls
  - H3: What each flag does
  - H3: Per-channel vs per-account examples
  - H3: Common patterns
  - H2: HEARTBEAT.md (optional)
  - H3: tasks: blocks
  - H3: Can the agent update HEARTBEAT.md?
  - H2: Manual wake (on-demand)
  - H2: Reasoning delivery (optional)
  - H2: Cost awareness
  - H2: Context overflow after heartbeat
  - H2: Related

## gateway/index.mdx

- Route: /gateway
- Headings:
  - H1: Gateway runbook
  - H2: 5-minute local startup
  - H2: Runtime model
  - H3: Port and bind precedence
  - H3: Hot reload modes
  - H2: Operator command set
  - H2: Remote access
  - H2: Supervision and service lifecycle
  - H2: Multiple gateways on one host
  - H3: Dev profile quick path
  - H2: Protocol quick reference (operator view)
  - H2: Operational checks
  - H3: Liveness
  - H3: Readiness
  - H3: Gap recovery
  - H2: Common failure signatures
  - H2: Safety guarantees

## gateway/local-model-services.md

- Route: /gateway/local-model-services
- Headings:
  - H2: How it works
  - H2: Config shape
  - H2: Fields
  - H2: Inferrs example
  - H2: ds4 example
  - H2: Related

## gateway/local-models.md

- Route: /gateway/local-models
- Headings:
  - H2: Hardware floor
  - H2: Pick a backend
  - H2: Recommended: LM Studio + large local model (Responses API)
  - H3: Hybrid config: hosted primary, local fallback
  - H3: Local-first with hosted safety net
  - H3: Regional hosting / data routing
  - H2: Other OpenAI-compatible local proxies
  - H2: Smaller or stricter backends
  - H2: Troubleshooting
  - H2: Related

## gateway/logging.md

- Route: /gateway/logging
- Headings:
  - H1: Logging
  - H2: File-based logger
  - H3: Verbose vs. log levels
  - H2: Console capture
  - H2: Redaction
  - H2: Gateway WebSocket logs
  - H3: WS log style
  - H2: Console formatting (subsystem logging)
  - H2: Related

## gateway/message-delivery.md

- Route: /gateway/message-delivery
- Headings:
  - H1: Message delivery
  - H2: Delivery guarantee: at-least-once
  - H2: The needs-review reconciliation queue
  - H2: Backups contain undelivered message content

## gateway/multiple-gateways.md

- Route: /gateway/multiple-gateways
- Headings:
  - H2: Best recommended setup
  - H2: Rescue-Bot Quickstart
  - H2: Why this works
  - H2: What --profile rescue onboard Changes
  - H2: General multi-gateway setup
  - H2: Isolation checklist
  - H2: Port mapping (derived)
  - H2: Browser/CDP notes (common footgun)
  - H2: Manual env example
  - H2: Quick checks
  - H2: Related

## gateway/network-model.md

- Route: /gateway/network-model
- Headings:
  - H2: Related

## gateway/openai-http-api.md

- Route: /gateway/openai-http-api
- Headings:
  - H2: Authentication
  - H2: Security boundary (important)
  - H2: When to use this endpoint
  - H2: Agent-first model contract
  - H2: Enabling the endpoint
  - H2: Disabling the endpoint
  - H2: Session behavior
  - H2: Why this surface matters
  - H2: Model list and agent routing
  - H2: Streaming (SSE)
  - H2: Chat tool contract
  - H3: Supported request fields
  - H3: Unsupported variants
  - H3: Non-streaming tool response shape
  - H3: Streaming tool response shape
  - H3: Tool follow-up loop
  - H2: Open WebUI quick setup
  - H2: Examples
  - H2: Related

## gateway/openresponses-http-api.md

- Route: /gateway/openresponses-http-api
- Headings:
  - H2: Authentication, security, and routing
  - H2: Session behavior
  - H2: Request shape (supported)
  - H2: Items (input)
  - H3: message
  - H3: functioncalloutput (turn-based tools)
  - H3: reasoning and itemreference
  - H2: Tools (client-side function tools)
  - H2: Images (inputimage)
  - H2: Files (inputfile)
  - H2: File + image limits (config)
  - H2: Streaming (SSE)
  - H2: Usage
  - H2: Errors
  - H2: Examples
  - H2: Related

## gateway/opentelemetry.md

- Route: /gateway/opentelemetry
- Headings:
  - H2: How it fits together
  - H2: Quick start
  - H2: Signals exported
  - H2: Configuration reference
  - H3: Environment variables
  - H2: Privacy and content capture
  - H2: Sampling and flushing
  - H2: Exported metrics
  - H3: Model usage
  - H3: Message flow
  - H3: Talk
  - H3: Queues and sessions
  - H3: Session liveness telemetry
  - H3: Harness lifecycle
  - H3: Exec
  - H3: Diagnostics internals (memory and tool loop)
  - H2: Exported spans
  - H2: Diagnostic event catalog
  - H2: Without an exporter
  - H2: Disable
  - H2: Related

## gateway/operator-scopes.md

- Route: /gateway/operator-scopes
- Headings:
  - H2: Roles
  - H2: Scope levels
  - H2: Method scope is only the first gate
  - H2: Device pairing approvals
  - H2: Node pairing approvals
  - H2: Shared-secret auth

## gateway/pairing.md

- Route: /gateway/pairing
- Headings:
  - H2: Concepts
  - H2: How pairing works
  - H2: CLI workflow (headless friendly)
  - H2: API surface (gateway protocol)
  - H2: Node command gating (2026.3.31+)
  - H2: Node event trust boundaries (2026.3.31+)
  - H2: Auto-approval (macOS app)
  - H2: Trusted-CIDR device auto-approval
  - H2: Metadata-upgrade auto-approval
  - H2: QR pairing helpers
  - H2: Locality and forwarded headers
  - H2: Storage (local, private)
  - H2: Transport behavior
  - H2: Related

## gateway/prometheus.md

- Route: /gateway/prometheus
- Headings:
  - H2: Quick start
  - H2: Metrics exported
  - H2: Label policy
  - H2: PromQL recipes
  - H2: Choosing between Prometheus and OpenTelemetry export
  - H2: Troubleshooting
  - H2: Related

## gateway/protocol.md

- Route: /gateway/protocol
- Headings:
  - H2: Transport
  - H2: Handshake (connect)
  - H3: Node example
  - H2: Framing
  - H2: Roles + scopes
  - H3: Roles
  - H3: Scopes (operator)
  - H3: Caps/commands/permissions (node)
  - H2: Presence
  - H3: Node background alive event
  - H2: Broadcast event scoping
  - H2: Common RPC method families
  - H3: Common event families
  - H3: Node helper methods
  - H3: Task ledger RPCs
  - H3: Operator helper methods
  - H3: models.list views
  - H2: Exec approvals
  - H2: Agent delivery fallback
  - H2: Versioning
  - H3: Client constants
  - H2: Auth
  - H2: Device identity + pairing
  - H3: Device auth migration diagnostics
  - H2: TLS + pinning
  - H2: Scope
  - H2: Related

## gateway/remote-gateway-readme.md

- Route: /gateway/remote-gateway-readme
- Headings:
  - H1: Running RemoteClaw.app with a Remote Gateway
  - H2: Setup
  - H2: How it works
  - H2: Related

## gateway/remote.md

- Route: /gateway/remote
- Headings:
  - H2: The core idea
  - H2: Common VPN and tailnet setups
  - H3: Always-on Gateway in your tailnet
  - H3: Home desktop runs the Gateway
  - H3: Laptop runs the Gateway
  - H2: Command flow (what runs where)
  - H2: SSH tunnel (CLI + tools)
  - H2: CLI remote defaults
  - H2: Credential precedence
  - H2: Chat UI remote access
  - H2: macOS app remote mode
  - H2: Security rules (remote/VPN)
  - H3: macOS: persistent SSH tunnel via LaunchAgent
  - H4: Step 1: add SSH config
  - H4: Step 2: copy SSH key (one-time)
  - H4: Step 3: configure the gateway token
  - H4: Step 4: create the LaunchAgent
  - H4: Step 5: load the LaunchAgent
  - H4: Troubleshooting
  - H2: Related

## gateway/secrets.md

- Route: /gateway/secrets
- Headings:
  - H2: Goals and runtime model
  - H2: Agent-access boundary
  - H2: Active-surface filtering
  - H2: Gateway auth surface diagnostics
  - H2: Onboarding reference preflight
  - H2: SecretRef contract
  - H2: Provider config
  - H2: File-backed API keys
  - H2: Exec integration examples
  - H2: MCP server environment variables
  - H2: Sandbox SSH auth material
  - H2: Supported credential surface
  - H2: Required behavior and precedence
  - H2: Activation triggers
  - H2: Degraded and recovered signals
  - H2: Command-path resolution
  - H2: Audit and configure workflow
  - H2: One-way safety policy
  - H2: Legacy auth compatibility notes
  - H2: Web UI note
  - H2: Related

## gateway/security/audit-checks.md

- Route: /gateway/security/audit-checks
- Headings:
  - H2: Related

## gateway/security/exposure-runbook.md

- Route: /gateway/security/exposure-runbook
- Headings:
  - H2: Choose the exposure pattern
  - H2: Pre-flight inventory
  - H2: Baseline checks
  - H2: Minimum safe baseline
  - H2: DM and group exposure
  - H2: Reverse proxy checks
  - H2: Tool and sandbox review
  - H2: Post-change validation
  - H2: Rollback plan
  - H2: Review checklist

## gateway/security/index.md

- Route: /gateway/security
- Headings:
  - H2: Scope first: personal assistant security model
  - H2: Quick check: openclaw security audit
  - H3: Published package dependency lock
  - H3: Deployment and host trust
  - H3: Secure file operations
  - H3: Shared Slack workspace: real risk
  - H3: Company-shared agent: acceptable pattern
  - H2: Gateway and node trust concept
  - H2: Trust boundary matrix
  - H2: Not vulnerabilities by design
  - H2: Hardened baseline in 60 seconds
  - H2: Shared inbox quick rule
  - H2: Context visibility model
  - H2: What the audit checks (high level)
  - H2: Credential storage map
  - H2: Security audit checklist
  - H2: Security audit glossary
  - H2: Control UI over HTTP
  - H2: Insecure or dangerous flags summary
  - H2: Reverse proxy configuration
  - H2: HSTS and origin notes
  - H2: Local session logs live on disk
  - H2: Undelivered messages live on disk — and in backups
  - H2: Node execution (system.run)
  - H2: Dynamic skills (watcher / remote nodes)
  - H2: The threat model
  - H2: Core concept: access control before intelligence
  - H2: Command authorization model
  - H2: Control plane tools risk
  - H2: Plugins
  - H2: DM access model: pairing, allowlist, open, disabled
  - H2: DM session isolation (multi-user mode)
  - H3: Secure DM mode (recommended)
  - H2: Allowlists for DMs and groups
  - H2: Prompt injection (what it is, why it matters)
  - H2: External content special-token sanitization
  - H2: Unsafe external content bypass flags
  - H3: Prompt injection does not require public DMs
  - H3: Self-hosted LLM backends
  - H3: Model strength (security note)
  - H2: Reasoning and verbose output in groups
  - H2: Configuration hardening examples
  - H3: File permissions
  - H3: Network exposure (bind, port, firewall)
  - H3: Docker port publishing with UFW
  - H3: mDNS/Bonjour discovery
  - H3: Lock down the Gateway WebSocket (local auth)
  - H3: Tailscale Serve identity headers
  - H3: Browser control via node host (recommended)
  - H3: Secrets on disk
  - H3: Workspace .env files
  - H3: Logs and transcripts (redaction and retention)
  - H3: DMs: pairing by default
  - H3: Groups: require mention everywhere
  - H3: Separate numbers (WhatsApp, Signal, Telegram)
  - H3: Read-only mode (via sandbox and tools)
  - H3: Secure baseline (copy/paste)
  - H2: Sandboxing (recommended)
  - H3: Sub-agent delegation guardrail
  - H2: Browser control risks
  - H3: Browser SSRF policy (strict by default)
  - H2: Per-agent access profiles (multi-agent)
  - H3: Example: full access (no sandbox)
  - H3: Example: read-only tools + read-only workspace
  - H3: Example: no filesystem/shell access (provider messaging allowed)
  - H2: Incident response
  - H3: Contain
  - H3: Rotate (assume compromise if secrets leaked)
  - H3: Audit
  - H3: Collect for a report
  - H2: Secret scanning
  - H2: Reporting security issues

## gateway/security/secure-file-operations.md

- Route: /gateway/security/secure-file-operations
- Headings:
  - H2: Default: no Python helper
  - H2: What stays protected without Python
  - H2: What Python adds
  - H2: Plugin and core guidance

## gateway/tailscale.md

- Route: /gateway/tailscale
- Headings:
  - H2: Modes
  - H2: Config examples
  - H3: Tailnet-only (Serve)
  - H3: Tailnet-only (bind to Tailnet IP)
  - H3: Public internet (Funnel + shared password)
  - H2: CLI examples
  - H2: Auth
  - H3: Tailscale identity headers (Serve only)
  - H2: Notes
  - H3: Tailscale prerequisites and limits
  - H2: Browser control (remote Gateway + local browser)
  - H2: Learn more
  - H2: Related

## gateway/tools-invoke-http-api.md

- Route: /gateway/tools-invoke-http-api
- Headings:
  - H2: Authentication
  - H2: Security boundary (important)
  - H2: Request body
  - H2: Policy + routing behavior
  - H2: Responses
  - H2: Example
  - H2: Related

## gateway/troubleshooting.md

- Route: /gateway/troubleshooting
- Headings:
  - H2: Command ladder
  - H2: After an update
  - H2: Split brain installs and newer config guard
  - H2: Protocol mismatch after rollback
  - H2: Skill symlink skipped as path escape
  - H2: Anthropic 429 extra usage required for long context
  - H2: Upstream 403 blocked responses
  - H2: Local OpenAI-compatible backend passes direct probes but agent runs fail
  - H2: No replies
  - H2: Dashboard control UI connectivity
  - H3: Auth detail codes quick map
  - H2: Gateway service not running
  - H2: macOS gateway silently stops responding, then resumes when you touch the dashboard
  - H2: Gateway exits during high memory use
  - H2: Gateway rejected invalid config
  - H2: Gateway probe warnings
  - H2: Channel connected, messages not flowing
  - H2: Cron and heartbeat delivery
  - H2: Node paired, tool fails
  - H2: Browser tool fails
  - H2: If you upgraded and something suddenly broke
  - H2: Related

## gateway/trusted-proxy-auth.md

- Route: /gateway/trusted-proxy-auth
- Headings:
  - H2: When to use
  - H2: When NOT to use
  - H2: How it works
  - H2: Control UI pairing behavior
  - H2: Configuration
  - H3: Configuration reference
  - H2: TLS termination and HSTS
  - H3: Rollout guidance
  - H2: Proxy setup examples
  - H2: Mixed token configuration
  - H2: Operator scopes header
  - H2: Security checklist
  - H2: Security audit
  - H2: Troubleshooting
  - H2: Migration from token auth
  - H2: Related

## help/debugging.md

- Route: /help/debugging
- Headings:
  - H2: Runtime debug overrides
  - H2: Session trace output
  - H2: Plugin lifecycle trace
  - H2: CLI startup and command profiling
  - H2: Gateway watch mode
  - H2: Dev profile + dev gateway (--dev)
  - H2: Raw stream logging (OpenClaw)
  - H2: Raw OpenAI-compatible chunk logging
  - H2: Safety notes
  - H2: Debugging in VSCode
  - H3: Setup
  - H3: Notes
  - H2: Related

## help/environment.md

- Route: /help/environment
- Headings:
  - H2: Precedence (highest → lowest)
  - H2: Provider credentials and workspace .env
  - H2: Config env block
  - H2: Shell env import
  - H2: Exec shell snapshots
  - H2: Runtime-injected env vars
  - H2: UI env vars
  - H2: Env var substitution in config
  - H2: Secret refs vs ${ENV} strings
  - H2: Path-related env vars
  - H2: Logging
  - H3: REMOTECLAWHOME
  - H2: nvm users: webfetch TLS failures
  - H2: Legacy environment variables
  - H2: Related

## help/faq-first-run.md

- Route: /help/faq-first-run
- Headings:
  - H2: Quick start and first-run setup
  - H2: Related

## help/faq-models.md

- Route: /help/faq-models
- Headings:
  - H2: Models: defaults, selection, aliases, switching
  - H2: Model failover and "All models failed"
  - H2: Auth profiles: what they are and how to manage them
  - H2: Related

## help/faq.md

- Route: /help/faq
- Headings:
  - H2: First 60 seconds if something is broken
  - H2: Quick start and first-run setup
  - H2: What is RemoteClaw?
  - H2: Skills and automation
  - H2: Sandboxing and memory
  - H2: Where things live on disk
  - H2: Config basics
  - H2: Remote gateways and nodes
  - H2: Env vars and .env loading
  - H2: Sessions and multiple chats
  - H2: Models, failover, and auth profiles
  - H2: Gateway: ports, "already running", and remote mode
  - H2: Logging and debugging
  - H2: Media and attachments
  - H2: Security and access control
  - H2: Chat commands, aborting tasks, and "it will not stop"
  - H2: Miscellaneous
  - H2: Related

## help/index.md

- Route: /help
- Headings:
  - H2: FAQ
  - H2: Diagnostics
  - H2: Testing
  - H2: Community and meta

## help/scripts.md

- Route: /help/scripts
- Headings:
  - H2: Conventions
  - H2: Auth monitoring scripts
  - H2: GitHub read helper
  - H2: When adding scripts
  - H2: Related

## help/testing-live.md

- Route: /help/testing-live
- Headings:
  - H2: Live: local smoke commands
  - H2: Live: Android node capability sweep
  - H2: Live: model smoke (profile keys)
  - H3: Layer 1: Direct model completion (no gateway)
  - H3: Layer 2: Gateway + dev agent smoke (what "@remoteclaw" actually does)
  - H2: Live: CLI backend smoke (Claude, Gemini, or other local CLIs)
  - H2: Live: APNs HTTP/2 proxy reachability
  - H2: Live: ACP bind smoke (/acp spawn ... --bind here)
  - H2: Live: Codex app-server harness smoke
  - H3: Recommended live recipes
  - H2: Live: model matrix (what we cover)
  - H3: Modern smoke set (tool calling + image)
  - H3: Baseline: tool calling (Read + optional Exec)
  - H3: Vision: image send (attachment → multimodal message)
  - H3: Aggregators / alternate gateways
  - H2: Credentials (never commit)
  - H2: Deepgram live (audio transcription)
  - H2: BytePlus coding plan live
  - H2: ComfyUI workflow media live
  - H2: Image generation live
  - H2: Music generation live
  - H2: Video generation live
  - H2: Media live harness
  - H2: Related

## help/testing-updates-plugins.md

- Route: /help/testing-updates-plugins
- Headings:
  - H2: What we protect
  - H2: Local proof during development
  - H2: Docker lanes
  - H2: Package Acceptance
  - H2: Release default
  - H2: Legacy compatibility
  - H2: Adding coverage
  - H2: Failure triage

## help/testing.md

- Route: /help/testing
- Headings:
  - H2: Quick start
  - H2: QA-specific runners
  - H3: Shared Telegram credentials via Convex (v1)
  - H3: Adding a channel to QA
  - H2: Test suites (what runs where)
  - H3: Unit / integration (default)
  - H3: Stability (gateway)
  - H3: E2E (repo aggregate)
  - H3: E2E (gateway smoke)
  - H3: E2E (Control UI mocked browser)
  - H3: E2E: OpenShell backend smoke
  - H3: Live (real providers + real models)
  - H2: Which suite should I run?
  - H2: Live (network-touching) tests
  - H2: Docker runners (optional "works in Linux" checks)
  - H2: Docs sanity
  - H2: Offline regression (CI-safe)
  - H2: Agent reliability evals (skills)
  - H2: Contract tests (plugin and channel shape)
  - H3: Commands
  - H3: Channel contracts
  - H3: Provider status contracts
  - H3: Provider contracts
  - H3: When to run
  - H2: Adding regressions (guidance)
  - H2: Related

## help/troubleshooting.md

- Route: /help/troubleshooting
- Headings:
  - H2: First 60 seconds
  - H2: Assistant feels limited or missing tools
  - H2: Anthropic long context 429
  - H2: Local OpenAI-compatible backend works directly but fails in RemoteClaw
  - H2: Plugin install fails with missing remoteclaw extensions
  - H2: Install policy blocks plugin installs or updates
  - H2: Plugin present but blocked by suspicious ownership
  - H2: Decision tree
  - H2: Related

## index.mdx

- Route: /
- Headings:
  - H1: RemoteClaw
  - H2: What is RemoteClaw?
  - H2: How it works
  - H2: Key capabilities
  - H2: Quick start
  - H2: Dashboard
  - H2: Configuration (optional)
  - H2: Start here
  - H2: Learn more

## install/ansible.md

- Route: /install/ansible
- Headings:
  - H1: Ansible Installation
  - H2: Prerequisites
  - H2: What You Get
  - H2: Quick Start
  - H2: What Gets Installed
  - H2: Post-Install Setup
  - H3: Quick Commands
  - H2: Security Architecture
  - H2: Manual Installation
  - H2: Updating
  - H2: Troubleshooting
  - H2: Advanced Configuration
  - H2: Related

## install/azure.md

- Route: /install/azure
- Headings:
  - H1: RemoteClaw on Azure Linux VM
  - H2: What you will do
  - H2: What you need
  - H2: Configure deployment
  - H2: Deploy Azure resources
  - H2: Install RemoteClaw
  - H2: Cost considerations
  - H2: Cleanup
  - H2: Next steps

## install/breaking-changes-from-openclaw.md

- Route: /install/breaking-changes-from-openclaw
- Headings:
  - H1: What Are the Breaking Changes from OpenClaw to RemoteClaw?
  - H2: What you lose
  - H2: What you gain
  - H2: What changed
  - H2: What stays the same
  - H2: Migration

## install/bun.md

- Route: /install/bun
- Headings:
  - H1: Bun (Experimental)
  - H2: Install
  - H2: Lifecycle Scripts
  - H2: Caveats

## install/development-channels.md

- Route: /install/development-channels
- Headings:
  - H1: Development channels
  - H2: Switching channels
  - H2: One-off version or tag targeting
  - H2: Dry run
  - H2: Plugins and channels
  - H2: Checking current status
  - H2: Tagging best practices
  - H2: macOS app availability

## install/digitalocean.md

- Route: /install/digitalocean
- Headings:
  - H1: DigitalOcean
  - H2: Prerequisites
  - H2: Setup
  - H2: Troubleshooting
  - H2: Next steps

## install/docker-vm-runtime.md

- Route: /install/docker-vm-runtime
- Headings:
  - H1: Docker VM Runtime
  - H2: Bake required binaries into the image
  - H2: Build and launch
  - H2: What persists where
  - H2: Updates

## install/docker.md

- Route: /install/docker
- Headings:
  - H1: Docker (optional)
  - H2: Is Docker right for me?
  - H2: Prerequisites
  - H2: Containerized Gateway
  - H3: Manual flow
  - H3: Environment variables
  - H3: Health checks
  - H3: LAN vs loopback
  - H3: Storage and persistence
  - H3: Shell helpers (optional)
  - H3: Running on a VPS?
  - H2: Agent Sandbox
  - H3: Quick enable
  - H2: Troubleshooting

## install/exe-dev.md

- Route: /install/exe-dev
- Headings:
  - H1: exe.dev
  - H2: Beginner quick path
  - H2: What you need
  - H2: Automated Install with Shelley
  - H2: Manual installation
  - H2: 1) Create the VM
  - H2: 2) Install prerequisites (on the VM)
  - H2: 3) Install RemoteClaw
  - H2: 4) Setup nginx to proxy RemoteClaw to port 8000
  - H2: 5) Access RemoteClaw and grant privileges
  - H2: Remote Access
  - H2: Updating

## install/fly.md

- Route: /install/fly
- Headings:
  - H1: Fly.io Deployment
  - H2: What you need
  - H2: Beginner quick path
  - H2: Troubleshooting
  - H3: "App is not listening on expected address"
  - H3: Health checks failing / connection refused
  - H3: OOM / Memory Issues
  - H3: Gateway Lock Issues
  - H3: Config Not Being Read
  - H3: Writing Config via SSH
  - H3: State Not Persisting
  - H2: Updates
  - H3: Updating Machine Command
  - H2: Private Deployment (Hardened)
  - H3: When to use private deployment
  - H3: Setup
  - H3: Accessing a private deployment
  - H3: Webhooks with private deployment
  - H3: Security benefits
  - H2: Notes
  - H2: Cost
  - H2: Next steps

## install/from-openclaw.mdx

- Route: /install/from-openclaw
- Headings:
  - H1: How Do I Migrate from OpenClaw to RemoteClaw?
  - H2: Before you start
  - H2: Migration steps
  - H2: What gets migrated
  - H2: What does NOT migrate
  - H2: Edge cases
  - H3: Custom extensions using Pi APIs
  - H3: Multiple OpenClaw installations
  - H3: Existing /.remoteclaw directory

## install/gcp.md

- Route: /install/gcp
- Headings:
  - H1: RemoteClaw on GCP Compute Engine (Docker, Production VPS Guide)
  - H2: Goal
  - H2: What are we doing (simple terms)?
  - H2: Quick path (experienced operators)
  - H2: What you need
  - H2: Troubleshooting
  - H2: Service accounts (security best practice)
  - H2: Next steps

## install/hetzner.md

- Route: /install/hetzner
- Headings:
  - H1: RemoteClaw on Hetzner (Docker, Production VPS Guide)
  - H2: Goal
  - H2: What are we doing (simple terms)?
  - H2: Quick path (experienced operators)
  - H2: What you need
  - H2: Infrastructure as Code (Terraform)
  - H2: Next steps

## install/index.mdx

- Route: /install
- Headings:
  - H1: Install
  - H2: System requirements
  - H2: Install methods
  - H2: Other install methods
  - H2: After install
  - H2: Troubleshooting: remoteclaw not found
  - H2: Update / migrate / uninstall

## install/installer.mdx

- Route: /install/installer
- Headings:
  - H1: Installer internals
  - H2: Quick commands
  - H2: install.sh
  - H3: Flow (install.sh)
  - H3: Source checkout detection
  - H3: Examples (install.sh)
  - H2: install-cli.sh
  - H3: Flow (install-cli.sh)
  - H3: Examples (install-cli.sh)
  - H2: install.ps1
  - H3: Flow (install.ps1)
  - H3: Examples (install.ps1)
  - H2: CI and automation
  - H2: Troubleshooting

## install/macos-vm.md

- Route: /install/macos-vm
- Headings:
  - H1: RemoteClaw on macOS VMs (Sandboxing)
  - H2: Recommended default (most users)
  - H2: macOS VM options
  - H3: Local VM on your Apple Silicon Mac (Lume)
  - H3: Hosted Mac providers (cloud)
  - H2: Quick path (Lume, experienced users)
  - H2: What you need (Lume)
  - H2: 1) Install Lume
  - H2: 2) Create the macOS VM
  - H2: 3) Complete Setup Assistant
  - H2: 4) Get the VM IP address
  - H2: 5) SSH into the VM
  - H2: 6) Install RemoteClaw
  - H2: 7) Configure channels
  - H2: 8) Run the VM headlessly
  - H2: Bonus: iMessage integration
  - H2: Save a golden image
  - H2: Running 24/7
  - H2: Troubleshooting
  - H2: Related docs

## install/migrating.md

- Route: /install/migrating
- Headings:
  - H1: Migrating RemoteClaw to a New Machine
  - H2: What Gets Migrated
  - H2: Migration Steps
  - H2: Common Pitfalls
  - H2: Verification Checklist

## install/nix.md

- Route: /install/nix
- Headings:
  - H1: Nix Installation
  - H2: What You Get
  - H2: Quick Start
  - H2: Nix Mode Runtime Behavior
  - H3: What changes in Nix mode
  - H3: Config and state paths
  - H2: Related

## install/node.mdx

- Route: /install/node
- Headings:
  - H1: Node.js
  - H2: Check your version
  - H2: Install Node
  - H2: Troubleshooting
  - H3: remoteclaw: command not found
  - H3: Permission errors on npm install -g (Linux)

## install/northflank.mdx

- Route: /install/northflank
- Headings:
  - H2: How to get started
  - H2: What you get
  - H2: Connect a channel
  - H2: Next steps

## install/oracle.md

- Route: /install/oracle
- Headings:
  - H1: Oracle Cloud
  - H2: Prerequisites
  - H2: Setup
  - H2: Fallback: SSH tunnel
  - H2: Troubleshooting
  - H2: Next steps

## install/podman.md

- Route: /install/podman
- Headings:
  - H1: Podman
  - H2: Prerequisites
  - H2: Quick start
  - H2: Podman + Tailscale
  - H2: Systemd (Quadlet, optional)
  - H2: Config, env, and storage
  - H2: Useful commands
  - H2: Troubleshooting
  - H2: Related

## install/railway.mdx

- Route: /install/railway
- Headings:
  - H2: Quick checklist (new users)
  - H2: One-click deploy
  - H2: What you get
  - H2: Required Railway settings
  - H3: Public Networking
  - H3: Volume (required)
  - H3: Variables
  - H2: Connect a channel
  - H2: Backups &amp; migration
  - H2: Next steps

## install/raspberry-pi.md

- Route: /install/raspberry-pi
- Headings:
  - H1: Raspberry Pi
  - H2: Prerequisites
  - H2: Setup
  - H2: Performance tips
  - H2: Troubleshooting
  - H2: Next steps

## install/render.mdx

- Route: /install/render
- Headings:
  - H2: Prerequisites
  - H2: Deploy with a Render Blueprint
  - H2: Understanding the Blueprint
  - H2: Choosing a plan
  - H2: After deployment
  - H3: Access the Control UI
  - H2: Render Dashboard features
  - H3: Logs
  - H3: Shell access
  - H3: Environment variables
  - H3: Auto-deploy
  - H2: Custom domain
  - H2: Scaling
  - H2: Backups and migration
  - H2: Troubleshooting
  - H3: Service will not start
  - H3: Slow cold starts (free tier)
  - H3: Data loss after redeploy
  - H3: Health check failures
  - H2: Next steps

## install/uninstall.md

- Route: /install/uninstall
- Headings:
  - H1: Uninstall
  - H2: Easy path (CLI still installed)
  - H2: Manual service removal (CLI not installed)
  - H3: macOS (launchd)
  - H3: Linux (systemd user unit)
  - H3: Windows (Scheduled Task)
  - H2: Normal install vs source checkout
  - H3: Normal install (install.sh / npm / pnpm / bun)
  - H3: Source checkout (git clone)

## install/updating.md

- Route: /install/updating
- Headings:
  - H1: Updating
  - H2: Recommended: remoteclaw update
  - H2: Alternative: re-run the installer
  - H2: Alternative: manual npm or pnpm
  - H2: Auto-updater
  - H2: After updating
  - H3: Run doctor
  - H3: Restart the gateway
  - H3: Verify
  - H2: Rollback
  - H3: Pin a version (npm)
  - H3: Pin a commit (source)
  - H2: If you are stuck
  - H2: Related

## landscape.md

- Route: /landscape
- Headings:
  - H2: Two Kinds of Users
  - H2: The Fork Explosion
  - H2: The Missing Category
  - H2: The Convergence Evidence
  - H2: What Agent Middleware Actually Does
  - H2: The Landscape
  - H2: Why We Built RemoteClaw

## logging.md

- Route: /logging
- Headings:
  - H2: Where logs live
  - H2: How to read logs
  - H3: CLI: live tail (recommended)
  - H3: Control UI (web)
  - H3: Channel-only logs
  - H2: Log formats
  - H3: File logs (JSONL)
  - H3: Console output
  - H3: Gateway WebSocket logs
  - H2: Configuring logging
  - H3: Log levels
  - H3: Targeted model transport diagnostics
  - H3: Trace correlation
  - H3: Model call size and timing
  - H3: Console styles
  - H3: Redaction
  - H2: Diagnostics and OpenTelemetry
  - H2: Troubleshooting tips
  - H2: Related

## network.md

- Route: /network
- Headings:
  - H2: Core model
  - H2: Pairing + identity
  - H2: Discovery + transports
  - H2: Nodes + transports
  - H2: Security
  - H2: Related

## nodes/audio.md

- Route: /nodes/audio
- Headings:
  - H2: What it does
  - H2: Auto-detection (default)
  - H2: Config examples
  - H3: Provider + CLI fallback (OpenAI + Whisper CLI)
  - H3: Provider-only with scope gating
  - H3: Provider-only (Deepgram)
  - H3: Provider-only (Mistral Voxtral)
  - H3: Provider-only (SenseAudio)
  - H3: Echo transcript to chat (opt-in)
  - H2: Notes and limits
  - H3: Proxy environment support
  - H2: Mention detection in groups
  - H2: Gotchas
  - H2: Related

## nodes/camera.md

- Route: /nodes/camera
- Headings:
  - H2: iOS node
  - H3: iOS user setting
  - H3: iOS commands (via Gateway node.invoke)
  - H3: iOS foreground requirement
  - H3: CLI helper
  - H2: Android node
  - H3: Android user setting
  - H3: Permissions
  - H3: Android foreground requirement
  - H3: Android commands (via Gateway node.invoke)
  - H2: macOS app
  - H3: macOS user setting
  - H3: CLI helper (node invoke)
  - H2: Safety + practical limits
  - H2: macOS screen video (OS-level)
  - H2: Related

## nodes/images.md

- Route: /nodes/images
- Headings:
  - H2: Goals
  - H2: CLI Surface
  - H2: WhatsApp Web channel behavior
  - H2: Auto-Reply Pipeline
  - H2: Inbound Media To Commands
  - H2: Limits and errors
  - H2: Notes for Tests
  - H2: Related

## nodes/index.md

- Route: /nodes
- Headings:
  - H2: Pairing + status
  - H2: Version skew and upgrade order
  - H2: Remote node host (system.run)
  - H3: Start a node host (foreground)
  - H3: Remote gateway via SSH tunnel (loopback bind)
  - H3: Start a node host (service)
  - H3: Pair + name
  - H3: Allowlist the commands
  - H3: Point exec at the node
  - H3: Local model inference
  - H2: Invoking commands
  - H2: Command policy
  - H2: Config (remoteclaw.json)
  - H2: Screenshots (canvas snapshots)
  - H3: Canvas controls
  - H3: A2UI (Canvas)
  - H2: Photos + videos (node camera)
  - H2: Screen recordings (nodes)
  - H2: Location (nodes)
  - H2: SMS (Android nodes)
  - H2: Device and personal data commands
  - H2: System commands (node host / mac node)
  - H2: Exec node binding
  - H2: Permissions map
  - H2: Headless node host (cross-platform)
  - H2: Mac node mode

## nodes/location-command.md

- Route: /nodes/location-command
- Headings:
  - H2: TL;DR
  - H2: Why a selector (not just a switch)
  - H2: Settings model
  - H2: Permissions mapping (node.permissions)
  - H2: Command: location.get
  - H2: Background behavior
  - H2: Model/tooling integration
  - H2: UX copy (suggested)
  - H2: Related

## nodes/media-understanding.md

- Route: /nodes/media-understanding
- Headings:
  - H2: How it works
  - H2: Config
  - H3: Model entries
  - H3: Provider credentials
  - H2: Rules and behavior
  - H3: Auto-detect (default)
  - H3: Proxy support (audio/video provider calls)
  - H2: Capabilities
  - H2: Provider support matrix
  - H2: Model selection guidance
  - H2: Attachment policy
  - H3: File-attachment extraction
  - H2: Config examples
  - H2: Status output
  - H2: Notes
  - H2: Related

## nodes/talk.md

- Route: /nodes/talk
- Headings:
  - H2: Behavior (macOS)
  - H2: Voice directives in replies
  - H2: Config (/.remoteclaw/remoteclaw.json)
  - H2: macOS UI
  - H2: Android UI
  - H2: Notes
  - H2: Related

## nodes/troubleshooting.md

- Route: /nodes/troubleshooting
- Headings:
  - H2: Command ladder
  - H2: Foreground requirements
  - H2: Permissions matrix
  - H2: Pairing versus approvals
  - H2: Common node error codes
  - H2: Fast recovery loop
  - H2: Related

## nodes/voicewake.md

- Route: /nodes/voicewake
- Headings:
  - H2: Storage
  - H2: Protocol
  - H3: Trigger list
  - H3: Routing (trigger to target)
  - H3: Events
  - H2: Client behavior
  - H2: Related

## perplexity.md

- Route: /perplexity
- Headings:
  - H2: Related

## plan/codex-context-engine-harness.md

- Route: /plan/codex-context-engine-harness
- Headings:
  - H2: Status
  - H2: Goal
  - H2: Non-goals
  - H2: Current architecture
  - H2: Current gap
  - H2: Desired behavior
  - H2: Design constraints
  - H3: Codex app-server remains canonical for native thread state
  - H3: Context engine assembly must be projected into Codex inputs
  - H3: Prompt-cache stability matters
  - H3: Runtime selection semantics do not change
  - H2: Implementation plan
  - H3: 1. Export or relocate reusable context-engine attempt helpers
  - H3: 2. Add a Codex context projection helper
  - H3: 3. Wire bootstrap before Codex thread startup
  - H3: 4. Wire assemble before thread/start / thread/resume and turn/start
  - H3: 5. Preserve prompt-cache stable formatting
  - H3: 6. Wire post-turn after transcript mirroring
  - H3: 7. Normalize usage and prompt-cache runtime context
  - H3: 8. Compaction policy
  - H4: /compact and explicit OpenClaw compaction
  - H4: In-turn Codex native contextCompaction events
  - H3: 9. Session reset and binding behavior
  - H3: 10. Error handling
  - H2: Test plan
  - H3: Unit tests
  - H3: Existing tests to update
  - H3: Integration / live tests
  - H2: Observability
  - H2: Migration / compatibility
  - H2: Open questions
  - H2: Acceptance criteria

## plan/ui-channels.md

- Route: /plan/ui-channels
- Headings:
  - H2: Status
  - H2: Problem
  - H2: Goals
  - H2: Non goals
  - H2: Target model
  - H2: Delivery metadata
  - H2: Runtime capability contract
  - H2: Channel mapping
  - H2: Refactor steps
  - H2: Tests
  - H2: Open questions
  - H2: Related

## platforms/android.md

- Route: /platforms/android
- Headings:
  - H1: Android App (Node)
  - H2: Support snapshot
  - H2: System control
  - H2: Connection Runbook
  - H3: Prerequisites
  - H3: 1) Start the Gateway
  - H3: 2) Verify discovery (optional)
  - H4: Tailnet (Vienna ⇄ London) discovery via unicast DNS-SD
  - H3: 3) Connect from Android
  - H3: 4) Approve pairing (CLI)
  - H3: 5) Verify the node is connected
  - H3: 6) Chat + history
  - H3: 7) Canvas + camera
  - H4: Gateway Canvas Host (recommended for web content)
  - H3: 8) Voice + expanded Android command surface
  - H2: Assistant entrypoints
  - H2: Notification forwarding

## platforms/digitalocean.md

- Route: /platforms/digitalocean
- Headings:
  - H1: RemoteClaw on DigitalOcean
  - H2: Goal
  - H2: Cost Comparison (2026)
  - H2: Prerequisites
  - H2: 1) Create a Droplet
  - H2: 2) Connect via SSH
  - H2: 3) Install RemoteClaw
  - H2: 4) Run Onboarding
  - H2: 5) Verify the Gateway
  - H2: 6) Access the Dashboard
  - H2: 7) Connect Your Channels
  - H3: Telegram
  - H3: WhatsApp
  - H2: Optimizations for 1GB RAM
  - H3: Add swap (recommended)
  - H3: Use a lighter model
  - H3: Monitor memory
  - H2: Persistence
  - H2: Oracle Cloud Free Alternative
  - H2: Troubleshooting
  - H3: Gateway will not start
  - H3: Port already in use
  - H3: Out of memory
  - H2: See Also

## platforms/index.md

- Route: /platforms
- Headings:
  - H1: Platforms
  - H2: Choose your OS
  - H2: VPS &amp; hosting
  - H2: Common links
  - H2: Gateway service install (CLI)

## platforms/ios.md

- Route: /platforms/ios
- Headings:
  - H1: iOS App (Node)
  - H2: What it does
  - H2: Requirements
  - H2: Quick start (pair + connect)
  - H2: Relay-backed push for official builds
  - H2: Authentication and trust flow
  - H2: Discovery paths
  - H3: Bonjour (LAN)
  - H3: Tailnet (cross-network)
  - H3: Manual host/port
  - H2: Canvas + A2UI
  - H3: Canvas eval / snapshot
  - H2: Voice wake + talk mode
  - H2: Common errors
  - H2: Related docs

## platforms/linux.md

- Route: /platforms/linux
- Headings:
  - H1: Linux App
  - H2: Beginner quick path (VPS)
  - H2: Install
  - H2: Gateway
  - H2: Gateway service install (CLI)
  - H2: System control (systemd user unit)

## platforms/mac/bundled-gateway.md

- Route: /platforms/mac/bundled-gateway
- Headings:
  - H1: Gateway on macOS (external launchd)
  - H2: Install the CLI (required for local mode)
  - H2: Launchd (Gateway as LaunchAgent)
  - H2: Version compatibility
  - H2: Smoke check

## platforms/mac/canvas.md

- Route: /platforms/mac/canvas
- Headings:
  - H1: Canvas (macOS app)
  - H2: Where Canvas lives
  - H2: Panel behavior
  - H2: Agent API surface
  - H2: A2UI in Canvas
  - H3: A2UI commands (v0.8)
  - H2: Triggering agent runs from Canvas
  - H2: Security notes

## platforms/mac/child-process.md

- Route: /platforms/mac/child-process
- Headings:
  - H1: Gateway lifecycle on macOS
  - H2: Default behavior (launchd)
  - H2: Unsigned dev builds
  - H2: Attach-only mode
  - H2: Remote mode
  - H2: Why we prefer launchd

## platforms/mac/dev-setup.md

- Route: /platforms/mac/dev-setup
- Headings:
  - H1: macOS Developer Setup
  - H2: Prerequisites
  - H2: 1. Install Dependencies
  - H2: 2. Build and Package the App
  - H2: 3. Install the CLI
  - H2: Troubleshooting
  - H3: Build Fails: Toolchain or SDK Mismatch
  - H3: App Crashes on Permission Grant
  - H3: Gateway "Starting..." indefinitely

## platforms/mac/health.md

- Route: /platforms/mac/health
- Headings:
  - H1: Health Checks on macOS
  - H2: Menu bar
  - H2: Settings
  - H2: How the probe works
  - H2: When in doubt

## platforms/mac/icon.md

- Route: /platforms/mac/icon
- Headings:
  - H1: Menu Bar Icon States

## platforms/mac/logging.md

- Route: /platforms/mac/logging
- Headings:
  - H1: Logging (macOS)
  - H2: Rolling diagnostics file log (Debug pane)
  - H2: Unified logging private data on macOS
  - H2: Enable for RemoteClaw (org.remoteclaw)
  - H2: Disable after debugging

## platforms/mac/menu-bar.md

- Route: /platforms/mac/menu-bar
- Headings:
  - H1: Menu Bar Status Logic
  - H2: What is shown
  - H2: State model
  - H2: IconState enum (Swift)
  - H3: ActivityKind → glyph
  - H3: Visual mapping
  - H2: Status row text (menu)
  - H2: Event ingestion
  - H2: Debug override
  - H2: Testing checklist

## platforms/mac/peekaboo.md

- Route: /platforms/mac/peekaboo
- Headings:
  - H1: Peekaboo Bridge (macOS UI automation)
  - H2: What this is (and is not)
  - H2: Enable the bridge
  - H2: Client discovery order
  - H2: Security &amp; permissions
  - H2: Snapshot behavior (automation)
  - H2: Troubleshooting

## platforms/mac/permissions.md

- Route: /platforms/mac/permissions
- Headings:
  - H1: macOS permissions (TCC)
  - H2: Requirements for stable permissions
  - H2: Recovery checklist when prompts disappear
  - H2: Files and folders permissions (Desktop/Documents/Downloads)

## platforms/mac/release.md

- Route: /platforms/mac/release
- Headings:
  - H1: RemoteClaw macOS release (Sparkle)
  - H2: Prereqs
  - H2: Build &amp; package
  - H2: Appcast entry
  - H2: Publish &amp; verify

## platforms/mac/remote.md

- Route: /platforms/mac/remote
- Headings:
  - H1: Remote RemoteClaw (macOS ⇄ remote host)
  - H2: Modes
  - H2: Remote transports
  - H2: Prereqs on the remote host
  - H2: macOS app setup
  - H2: Web Chat
  - H2: Permissions
  - H2: Security notes
  - H2: WhatsApp login flow (remote)
  - H2: Troubleshooting
  - H2: Notification sounds

## platforms/mac/signing.md

- Route: /platforms/mac/signing
- Headings:
  - H1: mac signing (debug builds)
  - H2: Usage
  - H3: Ad-hoc Signing Note
  - H2: Build metadata for About
  - H2: Why

## platforms/mac/voice-overlay.md

- Route: /platforms/mac/voice-overlay
- Headings:
  - H1: Voice Overlay Lifecycle (macOS)
  - H2: Current intent
  - H2: Implemented (Dec 9, 2025)
  - H2: Next steps
  - H2: Debugging checklist
  - H2: Migration steps (suggested)

## platforms/mac/voicewake.md

- Route: /platforms/mac/voicewake
- Headings:
  - H1: Voice Wake &amp; Push-to-Talk
  - H2: Modes
  - H2: Runtime behavior (wake-word)
  - H2: Lifecycle invariants
  - H2: Sticky overlay failure mode (previous)
  - H2: Push-to-talk specifics
  - H2: User-facing settings
  - H2: Forwarding behavior
  - H2: Forwarding payload
  - H2: Quick verification

## platforms/mac/webchat.md

- Route: /platforms/mac/webchat
- Headings:
  - H1: WebChat (macOS app)
  - H2: Launch &amp; debugging
  - H2: How it is wired
  - H2: Security surface
  - H2: Known limitations

## platforms/mac/xpc.md

- Route: /platforms/mac/xpc
- Headings:
  - H1: RemoteClaw macOS IPC architecture
  - H2: Goals
  - H2: How it works
  - H3: Gateway + node transport
  - H3: Node service + app IPC
  - H3: PeekabooBridge (UI automation)
  - H2: Operational flows
  - H2: Hardening notes

## platforms/macos.md

- Route: /platforms/macos
- Headings:
  - H1: RemoteClaw macOS Companion (menu bar + gateway broker)
  - H2: What it does
  - H2: Local vs remote mode
  - H2: Launchd control
  - H2: Node capabilities (mac)
  - H2: Exec approvals (system.run)
  - H2: Deep links
  - H3: remoteclaw://agent
  - H2: Onboarding flow (typical)
  - H2: State dir placement (macOS)
  - H2: Build &amp; dev workflow (native)
  - H2: Debug gateway connectivity (macOS CLI)
  - H2: Remote connection plumbing (SSH tunnels)
  - H3: Control tunnel (Gateway WebSocket port)
  - H2: Related docs

## platforms/oracle.md

- Route: /platforms/oracle
- Headings:
  - H1: RemoteClaw on Oracle Cloud (OCI)
  - H2: Goal
  - H2: Cost Comparison (2026)
  - H2: Prerequisites
  - H2: 1) Create an OCI Instance
  - H2: 2) Connect and Update
  - H2: 3) Configure User and Hostname
  - H2: 4) Install Tailscale
  - H2: 5) Install RemoteClaw
  - H2: 6) Configure Gateway (loopback + token auth) and enable Tailscale Serve
  - H2: 7) Verify
  - H2: 8) Lock Down VCN Security
  - H2: Access the Control UI
  - H2: Security: VCN + Tailscale (recommended baseline)
  - H3: Already protected
  - H3: Still Recommended
  - H3: Verify Security Posture
  - H2: Fallback: SSH Tunnel
  - H2: Troubleshooting
  - H3: Instance creation fails ("Out of capacity")
  - H3: Tailscale will not connect
  - H3: Gateway will not start
  - H3: Cannot reach Control UI
  - H3: ARM binary issues
  - H2: Persistence
  - H2: See Also

## platforms/raspberry-pi.md

- Route: /platforms/raspberry-pi
- Headings:
  - H1: RemoteClaw on Raspberry Pi
  - H2: Goal
  - H2: Hardware Requirements
  - H2: What you need
  - H2: 1) Flash the OS
  - H2: 2) Connect via SSH
  - H2: 3) System Setup
  - H2: 4) Install Node.js 24 (ARM64)
  - H2: 5) Add Swap (Important for 2GB or less)
  - H2: 6) Install RemoteClaw
  - H3: Option A: Standard Install (Recommended)
  - H3: Option B: Hackable Install (For tinkering)
  - H2: 7) Run Onboarding
  - H2: 8) Verify Installation
  - H2: 9) Access the RemoteClaw Dashboard
  - H2: Performance Optimizations
  - H3: Use a USB SSD (Huge Improvement)
  - H3: Speed up CLI startup (module compile cache)
  - H3: systemd startup tuning (optional)
  - H3: Reduce Memory Usage
  - H3: Monitor Resources
  - H2: ARM-Specific Notes
  - H3: Binary Compatibility
  - H3: 32-bit vs 64-bit
  - H2: Recommended Model Setup
  - H2: Auto-Start on Boot
  - H2: Troubleshooting
  - H3: Out of Memory (OOM)
  - H3: Slow Performance
  - H3: Service will not start
  - H3: ARM Binary Issues
  - H3: WiFi Drops
  - H2: Cost Comparison
  - H2: See Also

## platforms/windows.md

- Route: /platforms/windows
- Headings:
  - H1: Windows
  - H2: WSL2 (recommended)
  - H2: Native Windows status
  - H2: Gateway
  - H2: Gateway service install (CLI)
  - H2: Gateway auto-start before Windows login
  - H3: 1) Keep user services running without login
  - H3: 2) Install the RemoteClaw gateway user service
  - H3: 3) Start WSL automatically at Windows boot
  - H3: Verify startup chain
  - H2: Advanced: expose WSL services over LAN (portproxy)
  - H2: Step-by-step WSL2 install
  - H3: 1) Install WSL2 + Ubuntu
  - H3: 2) Enable systemd (required for gateway install)
  - H3: 3) Install RemoteClaw (inside WSL)
  - H2: Windows companion app

## plugins/adding-capabilities.md

- Route: /plugins/adding-capabilities
- Headings:
  - H2: When to create a capability
  - H2: The standard sequence
  - H2: What goes where
  - H2: Provider and harness seams
  - H2: File checklist
  - H2: Worked example: image generation
  - H2: Embedding providers
  - H2: Review checklist
  - H2: Related

## plugins/agent-tools.md

- Route: /plugins/agent-tools
- Headings:
  - H2: Related

## plugins/architecture-internals.md

- Route: /plugins/architecture-internals
- Headings:
  - H2: Load pipeline
  - H3: Manifest-first behavior
  - H3: Plugin cache boundary
  - H2: Registry model
  - H2: Conversation binding callbacks
  - H2: Provider runtime hooks
  - H3: Hook order and usage
  - H3: Provider example
  - H3: Built-in examples
  - H2: Runtime helpers
  - H3: api.runtime.imageGeneration
  - H2: Gateway HTTP routes
  - H2: Plugin SDK import paths
  - H2: Message tool schemas
  - H2: Channel target resolution
  - H2: Config-backed directories
  - H2: Provider catalogs
  - H2: Read-only channel inspection
  - H2: Package packs
  - H3: Channel catalog metadata
  - H2: Context engine plugins
  - H2: Adding a new capability
  - H3: Capability checklist
  - H3: Capability template
  - H2: Related

## plugins/building-extensions.md

- Route: /plugins/building-extensions
- Headings:
  - H2: Related

## plugins/building-plugins.md

- Route: /plugins/building-plugins
- Headings:
  - H2: Requirements
  - H2: Choose the plugin shape
  - H2: Quickstart
  - H2: Registering tools
  - H2: Import conventions
  - H2: Pre-submission checklist
  - H2: Test against beta releases
  - H2: Next steps
  - H2: Related

## plugins/codex-computer-use.md

- Route: /plugins/codex-computer-use
- Headings:
  - H2: OpenClaw.app and Peekaboo
  - H2: iOS app
  - H2: Direct cua-driver MCP
  - H2: Quick setup
  - H2: Commands
  - H2: Marketplace choices
  - H2: Bundled macOS marketplace
  - H2: Remote catalog limit
  - H2: Configuration reference
  - H2: What OpenClaw checks
  - H2: macOS permissions
  - H2: Troubleshooting
  - H2: Related

## plugins/codex-harness-reference.md

- Route: /plugins/codex-harness-reference
- Headings:
  - H2: Plugin config surface
  - H2: App-server transport
  - H2: Approval and sandbox modes
  - H2: Sandboxed native execution
  - H2: Auth and environment isolation
  - H2: Dynamic tools
  - H2: Timeouts
  - H2: Model discovery
  - H2: Workspace bootstrap files
  - H2: Environment overrides
  - H2: Related

## plugins/codex-harness-runtime.md

- Route: /plugins/codex-harness-runtime
- Headings:
  - H2: Overview
  - H2: Thread bindings and model changes
  - H2: Visible replies and heartbeats
  - H2: Hook boundaries
  - H2: V1 support contract
  - H2: Native permissions and MCP elicitations
  - H2: Queue steering
  - H2: Codex feedback upload
  - H2: Compaction and transcript mirror
  - H2: Media and delivery
  - H2: Related

## plugins/codex-harness.md

- Route: /plugins/codex-harness
- Headings:
  - H2: Requirements
  - H2: Quickstart
  - H2: Configuration
  - H2: Verify Codex runtime
  - H2: Routing and model selection
  - H2: Deployment patterns
  - H3: Basic Codex deployment
  - H3: Mixed provider deployment
  - H3: Fail-closed Codex deployment
  - H2: App-server policy
  - H2: Commands and diagnostics
  - H3: Inspect Codex threads locally
  - H2: Native Codex plugins
  - H2: Computer Use
  - H2: Runtime boundaries
  - H2: Troubleshooting
  - H2: Related

## plugins/codex-native-plugins.md

- Route: /plugins/codex-native-plugins
- Headings:
  - H2: Requirements
  - H2: Quickstart
  - H2: Manage plugins from chat
  - H2: How native plugin setup works
  - H2: V1 support boundary
  - H2: App inventory and ownership
  - H2: Connected account apps
  - H2: Thread app config
  - H2: Destructive action policy
  - H2: Troubleshooting
  - H2: Related

## plugins/community.md

- Route: /plugins/community
- Headings:
  - H2: Listed plugins
  - H3: Apify
  - H3: Codex App Server Bridge
  - H3: DingTalk
  - H3: Lossless Claw (LCM)
  - H3: Opik
  - H3: Prometheus Avatar
  - H3: QQbot
  - H3: wecom
  - H3: Yuanbao
  - H2: Submit your plugin
  - H2: Quality bar
  - H2: Related

## plugins/compatibility.md

- Route: /plugins/compatibility
- Headings:
  - H2: Compatibility registry
  - H2: Deprecation policy
  - H2: Current compatibility areas
  - H3: WhatsApp inbound callback flat aliases
  - H3: WhatsApp inbound admission fields
  - H2: Plugin inspector package
  - H3: Maintainer acceptance lane
  - H2: Release notes

## plugins/dependency-resolution.md

- Route: /plugins/dependency-resolution
- Headings:
  - H2: Responsibility split
  - H2: Install roots
  - H2: Local plugins
  - H2: Startup and reload
  - H2: Bundled plugins
  - H2: Legacy cleanup

## plugins/google-meet.md

- Route: /plugins/google-meet
- Headings:
  - H2: Quick start
  - H3: Create a meeting
  - H3: Observe-only join
  - H3: Realtime session health
  - H2: Local Gateway + Parallels Chrome
  - H3: Common failure checks
  - H2: Install notes
  - H2: Transports
  - H3: Chrome
  - H3: Twilio
  - H2: OAuth and preflight
  - H3: Create Google credentials
  - H3: Mint the refresh token
  - H3: Verify OAuth with doctor
  - H3: Resolve, preflight, and read artifacts
  - H3: Live smoke test
  - H3: Create examples
  - H2: Config
  - H3: Defaults
  - H3: Optional overrides
  - H2: Tool
  - H2: Agent and bidi modes
  - H2: Live test checklist
  - H2: Troubleshooting
  - H3: Agent cannot see the Google Meet tool
  - H3: No connected Google Meet-capable node
  - H3: Browser opens but agent cannot join
  - H3: Meeting creation fails
  - H3: Agent joins but does not talk
  - H3: Twilio setup checks fail
  - H3: Twilio call starts but never enters the meeting
  - H2: Notes
  - H2: Related

## plugins/install-overrides.md

- Route: /plugins/install-overrides
- Headings:
  - H2: Environment
  - H2: Behavior
  - H2: Package E2E

## plugins/llama-cpp.md

- Route: /plugins/llama-cpp
- Headings:
  - H2: Configuration
  - H2: Native Runtime
  - H2: Troubleshooting

## plugins/logbook.md

- Route: /plugins/logbook
- Headings:
  - H2: Before you begin
  - H2: Quickstart
  - H2: How it works
  - H2: Model and data flow
  - H2: Configuration
  - H3: Vision model selection
  - H2: Dashboard tab
  - H2: Gateway methods
  - H2: Privacy notes
  - H2: Troubleshooting
  - H3: The Logbook tab is missing
  - H3: Capture reports an error
  - H3: Captures succeed but no cards appear
  - H2: Related

## plugins/manage-plugins.md

- Route: /plugins/manage-plugins
- Headings:
  - H2: List plugins
  - H2: Install plugins
  - H2: Update plugins
  - H2: Uninstall plugins
  - H2: Publish plugins
  - H2: Publish plugins
  - H3: Publish to npmjs.com
  - H2: Source choice
  - H2: Related

## plugins/manifest.md

- Route: /plugins/manifest
- Headings:
  - H2: What this file does
  - H2: Minimal example
  - H2: Rich example
  - H2: Top-level field reference
  - H2: Generation provider metadata reference
  - H2: Tool metadata reference
  - H2: providerAuthChoices reference
  - H2: commandAliases reference
  - H2: activation reference
  - H2: qaRunners reference
  - H2: setup reference
  - H3: setup.providers reference
  - H3: setup fields
  - H2: uiHints reference
  - H2: contracts reference
  - H2: mediaUnderstandingProviderMetadata reference
  - H2: channelConfigs reference
  - H3: Replacing another channel plugin
  - H2: modelSupport reference
  - H2: modelCatalog reference
  - H2: modelIdNormalization reference
  - H2: providerEndpoints reference
  - H2: providerRequest reference
  - H2: secretProviderIntegrations reference
  - H2: modelPricing reference
  - H3: RemoteClaw Provider Index
  - H2: Manifest versus package.json
  - H3: package.json fields that affect discovery
  - H2: Discovery precedence (duplicate plugin ids)
  - H2: JSON Schema requirements
  - H2: Validation behavior
  - H2: Notes
  - H2: Related

## plugins/memory-lancedb.md

- Route: /plugins/memory-lancedb
- Headings:
  - H2: Installation
  - H2: Quick start
  - H2: Provider-backed embeddings
  - H2: Ollama embeddings
  - H2: OpenAI-compatible providers
  - H2: Recall and capture limits
  - H2: Commands
  - H2: Storage
  - H2: Runtime dependencies
  - H2: Troubleshooting
  - H3: Input length exceeds the context length
  - H3: Unsupported embedding model
  - H3: Plugin loads but no memories appear
  - H2: Related

## plugins/memory-wiki.md

- Route: /plugins/memory-wiki
- Headings:
  - H2: What it adds
  - H2: How it fits with memory
  - H2: Recommended hybrid pattern
  - H2: Vault modes
  - H3: isolated
  - H3: bridge
  - H3: unsafe-local
  - H2: Vault layout
  - H2: Open Knowledge Format imports
  - H2: Structured claims and evidence
  - H2: Agent-facing entity metadata
  - H2: Compile pipeline
  - H2: Dashboards and health reports
  - H2: Search and retrieval
  - H2: Agent tools
  - H2: Prompt and context behavior
  - H2: Configuration
  - H3: Example: QMD + bridge mode
  - H2: CLI
  - H2: Obsidian support
  - H2: Recommended workflow
  - H2: Related docs

## plugins/oc-path.md

- Route: /plugins/oc-path
- Headings:
  - H2: Why enable it
  - H2: Where it runs
  - H2: Enable
  - H2: Dependencies
  - H2: What it provides
  - H2: Relationship to other plugins
  - H2: Safety
  - H2: Related

## plugins/plugin-inventory.md

- Route: /plugins/plugin-inventory
- Headings:
  - H1: Plugin inventory
  - H2: Definitions
  - H2: Install a plugin
  - H2: Core npm package
  - H2: Official external packages
  - H2: Source checkout only

## plugins/reference.md

- Route: /plugins/reference
- Headings:
  - H1: Plugin reference

## plugins/reference/bluebubbles.md

- Route: /plugins/reference/bluebubbles
- Headings:
  - H1: Bluebubbles plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/clawrouter.md

- Route: /plugins/reference/clawrouter
- Headings:
  - H1: ClawRouter plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/clickclack.md

- Route: /plugins/reference/clickclack
- Headings:
  - H1: Clickclack plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/diagnostics-otel.md

- Route: /plugins/reference/diagnostics-otel
- Headings:
  - H1: Diagnostics OpenTelemetry plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/diagnostics-prometheus.md

- Route: /plugins/reference/diagnostics-prometheus
- Headings:
  - H1: Diagnostics Prometheus plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/discord.md

- Route: /plugins/reference/discord
- Headings:
  - H1: Discord plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/featherless.md

- Route: /plugins/reference/featherless
- Headings:
  - H1: Featherless plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/feishu.md

- Route: /plugins/reference/feishu
- Headings:
  - H1: Feishu plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/googlechat.md

- Route: /plugins/reference/googlechat
- Headings:
  - H1: Google Chat plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/imessage.md

- Route: /plugins/reference/imessage
- Headings:
  - H1: iMessage plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/irc.md

- Route: /plugins/reference/irc
- Headings:
  - H1: IRC plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/line.md

- Route: /plugins/reference/line
- Headings:
  - H1: LINE plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/logbook.md

- Route: /plugins/reference/logbook
- Headings:
  - H1: Logbook plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/longcat.md

- Route: /plugins/reference/longcat
- Headings:
  - H1: LongCat plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/matrix.md

- Route: /plugins/reference/matrix
- Headings:
  - H1: Matrix plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/mattermost.md

- Route: /plugins/reference/mattermost
- Headings:
  - H1: Mattermost plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/meta.md

- Route: /plugins/reference/meta
- Headings:
  - H1: Meta plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/msteams.md

- Route: /plugins/reference/msteams
- Headings:
  - H1: Microsoft Teams plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/nextcloud-talk.md

- Route: /plugins/reference/nextcloud-talk
- Headings:
  - H1: Nextcloud Talk plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/nostr.md

- Route: /plugins/reference/nostr
- Headings:
  - H1: Nostr plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/policy.md

- Route: /plugins/reference/policy
- Headings:
  - H1: Policy plugin
  - H2: Distribution
  - H2: Surface
  - H2: Behavior
  - H2: Related docs

## plugins/reference/signal.md

- Route: /plugins/reference/signal
- Headings:
  - H1: Signal plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/slack.md

- Route: /plugins/reference/slack
- Headings:
  - H1: Slack plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/sms.md

- Route: /plugins/reference/sms
- Headings:
  - H1: Sms plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/synology-chat.md

- Route: /plugins/reference/synology-chat
- Headings:
  - H1: Synology Chat plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/telegram.md

- Route: /plugins/reference/telegram
- Headings:
  - H1: Telegram plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/tlon.md

- Route: /plugins/reference/tlon
- Headings:
  - H1: Tlon plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/twitch.md

- Route: /plugins/reference/twitch
- Headings:
  - H1: Twitch plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/voice-call.md

- Route: /plugins/reference/voice-call
- Headings:
  - H1: Voice Call plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/whatsapp.md

- Route: /plugins/reference/whatsapp
- Headings:
  - H1: WhatsApp plugin
  - H2: Distribution
  - H2: Surface

## plugins/reference/zalo.md

- Route: /plugins/reference/zalo
- Headings:
  - H1: Zalo plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/reference/zalouser.md

- Route: /plugins/reference/zalouser
- Headings:
  - H1: Zalo Personal plugin
  - H2: Distribution
  - H2: Surface
  - H2: Related docs

## plugins/sdk-agent-harness.md

- Route: /plugins/sdk-agent-harness
- Headings:
  - H2: When to use a harness
  - H2: What core still owns
  - H2: Register a harness
  - H2: Selection policy
  - H2: Provider plus harness pairing
  - H3: Tool-result middleware
  - H3: Terminal outcome classification
  - H3: Agent-end side effects
  - H3: User input and tool surfaces
  - H3: Native Codex harness mode
  - H2: Runtime strictness
  - H2: Native sessions and transcript mirror
  - H2: Tool and media results
  - H2: Current limitations
  - H2: Related

## plugins/sdk-channel-message.md

- Route: /plugins/sdk-channel-message
- Headings: none

## plugins/sdk-channel-turn.md

- Route: /plugins/sdk-channel-turn
- Headings: none

## plugins/sdk-migration.md

- Route: /plugins/sdk-migration
- Headings:
  - H2: What changed
  - H3: Why
  - H2: Compatibility policy
  - H2: How to migrate
  - H2: Import path reference
  - H2: Active deprecations
  - H2: Talk and realtime voice migration
  - H2: Removal timeline
  - H2: Suppressing the warnings temporarily
  - H2: Related

## plugins/sdk-subpaths.md

- Route: /plugins/sdk-subpaths
- Headings:
  - H2: Plugin entry
  - H3: Deprecated compatibility and test helpers
  - H3: Reserved bundled plugin helper subpaths
  - H2: Related

## plugins/voice-call.md

- Route: /plugins/voice-call
- Headings:
  - H2: Quick start
  - H2: Configuration
  - H2: Session scope
  - H2: Realtime voice conversations
  - H3: Tool policy
  - H3: Agent voice context
  - H3: Realtime provider examples
  - H2: Streaming transcription
  - H3: Streaming provider examples
  - H2: TTS for calls
  - H3: TTS examples
  - H2: Inbound calls
  - H3: Per-number Routing
  - H3: Spoken output contract
  - H3: Conversation startup behavior
  - H3: Twilio stream disconnect grace
  - H2: Stale call reaper
  - H2: Webhook security
  - H2: CLI
  - H2: Agent tool
  - H2: Gateway RPC
  - H2: Troubleshooting
  - H3: Setup fails webhook exposure
  - H3: Provider credentials fail
  - H3: Calls start but provider webhooks do not arrive
  - H3: Signature verification fails
  - H3: Google Meet Twilio joins fail
  - H3: Realtime call has no speech
  - H2: Related

## plugins/webhooks.md

- Route: /plugins/webhooks
- Headings:
  - H2: Configure routes
  - H2: Security model
  - H2: Request format
  - H2: Supported actions
  - H3: createflow
  - H3: runtask
  - H2: Response shape
  - H2: Related

## plugins/zalouser.md

- Route: /plugins/zalouser
- Headings:
  - H2: Naming
  - H2: Where it runs
  - H2: Install
  - H3: Option A: enable the bundled plugin
  - H3: Option B: install from a local folder (dev)
  - H2: Config
  - H2: CLI
  - H2: Agent tool
  - H2: Related

## prose.md

- Route: /prose
- Headings:
  - H2: Install
  - H2: Slash command
  - H2: What it can do
  - H2: Example: parallel research and synthesis
  - H2: RemoteClaw runtime mapping
  - H2: File locations
  - H2: State backends
  - H2: Security
  - H2: Related

## providers/deepgram.md

- Route: /providers/deepgram
- Headings:
  - H1: Deepgram (Audio Transcription)
  - H2: Quick start
  - H2: Options
  - H2: Notes

## refactor/agentruntime-credential-injection.md

- Route: /refactor/agentruntime-credential-injection
- Headings:
  - H1: AgentRuntime credential injection: gut decorative auth-profile SecretRef typing
  - H2: Problem statement
  - H2: Architectural reality
  - H3: Two parallel auth-profile modules
  - H3: Live AgentRuntime spawn path
  - H3: Producer side: who writes keyRef / tokenRef?
  - H3: Consumer side: who reads keyRef / tokenRef?
  - H3: Plugin SDK and extensions
  - H2: Path comparison
  - H3: Path A: gut the decorative typing
  - H3: Path B: wire spawn-time SecretRef resolution into AgentRuntime
  - H3: Why Path A wins
  - H2: Consequences
  - H3: Code
  - H3: Docs
  - H3: What stays the same
  - H3: What this ADR does NOT do
  - H2: Future considerations
  - H2: References

## refactor/clawnet.md

- Route: /refactor/clawnet
- Headings:
  - H1: Clawnet refactor (protocol + auth unification)
  - H2: Hi
  - H2: Purpose
  - H2: Goals (from discussion)
  - H2: Non‑goals (explicit)
  - H1: Current state (as‑is)
  - H2: Two protocols
  - H3: 1) Gateway WebSocket (control plane)
  - H3: 2) Bridge (node transport)
  - H2: Control plane clients today
  - H2: Nodes today
  - H2: Current approval flow (exec)
  - H2: Presence + identity today
  - H1: Problems / pain points
  - H1: Proposed new state (Clawnet)
  - H2: One protocol, two roles
  - H3: Role behaviors
  - H3: Key rule
  - H1: Unified authentication + pairing
  - H2: Client identity
  - H2: Pairing flow (unified)
  - H2: Device‑bound auth (avoid bearer token replay)
  - H2: Silent approval (SSH heuristic)
  - H1: TLS everywhere (dev + prod)
  - H2: Reuse existing bridge TLS
  - H2: Apply to WS
  - H2: Why
  - H1: Approvals redesign (centralized)
  - H2: Current
  - H2: Proposed
  - H3: New flow
  - H3: Approval semantics (hardening)
  - H2: Benefits
  - H1: Role clarity examples
  - H2: iPhone app
  - H2: macOS app
  - H2: CLI
  - H1: Identity + slugs
  - H2: Stable ID
  - H2: Cute slug
  - H2: UI grouping
  - H1: Migration strategy
  - H2: Phase 0: Document + align
  - H2: Phase 1: Add roles/scopes to WS
  - H2: Phase 2: Bridge compatibility
  - H2: Phase 3: Central approvals
  - H2: Phase 4: TLS unification
  - H2: Phase 5: Deprecate bridge
  - H2: Phase 6: Device‑bound auth
  - H1: Security notes
  - H1: Streaming + large payloads (node media)
  - H1: Capability + command policy
  - H1: Audit + rate limiting
  - H1: Protocol hygiene
  - H1: Open questions
  - H1: Summary (TL;DR)

## refactor/docs-gutted-feature-audit.md

- Route: /refactor/docs-gutted-feature-audit
- Headings:
  - H1: Docs Audit: References to Gutted Features
  - H2: Method
  - H2: Classification taxonomy
  - H2: CLI-surface verification (evidence)
  - H2: Classified inventory
  - H3: STALE — CLI references that no longer exist
  - H3: STALE — ClawHub marketplace references
  - H3: STALE — Threat model for removed marketplace
  - H3: STALE — autoAllowSkills config surface
  - H3: STALE — Dead links to missing docs
  - H3: CROSS-REF — Gutted in context, needs lighter edit
  - H3: HISTORICAL — Preserved as removal contract / landscape
  - H3: ACCURATE — Explicitly verified, not stale
  - H2: Summary
  - H2: Follow-up plan
  - H2: Verification notes (for future maintainers)

## refactor/exec-approval-singular-audit-2606.md

- Route: /refactor/exec-approval-singular-audit-2606
- Headings:
  - H1: Audit: exec.approval. (singular) wire-path is broken (#2606)
  - H2: Summary
  - H2: Acceptance criteria — per-AC evidence
  - H3: AC #1 — Confirm whether exec.approval. (singular) handlers exist anywhere in the codebase
  - H3: AC #2 — Identify the original consumers of the gutted subsystem and confirm they were also removed
  - H4: Live callers of exec.approval.request (would receive unknown method today)
  - H4: Live callers of exec.approval.resolve (would receive unknown method today)
  - H4: Zero callers of exec.approval.waitDecision
  - H4: Broadcast event sourcing — no producer
  - H3: AC #3 — Verify there is no end-to-end request → wait → resolve flow with at least one client implementation
  - H3: AC #4 — Determine whether ExecApprovalRequestParamsSchema / ExecApprovalResolveParamsSchema carry fields used elsewhere as a shared ApprovalCorrelationFields shape
  - H2: Documentation alignment
  - H2: Recommendations (out-of-scope for this PR)
  - H2: Non-goals (re-affirmed)
  - H2: Related

## refactor/exec-host.md

- Route: /refactor/exec-host
- Headings:
  - H1: Exec host refactor plan
  - H2: Goals
  - H2: Non-goals
  - H2: Decisions (locked)
  - H2: Key concepts
  - H3: Host
  - H3: Security mode
  - H3: Ask mode
  - H3: Policy resolution (per exec)
  - H2: Default safety
  - H2: Config surface
  - H3: Tool parameters
  - H3: Config keys (global)
  - H3: Config keys (per agent)
  - H3: Alias
  - H2: Approvals store (JSON)
  - H2: Runner service (headless)
  - H3: Role
  - H3: Service lifecycle
  - H2: UI integration (macOS app)
  - H3: IPC
  - H3: Ask flow (macOS app exec host)
  - H3: Diagram (SCI)
  - H2: Node identity + binding
  - H2: Eventing
  - H3: Who sees events
  - H3: Event text
  - H3: Transport
  - H2: Exec flows
  - H3: Sandbox host
  - H3: Gateway host
  - H3: Node host
  - H2: Output caps
  - H2: Slash commands
  - H2: Cross-platform story
  - H2: Implementation phases
  - H3: Phase 1: config + exec routing
  - H3: Phase 2: approvals store + gateway enforcement
  - H3: Phase 3: node runner enforcement
  - H3: Phase 4: events
  - H3: Phase 5: UI polish
  - H2: Testing plan
  - H2: Open risks
  - H2: Related docs

## refactor/outbound-session-mirroring.md

- Route: /refactor/outbound-session-mirroring
- Headings:
  - H1: Outbound Session Mirroring Refactor (Issue #1520)
  - H2: Status
  - H2: Context
  - H2: Goals
  - H2: Implementation Summary
  - H2: Thread/Topic Handling
  - H2: Extensions Covered
  - H2: Decisions
  - H2: Tests Added/Updated
  - H2: Open Items / Follow-ups
  - H2: Files Touched

## refactor/plugin-sdk.md

- Route: /refactor/plugin-sdk
- Headings:
  - H1: Plugin SDK + Runtime Refactor Plan
  - H2: Why now
  - H2: Target architecture (two layers)
  - H3: 1) Plugin SDK (compile-time, stable, publishable)
  - H3: 2) Plugin Runtime (execution surface, injected)
  - H2: Migration plan (phased, safe)
  - H3: Phase 0: scaffolding
  - H3: Phase 1: bridge cleanup (low risk)
  - H3: Phase 2: light direct-import plugins
  - H3: Phase 3: heavy direct-import plugins
  - H3: Phase 4: iMessage pluginization
  - H3: Phase 5: enforcement
  - H2: Compatibility and versioning
  - H2: Testing strategy
  - H2: Open questions
  - H2: Success criteria

## refactor/strict-config.md

- Route: /refactor/strict-config
- Headings:
  - H1: Strict config validation (doctor-only migrations)
  - H2: Goals
  - H2: Non-goals
  - H2: Strict validation rules
  - H2: Plugin schema enforcement
  - H2: Doctor flow
  - H2: Command gating (when config is invalid)
  - H2: Error UX format
  - H2: Implementation touchpoints
  - H2: Tests

## refactor/sync-cat-b-skipped-2577.md

- Route: /refactor/sync-cat-b-skipped-2577
- Headings:
  - H1: Sync Cat B — Skipped Test Disposition (#2577)
  - H2: Summary
  - H2: Per-test disposition
  - H2: Plugin-SDK subpath gap
  - H2: Recommended follow-up
  - H2: References

## refactor/sync-cat-c-c1-2587.md

- Route: /refactor/sync-cat-c-c1-2587
- Headings:
  - H1: Sync Cat C cluster C1 — docs/ Registry-Sync Disposition (#2587)
  - H2: Summary
  - H2: Per-file disposition
  - H2: The agent-loop.md decision
  - H2: Audit verification
  - H2: Out of scope

## refactor/sync-cat-c-c2-2588.md

- Route: /refactor/sync-cat-c-c2-2588
- Headings:
  - H1: Sync Cat C cluster C2 — src/agents/ Registry-Sync Disposition (#2588)
  - H2: Summary
  - H2: Per-file disposition
  - H2: Disposition class breakdown
  - H2: Why no per-file inspection was needed
  - H2: Audit verification
  - H2: Out of scope

## refactor/sync-cat-c-c3-2589.md

- Route: /refactor/sync-cat-c-c3-2589
- Headings:
  - H1: Sync Cat C cluster C3 — src/browser/ Registry-Sync Disposition (#2589)
  - H2: Summary
  - H2: Per-file disposition
  - H2: Disposition class breakdown
  - H2: The 7 new dispositions — per-file inspection notes
  - H3: errors.ts (82 lines)
  - H3: profile-capabilities.ts (93 lines)
  - H3: pw-session.mock-setup.ts (15 lines)
  - H3: runtime-lifecycle.ts (60 lines)
  - H3: routes/agent.snapshot.plan.ts + routes/agent.snapshot.plan.test.ts
  - H3: server-context.loopback-direct-ws.test.ts (142 lines)
  - H2: Why no KEEP / EXTRACT in this cluster
  - H2: Audit verification
  - H2: Out of scope

## refactor/sync-cat-c-c4-2590.md

- Route: /refactor/sync-cat-c-c4-2590
- Headings:
  - H1: Sync Cat C cluster C4 — extensions/line/src/ Structural-Restructure Disposition (#2590)
  - H2: Summary
  - H2: Per-file disposition
  - H2: Disposition class breakdown
  - H2: Why EXTRACT (and not KEEP / EXCLUDE-GUT)
  - H2: Group-policy centralization (the 1 non-restructure case)
  - H2: Out of scope
  - H2: Audit verification

## refactor/sync-cat-c-c5-2591.md

- Route: /refactor/sync-cat-c-c5-2591
- Headings:
  - H1: Sync Cat C cluster C5 — extensions/{channel}/.test.ts Channel-Test-Additions Disposition (#2591)
  - H2: Summary
  - H2: Per-file disposition
  - H2: Disposition class breakdown
  - H2: The 1 KEEP — extensions/googlechat/src/auth.test.ts
  - H2: Why EXTRACT (and not KEEP / EXCLUDE-GUT) for the 22 new structural-restructure entries
  - H2: Why EXTRACT for the 2 non-structural-restructure entries
  - H2: Out of scope
  - H2: Audit verification

## refactor/sync-cat-c-c6-2592.md

- Route: /refactor/sync-cat-c-c6-2592
- Headings:
  - H1: Sync Cat C cluster C6 — src/plugins/ + src/plugin-sdk/ Mixed Disposition (#2592)
  - H2: Summary
  - H2: Per-file disposition
  - H2: Disposition class breakdown
  - H2: Why EXTRACT (and not KEEP / EXCLUDE-GUT) for the 7 supposed-KEEP entries
  - H2: How to verify
  - H2: Acceptance criteria
  - H2: Test plan
  - H2: Out of scope
  - H2: Audit verification

## refactor/sync-cat-c-c7-2593.md

- Route: /refactor/sync-cat-c-c7-2593
- Headings:
  - H1: Sync Cat C cluster C7 — src/cli/ + src/commands/ + src/auto-reply/ Memory-CLI + Provider-Defaults Disposition (#2593)
  - H2: Summary
  - H2: Per-file disposition
  - H2: The nodes-cli/register.invoke.nodes-run-approval-timeout.test.ts decision
  - H2: The doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts decision
  - H2: Audit verification
  - H2: Out of scope

## refactor/sync-cat-c-c8-2594.md

- Route: /refactor/sync-cat-c-c8-2594
- Headings:
  - H1: Sync Cat C cluster C8 — src/channels/ + src/config/ + test/helpers/ + test/scripts/ Plugin-Contract + Test-Infra Disposition (#2594)
  - H2: Summary
  - H2: Per-file disposition
  - H2: The plugin-contract reclassification
  - H2: The read-only-account-inspect.telegram.runtime.ts reclassification
  - H2: The legacy.migrations.part-2.ts reclassification
  - H2: The test/scripts/test-find-thread-candidates.test.ts explicit override
  - H2: Audit verification
  - H2: Out of scope

## refactor/ui-test-fixture-audit-2528.md

- Route: /refactor/ui-test-fixture-audit-2528
- Headings:
  - H1: UI test-layer fixture audit (#2528)
  - H2: Scope
  - H2: Method
  - H2: Inventory
  - H2: Cross-verification: recent gut sweeps
  - H2: Adjacent non-target references (LEGITIMATE, out of scope)
  - H2: Production-code spot check (#2336 Area 7 follow-through)
  - H2: Acceptance criteria
  - H2: No follow-up issues

## reference/AGENTS.default.md

- Route: /reference/AGENTS.default
- Headings:
  - H2: First run (recommended)
  - H2: Safety defaults
  - H2: Existing solutions preflight
  - H2: Session start (required)
  - H2: Soul (required)
  - H2: Shared spaces (recommended)
  - H2: Memory system (recommended)
  - H2: Tools and skills
  - H2: Backup tip (recommended)
  - H2: What OpenClaw does
  - H2: Core skills (enable in Settings → Skills)
  - H2: Usage notes
  - H2: Related

## reference/RELEASING.md

- Route: /reference/RELEASING
- Headings:
  - H2: Version naming
  - H2: Release cadence
  - H2: Monthly npm-only extended-stable publication
  - H2: Regular release operator checklist
  - H2: Stable main closeout
  - H2: Release preflight
  - H2: Release test boxes
  - H3: Vitest
  - H3: Docker
  - H3: QA Lab
  - H3: Package
  - H2: Regular release publish automation
  - H2: NPM workflow inputs
  - H2: Regular beta/latest stable release sequence
  - H2: Public references
  - H2: Related

## reference/api-usage-costs.md

- Route: /reference/api-usage-costs
- Headings:
  - H2: Where costs show up
  - H2: How keys are discovered
  - H2: Features that can spend keys
  - H3: Core model responses (chat + tools)
  - H3: Media understanding (audio/image/video)
  - H3: Image and video generation
  - H3: Memory embeddings and semantic search
  - H3: Web search tool
  - H3: Web fetch tool (Firecrawl)
  - H3: Provider usage snapshots (status/health)
  - H3: Compaction safeguard summarization
  - H3: Model scan / probe
  - H3: Talk (speech)
  - H3: Skills (third-party APIs)
  - H2: Related

## reference/application-modernization-plan.md

- Route: /reference/application-modernization-plan
- Headings:
  - H2: Goal
  - H2: Principles
  - H2: Phase 1: Baseline audit
  - H2: Phase 2: Product and UX cleanup
  - H2: Phase 3: Frontend architecture tightening
  - H2: Phase 4: Performance and reliability
  - H2: Phase 5: Type, contract, and test hardening
  - H2: Phase 6: Documentation and release readiness
  - H2: Recommended first slice
  - H2: Frontend skill update

## reference/code-mode.md

- Route: /reference/code-mode
- Headings:
  - H2: What it does
  - H2: Why use it
  - H2: Enable it
  - H2: Technical tour
  - H2: Runtime status
  - H2: Scope
  - H2: Terms
  - H2: Configuration
  - H2: Activation
  - H2: Model-visible tools
  - H2: exec
  - H2: wait
  - H2: Guest runtime API
  - H2: Internal namespaces
  - H3: Registry lifecycle
  - H3: Registration shape
  - H3: Ownership and visibility
  - H3: Scope serialization rules
  - H3: Prompts
  - H3: Cleanup
  - H3: Test checklist
  - H2: Output API
  - H2: Tool catalog
  - H2: Tool Search interaction
  - H2: Tool names and collisions
  - H2: Nested tool execution
  - H2: Run and snapshot lifecycle
  - H2: QuickJS-WASI runtime
  - H2: TypeScript
  - H2: Security boundary
  - H2: Error codes
  - H2: Telemetry
  - H2: Debugging
  - H2: Implementation layout
  - H2: Validation checklist
  - H2: E2E test plan
  - H2: Related

## reference/credits.md

- Route: /reference/credits
- Headings:
  - H2: Credits
  - H2: Core contributors
  - H2: License
  - H2: Related

## reference/device-models.md

- Route: /reference/device-models
- Headings:
  - H2: Data source
  - H2: Updating the database
  - H2: Related

## reference/full-release-validation.md

- Route: /reference/full-release-validation
- Headings:
  - H2: Top-level stages
  - H2: Release checks stages
  - H2: Docker release-path chunks
  - H2: Release profiles
  - H2: Full-only additions
  - H2: Focused reruns
  - H2: Evidence to keep
  - H2: Workflow files

## reference/openclaw-ai.md

- Route: /reference/openclaw-ai
- Headings:
  - H2: Quick start
  - H2: Design contract
  - H2: Subpath exports

## reference/prompt-caching.md

- Route: /reference/prompt-caching
- Headings:
  - H2: Primary knobs
  - H3: cacheRetention
  - H3: contextPruning.mode: "cache-ttl"
  - H3: Heartbeat keep-warm
  - H2: Provider behavior
  - H3: Anthropic (direct API and Vertex AI)
  - H3: OpenAI (direct API)
  - H3: Amazon Bedrock
  - H3: OpenRouter
  - H3: Google Gemini (direct API)
  - H3: CLI-harness providers (Claude Code, Gemini CLI)
  - H3: Other providers
  - H2: System-prompt cache boundary
  - H2: RemoteClaw cache-stability guards
  - H2: Tuning patterns
  - H3: Mixed traffic (recommended default)
  - H3: Cost-first baseline
  - H2: Live regression tests
  - H3: Anthropic live expectations
  - H3: OpenAI live expectations
  - H2: diagnostics.cacheTrace config
  - H3: Env toggles (one-off debugging)
  - H3: What to inspect
  - H2: Quick troubleshooting
  - H2: Related

## reference/rich-output-protocol.md

- Route: /reference/rich-output-protocol
- Headings:
  - H2: Media attachments
  - H2: [embed ...]
  - H2: Stored rendering shape
  - H2: Related

## reference/rpc.md

- Route: /reference/rpc
- Headings:
  - H2: Pattern A: HTTP daemon (signal-cli)
  - H2: Pattern B: stdio child process (imsg)
  - H2: Adapter guidelines
  - H2: Related

## reference/secret-placeholder-conventions.md

- Route: /reference/secret-placeholder-conventions
- Headings:
  - H1: Secret placeholder conventions
  - H2: Recommended style
  - H2: Avoid these patterns in docs
  - H2: Example

## reference/secretref-credential-surface.md

- Route: /reference/secretref-credential-surface
- Headings:
  - H2: Supported credentials
  - H3: remoteclaw.json targets (secrets configure + secrets apply + secrets audit)
  - H3: auth-profiles.json targets (secrets configure + secrets apply + secrets audit)
  - H2: Unsupported credentials
  - H2: Related

## reference/session-management-compaction.md

- Route: /reference/session-management-compaction
- Headings:
  - H2: Two persistence layers
  - H2: On-disk locations
  - H2: Store maintenance and disk controls
  - H2: Cron sessions and run logs
  - H2: Session keys (sessionKey)
  - H2: Session ids (sessionId)
  - H2: Session store schema (sessions.json)
  - H2: Transcript structure (.jsonl)
  - H2: Context windows vs tracked tokens
  - H2: Compaction: what it is
  - H3: Chunk boundaries and tool pairing
  - H2: When auto-compaction happens
  - H2: Compaction settings
  - H2: Pluggable compaction providers
  - H2: User-visible surfaces
  - H2: Silent housekeeping (NOREPLY)
  - H2: Pre-compaction memory flush
  - H2: Troubleshooting checklist
  - H2: Related

## reference/test.md

- Route: /reference/test
- Headings:
  - H2: Local PR gate
  - H2: Model latency bench (local keys)
  - H2: CLI startup bench
  - H2: Gateway startup bench
  - H2: Gateway restart bench
  - H2: Onboarding E2E (Docker)
  - H2: QR import smoke (Docker)
  - H2: Related

## reference/token-use.md

- Route: /reference/token-use
- Headings:
  - H2: How the system prompt is built
  - H2: What counts in the context window
  - H2: How to see current token usage
  - H2: Cost estimation (when shown)
  - H2: Cache TTL and pruning impact
  - H3: Example: keep 1h cache warm with heartbeat
  - H3: Example: mixed traffic with per-agent cache strategy
  - H3: Anthropic 1M context
  - H2: Tips for reducing token pressure
  - H2: Related

## reference/transcript-hygiene.md

- Route: /reference/transcript-hygiene
- Headings:
  - H2: Global rule: runtime context is not user transcript
  - H2: Where this runs
  - H2: Global rule: image sanitization
  - H2: Global rule: malformed tool calls
  - H2: Global rule: incomplete reasoning-only turns
  - H2: Global rule: inter-session input provenance
  - H2: Provider matrix (current behavior)
  - H2: Historical behavior (pre-2026.1.22)
  - H2: Related

## reference/wizard.md

- Route: /reference/wizard
- Headings:
  - H2: Flow details (local mode)
  - H2: Non-interactive mode
  - H3: Add agent (non-interactive)
  - H2: Gateway wizard RPC
  - H2: Signal setup (signal-cli)
  - H2: What the wizard writes
  - H2: Related docs

## security/CONTRIBUTING-THREAT-MODEL.md

- Route: /security/CONTRIBUTING-THREAT-MODEL
- Headings:
  - H2: Ways to contribute
  - H3: Add a threat
  - H3: Suggest a mitigation
  - H3: Propose an attack chain
  - H3: Fix or improve existing content
  - H2: What we use
  - H3: MITRE ATLAS framework
  - H3: Threat ids
  - H3: Risk levels
  - H2: Review process
  - H2: Resources
  - H2: Contact
  - H2: Recognition
  - H2: Related

## security/THREAT-MODEL-ATLAS.md

- Route: /security/THREAT-MODEL-ATLAS
- Headings:
  - H2: MITRE ATLAS framework
  - H3: Framework attribution
  - H3: Contributing to This Threat Model
  - H2: 1. Introduction
  - H3: 1.1 Purpose
  - H3: 1.2 Scope
  - H3: 1.3 Out of Scope
  - H2: 2. System Architecture
  - H3: 2.1 Trust Boundaries
  - H3: 2.2 Data Flows
  - H2: 3. Threat Analysis by ATLAS Tactic
  - H3: 3.1 Reconnaissance (AML.TA0002)
  - H4: T-RECON-001: Agent Endpoint Discovery
  - H4: T-RECON-002: Channel Integration Probing
  - H3: 3.2 Initial Access (AML.TA0004)
  - H4: T-ACCESS-001: Pairing Code Interception
  - H4: T-ACCESS-002: AllowFrom Spoofing
  - H4: T-ACCESS-003: Token Theft
  - H3: 3.3 Execution (AML.TA0005)
  - H4: T-EXEC-001: Direct Prompt Injection
  - H4: T-EXEC-002: Indirect Prompt Injection
  - H4: T-EXEC-003: Tool Argument Injection
  - H4: T-EXEC-004: Exec Approval Bypass
  - H3: 3.4 Persistence (AML.TA0006)
  - H4: T-PERSIST-001: Malicious Skill Installation
  - H4: T-PERSIST-002: Skill Update Poisoning
  - H4: T-PERSIST-003: Agent Configuration Tampering
  - H3: 3.5 Defense Evasion (AML.TA0007)
  - H4: T-EVADE-001: Moderation Pattern Bypass
  - H4: T-EVADE-002: Content Wrapper Escape
  - H3: 3.6 Discovery (AML.TA0008)
  - H4: T-DISC-001: Tool Enumeration
  - H4: T-DISC-002: Session Data Extraction
  - H3: 3.7 Collection &amp; Exfiltration (AML.TA0009, AML.TA0010)
  - H4: T-EXFIL-001: Data Theft via webfetch
  - H4: T-EXFIL-002: Unauthorized Message Sending
  - H4: T-EXFIL-003: Credential Harvesting
  - H3: 3.8 Impact (AML.TA0011)
  - H4: T-IMPACT-001: Unauthorized Command Execution
  - H4: T-IMPACT-002: Resource Exhaustion (DoS)
  - H4: T-IMPACT-003: Reputation Damage
  - H2: 4. ClawHub Supply Chain Analysis
  - H3: 4.1 Current Security Controls
  - H3: 4.2 Moderation Flag Patterns
  - H3: 4.3 Planned Improvements
  - H2: 5. Risk Matrix
  - H3: 5.1 Likelihood vs Impact
  - H3: 5.2 Critical Path Attack Chains
  - H2: 6. Recommendations Summary
  - H3: 6.1 Immediate (P0)
  - H3: 6.2 Short-term (P1)
  - H3: 6.3 Medium-term (P2)
  - H2: 7. Appendices
  - H3: 7.1 ATLAS Technique Mapping
  - H3: 7.2 Key Security Files
  - H3: 7.3 Glossary
  - H2: Related

## security/formal-verification.md

- Route: /security/formal-verification
- Headings:
  - H2: What this is
  - H2: Where the models live
  - H2: Caveats
  - H2: Reproducing results
  - H2: Claims and targets
  - H3: Gateway exposure and open gateway misconfiguration
  - H3: Node exec pipeline (highest-risk capability)
  - H3: Pairing store (DM gating)
  - H3: Ingress gating (mentions and control-command bypass)
  - H3: Routing and session-key isolation
  - H2: v1++ models: concurrency, retries, trace correctness
  - H3: Pairing store concurrency and idempotency
  - H3: Ingress trace correlation and idempotency
  - H3: Routing dmScope precedence and identityLinks
  - H2: Related

## security/incident-response.md

- Route: /security/incident-response
- Headings:
  - H2: 1. Detection and triage
  - H2: 2. Severity
  - H2: 3. Response
  - H2: 4. Communication and disclosure
  - H2: 5. Recovery and follow-up
  - H2: Related

## security/network-proxy.md

- Route: /security/network-proxy
- Headings:
  - H2: Configuration
  - H3: HTTPS proxy endpoint with a private CA
  - H2: How routing works
  - H3: Gateway loopback mode
  - H3: Containers
  - H2: Related proxy terms
  - H2: Validating the proxy
  - H2: Recommended blocked destinations
  - H2: Limits

## start/docs-directory.md

- Route: /start/docs-directory
- Headings:
  - H2: Start here
  - H2: Channels and UX
  - H2: Companion apps
  - H2: Operations and safety
  - H2: Related

## start/getting-started.mdx

- Route: /start/getting-started
- Headings:
  - H1: Getting Started
  - H2: Prereqs
  - H2: Quick setup (CLI)
  - H2: Optional checks and extras
  - H2: Useful environment variables
  - H2: Go deeper
  - H2: What you will have
  - H2: Next steps

## start/hubs.md

- Route: /start/hubs
- Headings:
  - H2: Start here
  - H2: Installation + updates
  - H2: Core concepts
  - H2: Providers + ingress
  - H2: Gateway + operations
  - H2: Tools + automation
  - H2: Nodes, media, voice
  - H2: Platforms
  - H2: macOS companion app (advanced)
  - H2: Plugins
  - H2: Workspace + templates
  - H2: Project
  - H2: Testing + release
  - H2: Related

## start/nanoclaw-or-remoteclaw.mdx

- Route: /start/nanoclaw-or-remoteclaw
- Headings:
  - H1: Coming from NanoClaw
  - H2: The key difference
  - H2: What you gain
  - H2: What you trade off
  - H2: Architecture side by side
  - H2: Key differences at a glance
  - H2: Next steps

## start/openclaw-or-remoteclaw.mdx

- Route: /start/openclaw-or-remoteclaw
- Headings:
  - H1: Coming from OpenClaw
  - H2: What stays
  - H2: What changes
  - H2: Architecture side by side
  - H2: Ready to switch?

## start/quickstart.mdx

- Route: /start/quickstart
- Headings:
  - H1: Quick start

## start/remoteclaw.md

- Route: /start/remoteclaw
- Headings:
  - H1: Building a personal assistant with RemoteClaw
  - H2: ⚠️ Safety first
  - H2: Prerequisites
  - H2: The two-phone setup (recommended)
  - H2: 5-minute quick start
  - H2: Give the agent a workspace
  - H2: The config that turns it into “an assistant”
  - H2: Sessions and memory
  - H2: Heartbeats (proactive mode)
  - H2: Media in and out
  - H2: Operations checklist
  - H2: Next steps

## start/setup.md

- Route: /start/setup
- Headings:
  - H2: TL;DR
  - H2: Prereqs (from source)
  - H2: Tailoring strategy (so updates do not hurt)
  - H2: Run the Gateway from this repo
  - H2: Stable workflow (macOS app first)
  - H2: Bleeding edge workflow (Gateway in a terminal)
  - H3: 0) (Optional) Run the macOS app from source too
  - H3: 1) Start the dev Gateway
  - H3: 2) Point the macOS app at your running Gateway
  - H3: 3) Verify
  - H3: Common footguns
  - H2: Credential storage map
  - H2: Updating (without wrecking your setup)
  - H2: Linux (systemd user service)
  - H2: Related docs

## start/wizard-cli-automation.md

- Route: /start/wizard-cli-automation
- Headings:
  - H2: Baseline non-interactive example
  - H2: Provider-specific examples
  - H2: Add another agent
  - H2: Related docs

## start/wizard-cli-reference.md

- Route: /start/wizard-cli-reference
- Headings:
  - H2: What the wizard does
  - H2: Local flow details
  - H2: Remote mode details
  - H2: Auth and model options
  - H2: Outputs and internals
  - H2: Related docs

## tools/acp-agents.md

- Route: /tools/acp-agents
- Headings:
  - H2: Which page do I want?
  - H2: Does this work out of the box?
  - H2: Supported harness targets
  - H2: Operator runbook
  - H2: ACP versus sub-agents
  - H2: How ACP runs Claude Code
  - H2: Bound sessions
  - H3: Mental model
  - H3: Current-conversation binds
  - H2: Persistent channel bindings
  - H3: Binding model
  - H3: Runtime defaults per agent
  - H3: Example
  - H3: Behavior
  - H2: Start ACP sessions
  - H3: sessionsspawn parameters
  - H2: Spawn bind and thread modes
  - H2: Delivery model
  - H2: Sandbox compatibility
  - H2: Session target resolution
  - H2: ACP controls
  - H3: Runtime options mapping
  - H2: acpx harness, plugin setup, and permissions
  - H2: Troubleshooting
  - H2: Related

## tools/agent-send.md

- Route: /tools/agent-send
- Headings:
  - H1: Agent Send
  - H2: Quick start
  - H2: Flags
  - H2: Behavior
  - H2: Examples
  - H2: Related

## tools/browser-linux-troubleshooting.md

- Route: /tools/browser-linux-troubleshooting
- Headings:
  - H1: Browser Troubleshooting (Linux)
  - H2: Problem: "Failed to start Chrome CDP on port 18800"
  - H3: Root Cause
  - H3: Solution 1: Install Google Chrome (Recommended)
  - H3: Solution 2: Use Snap Chromium with Attach-Only Mode
  - H3: Verifying the Browser Works
  - H3: Config Reference
  - H3: Problem: "No Chrome tabs found for profile=\"user\""

## tools/browser-login.md

- Route: /tools/browser-login
- Headings:
  - H1: Browser login + X/Twitter posting
  - H2: Manual login (recommended)
  - H2: Which Chrome profile is used?
  - H2: X/Twitter: recommended flow
  - H2: Sandboxing + host browser access

## tools/browser-wsl2-windows-remote-cdp-troubleshooting.md

- Route: /tools/browser-wsl2-windows-remote-cdp-troubleshooting
- Headings:
  - H1: WSL2 + Windows + remote Chrome CDP troubleshooting
  - H2: Choose the right browser mode first
  - H3: Option 1: Raw remote CDP from WSL2 to Windows
  - H3: Option 2: Host-local Chrome MCP
  - H2: Working architecture
  - H2: Why this setup is confusing
  - H2: Critical rule for the Control UI
  - H2: Validate in layers
  - H3: Layer 1: Verify Chrome is serving CDP on Windows
  - H3: Layer 2: Verify WSL2 can reach that Windows endpoint
  - H3: Layer 3: Configure the correct browser profile
  - H3: Layer 4: Verify the Control UI layer separately
  - H3: Layer 5: Verify end-to-end browser control
  - H2: Common misleading errors
  - H2: Fast triage checklist
  - H2: Practical takeaway

## tools/browser.md

- Route: /tools/browser
- Headings:
  - H1: Browser (remoteclaw-managed)
  - H2: What you get
  - H2: Quick start
  - H2: Plugin control
  - H2: Profiles: remoteclaw vs user
  - H2: Configuration
  - H2: Use Brave (or another Chromium-based browser)
  - H2: Local vs remote control
  - H2: Node browser proxy (zero-config default)
  - H2: Browserless (hosted remote CDP)
  - H2: Direct WebSocket CDP providers
  - H3: Browserbase
  - H2: Security
  - H2: Profiles (multi-browser)
  - H2: Existing-session via Chrome DevTools MCP
  - H2: Isolation guarantees
  - H2: Browser selection
  - H2: Control API (optional)
  - H3: Playwright requirement
  - H4: Docker Playwright install
  - H2: How it works (internal)
  - H2: CLI quick reference
  - H2: Snapshots and refs
  - H2: Wait power-ups
  - H2: Debug workflows
  - H2: JSON output
  - H2: State and environment knobs
  - H2: Security &amp; privacy
  - H2: Troubleshooting
  - H2: Agent tools + how control works

## tools/chrome-extension.md

- Route: /tools/chrome-extension
- Headings:
  - H1: Chrome extension (browser relay)
  - H2: What it is (concept)
  - H2: Install / load (unpacked)
  - H2: Updates (no build step)
  - H2: Use it (set gateway token once)
  - H3: Custom Gateway ports
  - H2: Attach / detach (toolbar button)
  - H2: Which tab does it control?
  - H2: Badge + common errors
  - H2: Remote Gateway (use a node host)
  - H3: Local Gateway (same machine as Chrome) — usually no extra steps
  - H3: Remote Gateway (Gateway runs elsewhere) — run a node host
  - H2: Sandboxing (tool containers)
  - H2: Remote access tips
  - H2: How “extension path” works
  - H2: Security implications (read this)

## tools/exec-approvals.md

- Route: /tools/exec-approvals
- Headings:
  - H2: Inspecting the effective policy
  - H2: Where it applies
  - H3: Trust model
  - H3: macOS split
  - H2: Settings and storage
  - H2: Policy knobs
  - H3: tools.exec.mode
  - H3: exec.security
  - H3: exec.ask
  - H3: askFallback
  - H3: tools.exec.strictInlineEval
  - H3: tools.exec.commandHighlighting
  - H2: YOLO mode (no-approval)
  - H3: Persistent gateway-host "never prompt" setup
  - H3: Local shortcut
  - H3: Node host
  - H3: Session-only shortcut
  - H2: Allowlist (per agent)
  - H3: Restricting arguments with argPattern
  - H2: Auto-allow skill CLIs
  - H2: Safe bins and approval forwarding
  - H2: Control UI editing
  - H2: Approval flow
  - H2: System events
  - H2: Denied approval behavior
  - H2: Implications
  - H2: Related

## tools/exec.md

- Route: /tools/exec
- Headings:
  - H1: Exec tool
  - H2: Parameters
  - H2: Config
  - H3: PATH handling
  - H2: Session overrides (/exec)
  - H2: Authorization model
  - H2: Exec approvals (companion app / node host)
  - H2: Allowlist + safe bins
  - H2: Examples
  - H2: applypatch
  - H2: Related

## tools/firecrawl.md

- Route: /tools/firecrawl
- Headings:
  - H1: Firecrawl
  - H2: Get an API key
  - H2: Configure Firecrawl search
  - H2: Configure Firecrawl scrape + webfetch fallback
  - H2: Firecrawl plugin tools
  - H3: firecrawlsearch
  - H3: firecrawlscrape
  - H2: Stealth / bot circumvention
  - H2: How webfetch uses Firecrawl
  - H2: Related

## tools/index.md

- Route: /tools
- Headings:
  - H1: Tools and Plugins
  - H2: Tools, skills, and plugins
  - H2: Built-in tools
  - H3: Plugin-provided tools
  - H2: Tool configuration
  - H3: Allow and deny lists
  - H3: Tool profiles
  - H3: Tool groups
  - H3: Provider-specific restrictions

## tools/llm-task.md

- Route: /tools/llm-task
- Headings:
  - H1: LLM Task
  - H2: Enable the plugin
  - H2: Config (optional)
  - H2: Tool parameters
  - H2: Output
  - H2: Example: Lobster workflow step
  - H2: Safety notes

## tools/loop-detection.md

- Route: /tools/loop-detection
- Headings:
  - H1: Tool-loop detection
  - H2: Why this exists
  - H2: Configuration block
  - H3: Field behavior
  - H2: Recommended setup
  - H2: Logs and expected behavior
  - H2: Notes

## tools/mcp-reference.md

- Route: /tools/mcp-reference
- Headings:
  - H1: MCP Tool Reference
  - H2: Permission Model
  - H2: Lifecycle
  - H2: Context
  - H2: Session Tools (7 tools)
  - H3: sessionslist
  - H3: sessionshistory
  - H3: sessionssend
  - H3: sessionsspawn
  - H3: sessionstatus
  - H3: agentslist
  - H3: subagents
  - H2: Message Tools (10 tools)
  - H3: messagesend
  - H3: messagereply
  - H3: messagethreadreply
  - H3: messagebroadcast
  - H3: messagereact
  - H3: messagedelete
  - H3: messagesendattachment
  - H3: messagesendwitheffect
  - H3: messagepin
  - H3: messageread
  - H2: Heartbeat Tools (1 tool)
  - H3: heartbeatreport
  - H2: Cron Tools (7 tools)
  - H3: cronstatus
  - H3: cronlist
  - H3: cronadd
  - H3: cronupdate
  - H3: cronremove
  - H3: cronrun
  - H3: cronruns
  - H2: Gateway Tools (5 tools)
  - H3: gatewayrestart
  - H3: gatewayconfigget
  - H3: gatewayconfigapply
  - H3: gatewayconfigpatch
  - H3: gatewayconfigschema
  - H2: Node Tools (7 tools)
  - H3: nodelist
  - H3: nodedescribe
  - H3: nodeinvoke
  - H3: noderename
  - H3: nodepairlist
  - H3: nodepairapprove
  - H3: nodepairreject
  - H2: Canvas Tools (7 tools)
  - H3: canvaspresent
  - H3: canvashide
  - H3: canvasnavigate
  - H3: canvaseval
  - H3: canvassnapshot
  - H3: canvasa2uipush
  - H3: canvasa2uireset
  - H2: Browser Tools (1 tool)
  - H3: browserrequest
  - H2: TTS Tools (6 tools)
  - H3: ttsstatus
  - H3: ttsconvert
  - H3: ttsproviders
  - H3: ttssetprovider
  - H3: ttsenable
  - H3: ttsdisable
  - H2: Plugin Tools (dynamic)
  - H2: Tool Summary

## tools/pdf.md

- Route: /tools/pdf
- Headings:
  - H1: PDF tool
  - H2: Availability
  - H2: Input reference
  - H2: Supported PDF references
  - H2: Execution modes
  - H3: Native provider mode
  - H3: Extraction fallback mode
  - H2: Config
  - H2: Output details
  - H2: Error behavior
  - H2: Examples
  - H2: Related

## tools/plugin.md

- Route: /tools/plugin
- Headings:
  - H1: Plugins
  - H2: Quick start
  - H2: Plugin types
  - H2: Official plugins
  - H3: Installable (npm)
  - H3: Core (shipped with RemoteClaw)
  - H2: Configuration
  - H2: Discovery and precedence
  - H3: Enablement rules
  - H2: Plugin slots (exclusive categories)
  - H2: CLI reference
  - H2: Plugin API overview
  - H2: Related

## tools/reactions.md

- Route: /tools/reactions
- Headings:
  - H1: Reactions
  - H2: How it works
  - H2: Channel behavior
  - H2: Reaction level
  - H2: Related

## tools/searxng-search.md

- Route: /tools/searxng-search
- Headings:
  - H1: SearXNG Search
  - H2: Setup
  - H2: Config
  - H2: Environment variable
  - H2: Plugin config reference
  - H2: Notes
  - H2: Related

## tools/slash-commands.md

- Route: /tools/slash-commands
- Headings:
  - H1: Slash commands
  - H2: Config
  - H2: Command list
  - H2: /tools
  - H2: Usage surfaces (what shows where)
  - H2: Model selection (/model)
  - H2: Debug overrides
  - H2: Config updates
  - H2: MCP updates
  - H2: Plugin updates
  - H2: Surface notes
  - H2: BTW side questions

## tools/subagents.md

- Route: /tools/subagents
- Headings:
  - H1: Sub-agents
  - H2: Slash command
  - H3: Spawn behavior
  - H2: Tool
  - H2: Thread-bound sessions
  - H3: Thread supporting channels
  - H2: Nested Sub-Agents
  - H3: How to enable
  - H3: Depth levels
  - H3: Announce chain
  - H3: Tool policy by depth
  - H3: Per-agent spawn limit
  - H3: Cascade stop
  - H2: Authentication
  - H2: Announce
  - H2: Tool Policy (sub-agent tools)
  - H2: Concurrency
  - H2: Stopping
  - H2: Limitations

## tools/web-fetch.md

- Route: /tools/web-fetch
- Headings:
  - H1: Web Fetch
  - H2: Quick start
  - H2: Tool parameters
  - H2: How it works
  - H2: Config
  - H2: Firecrawl fallback
  - H2: Limits and safety
  - H2: Tool profiles
  - H2: Related

## tools/web.md

- Route: /tools/web
- Headings:
  - H1: Web Search
  - H2: Quick start
  - H2: Choosing a provider
  - H3: Provider comparison
  - H2: Auto-detection
  - H2: Native Codex web search
  - H2: Setting up web search
  - H2: Config
  - H3: Storing API keys
  - H2: Tool parameters
  - H2: xsearch
  - H3: xsearch config
  - H3: xsearch parameters
  - H3: xsearch example
  - H2: Examples
  - H2: Tool profiles
  - H2: Related

## tts.md

- Route: /tts
- Headings:
  - H1: Text-to-speech (TTS)
  - H2: Supported services
  - H3: Microsoft speech notes
  - H2: Optional keys
  - H2: Service links
  - H2: Is it enabled by default?
  - H2: Config
  - H3: Minimal config (enable + provider)
  - H3: OpenAI primary with ElevenLabs fallback
  - H3: Microsoft primary (no API key)
  - H3: MiniMax primary
  - H3: Disable Microsoft speech
  - H3: Custom limits + prefs path
  - H3: Only reply with audio after an inbound voice message
  - H3: Disable auto-summary for long replies
  - H3: Notes on fields
  - H2: Model-driven overrides (default on)
  - H2: Per-user preferences
  - H2: Output formats (fixed)
  - H2: Auto-TTS behavior
  - H2: Flow diagram
  - H2: Slash command usage
  - H2: Agent tool
  - H2: Gateway RPC

## vps.md

- Route: /vps
- Headings:
  - H2: Pick a provider
  - H2: How cloud setups work
  - H2: Harden admin access first
  - H2: Shared company agent on a VPS
  - H2: Using nodes with a VPS
  - H2: Startup tuning for small VMs and ARM hosts
  - H3: systemd tuning checklist (optional)
  - H2: Related

## web/control-ui.md

- Route: /web/control-ui
- Headings:
  - H2: Quick open (local)
  - H2: Device pairing (first connection)
  - H2: Personal identity (browser-local)
  - H2: Runtime config endpoint
  - H2: Language support
  - H2: Appearance themes
  - H2: What it can do (today)
  - H2: MCP page
  - H2: Activity tab
  - H2: Chat behavior
  - H2: PWA install and web push
  - H2: Hosted embeds
  - H2: Chat message width
  - H2: Tailnet access (recommended)
  - H2: Insecure HTTP
  - H2: Content security policy
  - H2: Avatar route auth
  - H2: Assistant media route auth
  - H2: Building the UI
  - H2: Blank Control UI page
  - H2: Debugging/testing: dev server + remote Gateway
  - H2: Related

## web/dashboard.md

- Route: /web/dashboard
- Headings:
  - H2: Fast path (recommended)
  - H2: Auth basics (local vs remote)
  - H2: If you see "unauthorized" / 1008
  - H2: Related

## web/index.md

- Route: /web
- Headings:
  - H2: Webhooks
  - H2: Config (default-on)
  - H2: Tailscale access
  - H3: Integrated Serve (recommended)
  - H3: Tailnet bind + token
  - H3: Public internet (Funnel)
  - H2: Security notes
  - H2: Building the UI

## web/tui.md

- Route: /web/tui
- Headings:
  - H2: Quick start
  - H3: Gateway mode
  - H3: Local mode
  - H2: What you see
  - H2: Mental model: agents + sessions
  - H2: Sending + delivery
  - H2: Pickers + overlays
  - H2: Keyboard shortcuts
  - H2: Slash commands
  - H2: Local shell commands
  - H2: Repair configs from the local TUI
  - H2: Tool output
  - H2: Terminal colors
  - H2: History + streaming
  - H2: Connection details
  - H2: Options
  - H2: Troubleshooting
  - H2: Connection troubleshooting
  - H2: Related

## web/webchat.md

- Route: /web/webchat
- Headings:
  - H2: What it is
  - H2: Quick start
  - H2: How it works
  - H3: Transcript and delivery model
  - H2: Control UI agents tools panel
  - H2: Remote use
  - H2: Configuration reference (WebChat)
  - H2: Related
