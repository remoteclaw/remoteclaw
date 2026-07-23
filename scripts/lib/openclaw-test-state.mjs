#!/usr/bin/env node
// Creates isolated RemoteClaw test HOME/state directories and shell snippets.
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_LABEL = "state";
const DEFAULT_SCENARIO = "empty";
const SCENARIOS = new Set([
  "empty",
  "minimal",
  "update-stable",
  "upgrade-survivor",
  "gateway-loopback",
  "external-service",
]);

function usage() {
  return `Usage:
  node scripts/lib/remoteclaw-test-state.mjs -- create [--label <name>] [--scenario <name>] [--env-file <path>] [--json]
  node scripts/lib/remoteclaw-test-state.mjs shell [--label <name>] [--scenario <name>]
  node scripts/lib/remoteclaw-test-state.mjs shell-function

Scenarios: ${[...SCENARIOS].join(", ")}
`;
}

function parseArgs(argv) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...rest] = args;
  if (!command || command === "--help" || command === "-h") {
    return { command: "help", options: {} };
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (
      arg === "--label" ||
      arg === "--scenario" ||
      arg === "--env-file" ||
      arg === "--port" ||
      arg === "--token"
    ) {
      const value = rest[index + 1];
      if (!value) {
        throw new Error(`missing value for ${arg}`);
      }
      index += 1;
      options[arg.slice(2)] = value;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return { command, options };
}

function normalizeLabel(value) {
  return (
    String(value || DEFAULT_LABEL)
      .replace(/[^A-Za-z0-9_.-]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || DEFAULT_LABEL
  );
}

function requireScenario(value) {
  const scenario = value || DEFAULT_SCENARIO;
  if (!SCENARIOS.has(scenario)) {
    throw new Error(`unknown scenario: ${scenario}`);
  }
  return scenario;
}

function scenarioConfig(scenario, options = {}) {
  if (scenario === "minimal" || scenario === "external-service") {
    return {};
  }
  if (scenario === "update-stable") {
    return {
      update: {
        channel: "stable",
      },
      plugins: {},
    };
  }
  if (scenario === "upgrade-survivor") {
    return {
      update: {
        channel: "stable",
      },
      gateway: {
        mode: "local",
        port: Number(options.port || 18789),
        bind: "loopback",
        auth: {
          mode: "token",
          token: { source: "env", provider: "default", id: "GATEWAY_AUTH_TOKEN_REF" },
        },
        controlUi: {
          enabled: false,
        },
      },
      models: {
        providers: {
          openai: {
            api: "openai-responses",
            apiKey: { source: "env", provider: "default", id: "OPENAI_API_KEY" },
            baseUrl: "https://api.openai.com/v1",
            models: [],
          },
        },
      },
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.5",
          },
          contextTokens: 64000,
          skills: ["memory"],
        },
        list: [
          {
            id: "main",
            default: true,
            name: "Main",
            workspace: "~/workspace",
            model: {
              primary: "openai/gpt-5.5",
            },
            thinkingDefault: "low",
            skills: ["memory"],
            contextTokens: 64000,
          },
          {
            id: "ops",
            name: "Ops",
            workspace: "~/workspace/ops",
            model: {
              primary: "openai/gpt-5.5",
            },
            fastModeDefault: true,
          },
        ],
      },
      skills: {
        allowBundled: ["memory", "remoteclaw-testing"],
        limits: {
          maxSkillsInPrompt: 8,
          maxSkillsPromptChars: 30000,
        },
      },
      plugins: {
        enabled: true,
        allow: ["discord", "telegram", "whatsapp", "memory"],
        entries: {
          discord: { enabled: true },
          telegram: { enabled: true },
          whatsapp: { enabled: true },
        },
      },
      channels: {
        discord: {
          enabled: true,
          token: { source: "env", provider: "default", id: "DISCORD_BOT_TOKEN" },
          dm: {
            policy: "allowlist",
            allowFrom: ["111111111111111111"],
          },
          groupPolicy: "allowlist",
          guilds: {
            "222222222222222222": {
              slug: "survivor-guild",
              channels: {
                "333333333333333333": {
                  enabled: true,
                  requireMention: true,
                  tools: {
                    allow: ["message_send"],
                    deny: ["exec"],
                  },
                },
              },
            },
          },
          threadBindings: {
            enabled: true,
            idleHours: 72,
          },
        },
        telegram: {
          enabled: true,
          botToken: { source: "env", provider: "default", id: "TELEGRAM_BOT_TOKEN" },
          dmPolicy: "allowlist",
          allowFrom: ["123456789"],
          groups: {
            "-1001234567890": {
              enabled: true,
              requireMention: true,
            },
          },
        },
        whatsapp: {
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: ["+15555550123"],
          groups: {
            "120363000000000000@g.us": {
              systemPrompt: "Use the existing WhatsApp group prompt.",
            },
          },
        },
      },
    };
  }
  if (scenario === "gateway-loopback") {
    return {
      gateway: {
        port: Number(options.port || 18789),
        auth: {
          mode: "token",
          token: options.token || "remoteclaw-test-token",
        },
        controlUi: {
          enabled: false,
        },
      },
    };
  }
  return undefined;
}

