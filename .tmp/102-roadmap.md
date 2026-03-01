# Issue #102: Remove in-process LLM packages and dead model management

## Phase 1: Extract live utilities

- [ ] Extract `normalizeProviderId()` to `src/agents/provider-utils.ts`
- [ ] Extract `resolveApiKeyForProvider()` to surviving auth module
- [ ] Check `parseModelRef()` / `ModelRef` extraction needs

## Phase 2: Delete ~70 dead files

- [ ] Delete model management source files (8 in src/agents/)
- [ ] Delete model management test files (8+ in src/agents/)
- [ ] Delete provider catalog source files (11+ in src/agents/)
- [ ] Delete provider catalog test files (14+ in src/agents/)
- [ ] Delete `src/config/types.models.ts`
- [ ] Delete orphaned execution utilities (5 source + 7 tests)
- [ ] Delete CLI runner chain (cli-runner.ts, claude-cli-runner.ts, cli-runner/\*)
- [ ] Delete system prompt chain (3 source + 4 tests)
- [ ] Delete pi-extensions/ directory (all dead)
- [ ] Delete pi-tool-definition-adapter.ts + tests (dead)
- [ ] Delete models-config.test-utils.ts (orphaned)

## Phase 3: Cascade-update ~35 callers

- [ ] Update telegram callers (bot-message-dispatch, bot-message-context, sticker-cache)
- [ ] Update auto-reply callers (~7 files)
- [ ] Update gateway callers (~5 files)
- [ ] Update commands callers (~5 files)
- [ ] Update cron callers (isolated-agent/run.ts + test)
- [ ] Update media-understanding callers (~3 files)
- [ ] Update config/plugin callers
- [ ] Update agent infrastructure callers (~5 files)
- [ ] Redirect system prompt callers to middleware

## Phase 4: Replace surviving pi-\* imports (~70 files)

- [ ] Create local type stubs for pi-agent-core types
- [ ] Create local type stubs for pi-ai types
- [ ] Vendor/stub pi-coding-agent exports used by surviving code
- [ ] Vendor/stub pi-tui exports used by surviving TUI code
- [ ] Update all surviving import sites

## Phase 5: Remove packages

- [ ] Remove 4 pi-\* packages from package.json
- [ ] Run pnpm install

## Phase 6: Verify

- [ ] pnpm build passes
- [ ] pnpm test passes
