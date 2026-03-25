# openclaw-odoo

Odoo Discuss channel plugin for OpenClaw.

## What this plugin does

- Receives Odoo Discuss messages through polling.
- Routes private chats and @mentions into OpenClaw sessions.
- Sends OpenClaw replies back into Odoo Discuss.
- Exposes an `odoo_api` tool for direct Odoo model RPC calls.

## Installation

```bash
pnpm install

# Install locally (no build required)
openclaw plugins install -l $(pwd)
```

After installation, OpenClaw can load the plugin as a normal channel extension.

## Configuration

Config path: `channels.odoo`

```json
{
  "channels": {
    "odoo": {
      "url": "https://odoo.example.com",
      "db": "your-database",
      "uid": 2,
      "password": "your-password-or-token",
      "botPartnerId": 123,
      "webhookSecret": "openclaw-odoo-secret"
    }
  }
}
```

### Field reference

- `url`: **Required**. Base URL of the Odoo instance.
- `db`: **Required**. Odoo database name.
- `uid`: **Required**. Odoo user ID used for JSON-RPC.
- `password`: **Required**. Password or token for that user.
- `botPartnerId`: **Required**. Partner ID of the OpenClaw bot in Odoo.
- `webhookSecret`: Optional shared secret for webhook integrations.
- `apiKey`: Reserved field; current JSON-RPC path does not use it.

## Odoo side setup

Install the `openclaw_bot` Odoo addon from this repository, then confirm:

- the bot partner exists in Odoo
- `botPartnerId` matches that partner ID
- the OpenClaw instance can reach the Odoo URL
- the Odoo instance can reach the OpenClaw webhook if you enable webhook forwarding

## Local development

```bash
# inside extensions/odoo-channel
pnpm install
openclaw plugins install -l $(pwd)
```

## Publishing and reuse

Once this directory is pushed to GitHub or published as an npm package, other OpenClaw deployments can install it using the standard plugin install flow.

This is still an install-time capability, not a chat-time hot install. In other words, OpenClaw must install the plugin first before chat can use it.
