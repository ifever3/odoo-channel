import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";
import type { OdooMessage } from "./types.js";
import { odooRpc } from "./rpc.js";
import { cleanOdooBody } from "./format.js";
import { getCfg } from "./handler.js";
import { handleInboundMessage } from "./handler.js";

// 模块级别状态
let lastMessageId = 0;
let pollingTimer: ReturnType<typeof setInterval> | null = null;

// 全局存储（跨实例共享）
const GLOBAL_STARTED_KEY = '__odoo_channel_started__';
const GLOBAL_PROCESSED_KEY = '__odoo_channel_processed_ids__';
const GLOBAL_CURSOR_KEY = '__odoo_channel_cursor__';
const GLOBAL_PROCESSING_KEY = '__odoo_channel_processing__';

function isGloballyStarted(): boolean {
  return !!(globalThis as any)[GLOBAL_STARTED_KEY];
}

function setGloballyStarted(): void {
  (globalThis as any)[GLOBAL_STARTED_KEY] = true;
}

function getGlobalProcessedIds(): Set<number> {
  if (!(globalThis as any)[GLOBAL_PROCESSED_KEY]) {
    (globalThis as any)[GLOBAL_PROCESSED_KEY] = new Set<number>();
  }
  return (globalThis as any)[GLOBAL_PROCESSED_KEY];
}

function getGlobalCursor(): number {
  return (globalThis as any)[GLOBAL_CURSOR_KEY] || 0;
}

function setGlobalCursor(id: number): void {
  (globalThis as any)[GLOBAL_CURSOR_KEY] = id;
}

function getGlobalProcessing(): Set<number> {
  if (!(globalThis as any)[GLOBAL_PROCESSING_KEY]) {
    (globalThis as any)[GLOBAL_PROCESSING_KEY] = new Set<number>();
  }
  return (globalThis as any)[GLOBAL_PROCESSING_KEY];
}

export function registerPollingService(api: ClawdbotPluginApi) {
  // 使用全局标志防止重复启动
  if (isGloballyStarted()) {
    api.logger?.info("[odoo-channel] polling already started globally");
    return;
  }

  setGloballyStarted();
  api.logger?.info("[odoo-channel] registerPollingService called");

  const poll = async () => {
    const cfg = getCfg(api);
    if (!cfg) return;

    try {
      let cursor = getGlobalCursor();

      if (cursor === 0) {
        const msgs = await odooRpc(cfg, "mail.message", "search_read", [[]], {
          fields: ["id"],
          limit: 1,
          order: "id desc",
        });
        cursor = msgs?.[0]?.id ?? 0;
        setGlobalCursor(cursor);
        lastMessageId = cursor;
        api.logger?.info(`[odoo-channel] cursor initialized at ${cursor}`);
        return;
      }

      const newMsgs = (await odooRpc(
        cfg,
        "mail.message",
        "search_read",
        [[
          ["id", ">", cursor],
          ["model", "=", "discuss.channel"],
          ["message_type", "in", ["comment", "email"]],
        ]],
        {
          fields: ["id", "body", "author_id", "partner_ids", "res_id", "date"],
          order: "id asc",
          limit: 20,
        },
      )) as OdooMessage[];

      if (!newMsgs?.length) return;

      const processedIds = getGlobalProcessedIds();
      const processingIds = getGlobalProcessing();

      for (const msg of newMsgs) {
        // 更新游标
        const newMaxId = Math.max(getGlobalCursor(), msg.id);
        setGlobalCursor(newMaxId);
        lastMessageId = newMaxId;

        // 检查是否已处理或正在处理
        if (processedIds.has(msg.id) || processingIds.has(msg.id)) {
          continue;
        }

        const authorId = msg.author_id?.[0];
        const authorName = msg.author_id?.[1] ?? "?";
        const cleaned = cleanOdooBody(msg.body ?? "");

        // 跳过 Bot 消息
        if (authorId === cfg.botPartnerId) {
          processedIds.add(msg.id);
          continue;
        }

        // 检测 Bot 回显
        if (!authorId || authorName === "?") {
          const isBotEcho = [
            /^✨/, /^🧾/, /^📦/, /^❌/, /^✅/,
            /Compacting context/i,
            /OpenClaw/i,
            /我是.*AI/i,
            /我看到了/i,
            /对，你说得对/i,
            /这个动作影响比较大/i,
            /JSON-2/i,
            / Yep.*echo loop/i,
            /Looks like my message got echoed back/i,
            /Let.s simplify it so the echo is obvious/i,
            /收到。.*我刚上线/i,
            /消息回显/i,
            /身份映射异常/i,
          ].some(p => p.test(cleaned));

          if (isBotEcho) {
            processedIds.add(msg.id);
            api.logger?.info(`[odoo-channel] skip bot echo #${msg.id}: ${cleaned.slice(0, 40)}`);
            continue;
          }
        }

        // 标记为正在处理（防止重复处理）
        processingIds.add(msg.id);

        api.logger?.info(`[odoo-channel] new msg #${msg.id} from="${authorName}": ${cleaned.slice(0, 60)}`);

        try {
          await handleInboundMessage(api, cfg, msg);
        } finally {
          // 处理完成后标记为已处理
          processingIds.delete(msg.id);
          processedIds.add(msg.id);
        }

        // 清理旧记录
        if (processedIds.size > 200) {
          const sorted = Array.from(processedIds).sort((a, b) => a - b);
          sorted.slice(0, sorted.length - 100).forEach(id => processedIds.delete(id));
        }
      }
    } catch (e: any) {
      api.logger?.error(`[odoo-channel] poll error: ${e?.message}`);
    }
  };

  const startPolling = async () => {
    api.logger?.info("[odoo-channel] starting polling");
    await poll();
    pollingTimer = setInterval(poll, 3000);
    api.logger?.info("[odoo-channel] polling active (3s)");
  };

  startPolling();

  api.registerService({
    id: "odoo-poller",
    start: async () => {
      api.logger?.info("[odoo-channel] service start called (already running)");
    },
    stop: () => {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
        (globalThis as any)[GLOBAL_STARTED_KEY] = false;
      }
      api.logger?.info("[odoo-channel] polling stopped");
    },
  });
}
