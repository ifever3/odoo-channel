import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";

import { setOdooRuntime } from "./src/runtime.js";
import { getCfg } from "./src/handler.js";
import { registerPollingService } from "./src/polling.js";
import { registerOdooTool } from "./src/tools.js";
import { sendToChannel } from "./src/rpc.js";

const odooPlugin = {
  id: "odoo",
  meta: {
    id: "odoo",
    label: "Odoo Discuss",
    selectionLabel: "Odoo Discuss (local deploy)",
    docsPath: "/channels/odoo",
    blurb: "Odoo Discuss channel plugin supporting DMs and group channels.",
    aliases: ["odoo", "odoo-discuss"],
  },
  capabilities: {
    chatTypes: ["direct", "group"],
  },
  config: {
    listAccountIds: (cfg: any) => {
      // 尝试多种配置路径
      const channelCfg = cfg?.plugins?.entries?.["odoo-channel"]?.config 
        || cfg?.channels?.odoo 
        || cfg?.plugins?.["odoo-channel"];
      return channelCfg ? ["default"] : [];
    },
    resolveAccount: (cfg: any, accountId: string) => {
      const channelCfg = cfg?.plugins?.entries?.["odoo-channel"]?.config 
        || cfg?.channels?.odoo 
        || cfg?.plugins?.["odoo-channel"];
      return channelCfg ? { accountId, ...(channelCfg.odoo || channelCfg) } : null;
    },
  },
  outbound: {
    deliveryMode: "direct",
    sendText: async ({ text, to }: { text: string; to: string }) => {
      const cfg = getCfg({ config: (global as any).clawdbotConfig } as any);
      if (!cfg) return { ok: false, error: "Odoo not configured" };

      const match = to.match(/^(?:channel|chat|group):(\d+)$/) ?? to.match(/^(\d+)$/);
      if (!match) return { ok: false, error: `Invalid 'to' format: ${to}` };

      const channelId = parseInt(match[1], 10);
      await sendToChannel(cfg, channelId, text);
      return { ok: true };
    },
  },
};

const plugin = {
  id: "odoo-channel",
  name: "Odoo Discuss",
  description: "Odoo Discuss channel plugin",
  register(api: ClawdbotPluginApi) {
    console.log("[odoo-channel] REGISTER FUNCTION CALLED");
    api.logger?.info("[odoo-channel] register() started");
    
    try {
      setOdooRuntime(api.runtime);
      api.logger?.info("[odoo-channel] runtime set");
      
      (global as any).clawdbotConfig = api.config;
      api.logger?.info("[odoo-channel] config stored globally");
      
      api.registerChannel({ plugin: odooPlugin as any });
      api.logger?.info("[odoo-channel] channel registered");

      // 注册工具
      registerOdooTool(api);
      
      registerPollingService(api);
      api.logger?.info("[odoo-channel] polling service registered");

      api.logger?.info("[odoo-channel] plugin loaded successfully");
    } catch (err) {
      console.error("[odoo-channel] REGISTER ERROR:", err);
      api.logger?.error(`[odoo-channel] register failed: ${err}`);
      throw err;
    }
  },
};

export default plugin;
