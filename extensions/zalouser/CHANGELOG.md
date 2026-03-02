# Changelog

## 0.1.0

### Changes

- Rebuilt the plugin to use native `zca-js` integration inside RemoteClaw (no external `zca` CLI runtime dependency).

### Breaking

- **BREAKING:** Removed the old external CLI-based backend (`zca`/`openzca`/`zca-cli`) from runtime flow. Existing setups that depended on external CLI binaries should re-login with `remoteclaw channels login --channel zalouser` after upgrading.

## 2026.2.24

### Changes

- Version alignment with core RemoteClaw release numbers.

## 2026.2.22

### Changes

- Version alignment with core RemoteClaw release numbers.

## 2026.1.17-1

- Initial version with full channel plugin support
- QR code login via zca-cli
- Multi-account support
- Agent tool for sending messages
- Group and DM policy support
- ChannelDock for lightweight shared metadata
- Zod-based config schema validation
- Setup adapter for programmatic configuration
- Dedicated probe and status issues modules