function scenarioEnv(scenario) {
  if (scenario === "external-service") {
    return {
      REMOTECLAW_SERVICE_REPAIR_POLICY: "external",
    };
  }
  return {};
}

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`;
}

function renderExports(env) {
  return Object.entries(env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n");
}

function generateAuthProfileSecretKey() {
  return randomBytes(32).toString("hex");
}

function renderAuthProfileSecretKeyExport() {
  return [
    'REMOTECLAW_AUTH_PROFILE_SECRET_KEY_FILE="$REMOTECLAW_TEST_STATE_HOME/.remoteclaw-test-auth-profile-secret-key"',
    'if [ -s "$REMOTECLAW_AUTH_PROFILE_SECRET_KEY_FILE" ]; then',
    '  REMOTECLAW_AUTH_PROFILE_SECRET_KEY="$(cat "$REMOTECLAW_AUTH_PROFILE_SECRET_KEY_FILE")"',
    "else",
    '  REMOTECLAW_AUTH_PROFILE_SECRET_KEY="$(od -An -N 32 -tx1 /dev/urandom | tr -d " \\n")"',
    '  ( umask 077; printf "%s\\n" "$REMOTECLAW_AUTH_PROFILE_SECRET_KEY" > "$REMOTECLAW_AUTH_PROFILE_SECRET_KEY_FILE" )',
    "fi",
    'if [ -z "$REMOTECLAW_AUTH_PROFILE_SECRET_KEY" ]; then',
    '  echo "failed to generate REMOTECLAW_AUTH_PROFILE_SECRET_KEY" >&2',
    "  return 1 2>/dev/null || exit 1",
    "fi",
    "export REMOTECLAW_AUTH_PROFILE_SECRET_KEY",
  ];
}

function renderConfigWrite(configPathExpression, config) {
  if (config === undefined) {
    return "";
  }
  const json = JSON.stringify(config, null, 2);
  return [
    `cat > ${configPathExpression} <<'REMOTECLAW_TEST_STATE_JSON'`,
    json,
    "REMOTECLAW_TEST_STATE_JSON",
  ].join("\n");
}

function buildCreatePlan(options = {}) {
  const label = normalizeLabel(options.label);
  const scenario = requireScenario(options.scenario);
  if (!options.root) {
    throw new Error("buildCreatePlan requires root");
  }
  const root = options.root;
  const home = path.join(root, "home");
  const stateDir = path.join(home, ".remoteclaw");
  const configPath = path.join(stateDir, "remoteclaw.json");
  const workspaceDir = path.join(home, "workspace");
  const config = scenarioConfig(scenario, options);
  const env = {
    HOME: home,
    USERPROFILE: home,
    REMOTECLAW_HOME: home,
    REMOTECLAW_STATE_DIR: stateDir,
    REMOTECLAW_CONFIG_PATH: configPath,
    REMOTECLAW_AUTH_PROFILE_SECRET_KEY: generateAuthProfileSecretKey(),
    ...scenarioEnv(scenario),
  };
  return {
    label,
    scenario,
    root,
    home,
    stateDir,
    configPath,
    workspaceDir,
    env,
    hasConfig: config !== undefined,
    config,
  };
}

/** Create an isolated RemoteClaw test state directory and optional scenario config. */
export async function createState(options = {}) {
  const label = normalizeLabel(options.label);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `remoteclaw-${label}-`));
  const plan = buildCreatePlan({ ...options, root });
  await fs.mkdir(plan.stateDir, { recursive: true });
  await fs.mkdir(plan.workspaceDir, { recursive: true });
  if (plan.config !== undefined) {
    await fs.writeFile(plan.configPath, `${JSON.stringify(plan.config, null, 2)}\n`, "utf8");
  }
  return plan;
}

/** Render a dotenv-style env file for a created test state plan. */
export function renderEnvFile(plan) {
  return `${renderExports(plan.env)}\n`;
}

/** Render shell commands that create and export an isolated RemoteClaw test state. */
export function renderShellSnippet(options = {}) {
  const label = normalizeLabel(options.label);
  const scenario = requireScenario(options.scenario);
  const config = scenarioConfig(scenario, options);
  const env = scenarioEnv(scenario);
  const homeTemplate = `remoteclaw-${label}-${scenario}-home.XXXXXX`;
  const lines = [
    'REMOTECLAW_TEST_STATE_TMP_ROOT="${REMOTECLAW_TEST_STATE_TMPDIR:-${TMPDIR:-/tmp}}"',
    'REMOTECLAW_TEST_STATE_TMP_ROOT="${REMOTECLAW_TEST_STATE_TMP_ROOT%/}"',
    '[ -n "$REMOTECLAW_TEST_STATE_TMP_ROOT" ] || REMOTECLAW_TEST_STATE_TMP_ROOT="/tmp"',
    "export REMOTECLAW_TEST_STATE_TMP_ROOT",
    'mkdir -p "$REMOTECLAW_TEST_STATE_TMP_ROOT"',
    `REMOTECLAW_TEST_STATE_HOME="$(mktemp -d "$REMOTECLAW_TEST_STATE_TMP_ROOT/${homeTemplate}")"`,
    'export HOME="$REMOTECLAW_TEST_STATE_HOME"',
    'export USERPROFILE="$REMOTECLAW_TEST_STATE_HOME"',
    'export REMOTECLAW_HOME="$REMOTECLAW_TEST_STATE_HOME"',
    'export REMOTECLAW_STATE_DIR="$REMOTECLAW_TEST_STATE_HOME/.remoteclaw"',
    'export REMOTECLAW_CONFIG_PATH="$REMOTECLAW_STATE_DIR/remoteclaw.json"',
    ...renderAuthProfileSecretKeyExport(),
    'export REMOTECLAW_TEST_WORKSPACE_DIR="$REMOTECLAW_TEST_STATE_HOME/workspace"',
    'mkdir -p "$REMOTECLAW_STATE_DIR" "$REMOTECLAW_TEST_WORKSPACE_DIR"',
  ];
  for (const [key, value] of Object.entries(env)) {
    lines.push(`export ${key}=${shellQuote(value)}`);
  }
  const configWrite = renderConfigWrite('"$REMOTECLAW_CONFIG_PATH"', config);
  if (configWrite) {
    lines.push(configWrite);
  }
  return `${lines.join("\n")}\n`;
}

/** Render a reusable shell function for creating isolated RemoteClaw test state. */
export function renderShellFunction() {
  return `remoteclaw_test_state_create() {
  local raw_label="\${1:-state}"
  local label="$raw_label"
  local scenario="\${2:-empty}"
  case "$scenario" in
    empty|minimal|update-stable|upgrade-survivor|gateway-loopback|external-service) ;;
    *)
      echo "unknown RemoteClaw test-state scenario: $scenario" >&2
      return 1
      ;;
  esac
  case "$raw_label" in
    /*)
      REMOTECLAW_TEST_STATE_HOME="$raw_label"
      mkdir -p "$REMOTECLAW_TEST_STATE_HOME"
      ;;
    *)
      label="$(printf "%s" "$label" | tr -cs "A-Za-z0-9_.-" "-" | sed -e "s/^-*//" -e "s/-*$//")"
      [ -n "$label" ] || label="state"
      local tmp_root="\${REMOTECLAW_TEST_STATE_TMPDIR:-\${TMPDIR:-/tmp}}"
      tmp_root="\${tmp_root%/}"
      [ -n "$tmp_root" ] || tmp_root="/tmp"
      mkdir -p "$tmp_root"
      REMOTECLAW_TEST_STATE_HOME="$(mktemp -d "$tmp_root/remoteclaw-$label-$scenario-home.XXXXXX")"
      ;;
  esac
  export HOME="$REMOTECLAW_TEST_STATE_HOME"
  export USERPROFILE="$REMOTECLAW_TEST_STATE_HOME"
  export REMOTECLAW_HOME="$REMOTECLAW_TEST_STATE_HOME"
  export REMOTECLAW_STATE_DIR="$REMOTECLAW_TEST_STATE_HOME/.remoteclaw"
  export REMOTECLAW_CONFIG_PATH="$REMOTECLAW_STATE_DIR/remoteclaw.json"
  ${renderAuthProfileSecretKeyExport().join("\n  ")}
  export REMOTECLAW_TEST_WORKSPACE_DIR="$REMOTECLAW_TEST_STATE_HOME/workspace"
  unset REMOTECLAW_AGENT_DIR
  unset REMOTECLAW_SERVICE_REPAIR_POLICY
  mkdir -p "$REMOTECLAW_STATE_DIR" "$REMOTECLAW_TEST_WORKSPACE_DIR"
  case "$scenario" in
    minimal)
      cat > "$REMOTECLAW_CONFIG_PATH" <<'REMOTECLAW_TEST_STATE_JSON'
{}
REMOTECLAW_TEST_STATE_JSON
      ;;
    update-stable)
      cat > "$REMOTECLAW_CONFIG_PATH" <<'REMOTECLAW_TEST_STATE_JSON'
{
  "update": {
    "channel": "stable"
  },
  "plugins": {}
}
REMOTECLAW_TEST_STATE_JSON
      ;;
    upgrade-survivor)
      cat > "$REMOTECLAW_CONFIG_PATH" <<'REMOTECLAW_TEST_STATE_JSON'
{
  "update": {
    "channel": "stable"
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": {
        "source": "env",
        "provider": "default",
        "id": "GATEWAY_AUTH_TOKEN_REF"
      }
    },
    "controlUi": {
      "enabled": false
    }
  },
  "models": {
    "providers": {
      "openai": {
        "api": "openai-responses",
        "apiKey": {
          "source": "env",
          "provider": "default",
          "id": "OPENAI_API_KEY"
        },
        "baseUrl": "https://api.openai.com/v1",
        "models": []
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.5"
      },
      "contextTokens": 64000,
      "skills": [
        "memory"
      ]
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "name": "Main",
        "workspace": "~/workspace",
        "model": {
          "primary": "openai/gpt-5.5"
        },
        "thinkingDefault": "low",
        "skills": [
          "memory"
        ],
        "contextTokens": 64000
      },
      {
        "id": "ops",
        "name": "Ops",
        "workspace": "~/workspace/ops",
        "model": {
          "primary": "openai/gpt-5.5"
        },
        "fastModeDefault": true
      }
    ]
  },
  "skills": {
    "allowBundled": [
      "memory",
      "remoteclaw-testing"
    ],
    "limits": {
      "maxSkillsInPrompt": 8,
      "maxSkillsPromptChars": 30000
    }
  },
  "plugins": {
    "enabled": true,
    "allow": [
      "discord",
      "telegram",
      "whatsapp",
      "memory"
    ],
    "entries": {
      "discord": {
        "enabled": true
      },
      "telegram": {
        "enabled": true
      },
      "whatsapp": {
        "enabled": true
      }
    }
  },
  "channels": {
    "discord": {
      "enabled": true,
      "token": {
        "source": "env",
        "provider": "default",
        "id": "DISCORD_BOT_TOKEN"
      },
      "dm": {
        "policy": "allowlist",
        "allowFrom": [
          "111111111111111111"
        ]
      },
      "groupPolicy": "allowlist",
      "guilds": {
        "222222222222222222": {
          "slug": "survivor-guild",
          "channels": {
            "333333333333333333": {
              "enabled": true,
              "requireMention": true,
              "tools": {
                "allow": [
                  "message_send"
                ],
                "deny": [
                  "exec"
                ]
              }
            }
          }
        }
      },
      "threadBindings": {
        "enabled": true,
        "idleHours": 72
      }
    },
    "telegram": {
      "enabled": true,
      "botToken": {
        "source": "env",
        "provider": "default",
        "id": "TELEGRAM_BOT_TOKEN"
      },
      "dmPolicy": "allowlist",
      "allowFrom": [
        "123456789"
      ],
      "groups": {
        "-1001234567890": {
          "enabled": true,
          "requireMention": true
        }
      }
    },
    "whatsapp": {
      "enabled": true,
      "dmPolicy": "allowlist",
      "allowFrom": [
        "+15555550123"
      ],
      "groups": {
        "120363000000000000@g.us": {
          "systemPrompt": "Use the existing WhatsApp group prompt."
        }
      }
    }
  }
}
REMOTECLAW_TEST_STATE_JSON
      ;;
    gateway-loopback)
      cat > "$REMOTECLAW_CONFIG_PATH" <<'REMOTECLAW_TEST_STATE_JSON'
{
  "gateway": {
    "port": 18789,
    "auth": {
      "mode": "token",
      "token": "remoteclaw-test-token"
    },
    "controlUi": {
      "enabled": false
    }
  }
}
REMOTECLAW_TEST_STATE_JSON
      ;;
    external-service)
      export REMOTECLAW_SERVICE_REPAIR_POLICY="external"
      cat > "$REMOTECLAW_CONFIG_PATH" <<'REMOTECLAW_TEST_STATE_JSON'
{}
REMOTECLAW_TEST_STATE_JSON
      ;;
  esac
}
`;
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "help") {
    process.stdout.write(usage());
    return;
  }
  if (command === "shell") {
    process.stdout.write(renderShellSnippet(options));
    return;
  }
  if (command === "shell-function") {
    process.stdout.write(renderShellFunction());
    return;
  }
  if (command === "create") {
    const plan = await createState(options);
    if (options["env-file"]) {
      await fs.writeFile(options["env-file"], renderEnvFile(plan), "utf8");
    }
    if (options.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    }
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch(
    /** @param {unknown} error */ (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.stderr.write(usage());
      process.exitCode = 1;
    },
  );
}
