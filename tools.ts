import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";
import { odooRpc } from "./rpc.js";
import { getCfg } from "./handler.js";

export function registerOdooTool(api: ClawdbotPluginApi) {
  if (!api.registerTool) return;

  api.registerTool({
    name: "odoo_api",
    description:
      "Call any Odoo model method via legacy JSON-RPC. Use for search_read, create, write, unlink, button_confirm, or any other Odoo model method.",
    inputSchema: {
      type: "object",
      required: ["model", "method"],
      properties: {
        model: {
          type: "string",
          description:
            "Odoo model name, e.g. purchase.order, sale.order, res.partner, account.move, product.product",
        },
        method: {
          type: "string",
          description:
            "Method name, e.g. search_read, create, write, unlink, button_confirm, name_search",
        },
        args: {
          type: "array",
          description:
            "Positional arguments. For search_read: [domain]. For create: [{ field: value }]. For write: [[ids], { field: value }].",
          default: [],
        },
        kwargs: {
          type: "object",
          description:
            "Keyword arguments. For search_read: { fields: [...], limit: N, order: '...' }.",
          default: {},
        },
      },
    },
    handler: async ({ model, method, args = [], kwargs = {} }: any) => {
      const cfg = getCfg(api);
      if (!cfg) throw new Error("Odoo not configured - check channels.odoo config");
      const result = await odooRpc(cfg, model, method, args, kwargs);
      return JSON.stringify(result, null, 2);
    },
  });
}
