import type { OdooConfig } from "./types.js";

export async function odooRpc(
  cfg: OdooConfig,
  model: string,
  method: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
): Promise<any> {
  if (!cfg.db || !cfg.uid || !cfg.password) {
    throw new Error("Odoo RPC requires db, uid, and password");
  }

  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "call",
    id: Date.now(),
    params: {
      service: "object",
      method: "execute_kw",
      args: [cfg.db, cfg.uid, cfg.password, model, method, args],
      kwargs,
    },
  });

  const resp = await fetch(`${cfg.url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const json = (await resp.json()) as any;
  if (json.error) {
    throw new Error(`Odoo RPC error: ${json.error.data?.message || json.error.message}`);
  }
  return json.result;
}

export async function sendToChannel(
  cfg: OdooConfig,
  channelId: number,
  text: string,
  isHtml = false,
): Promise<void> {
  await odooRpc(cfg, "discuss.channel", "openclaw_post_bot_message", [[channelId], text], {
    author_partner_id: cfg.botPartnerId,
    is_html: isHtml,
  });
}
