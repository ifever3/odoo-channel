import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";
import type { OdooConfig, OdooMessage } from "./types.js";
import { odooRpc, sendToChannel } from "./rpc.js";
import { cleanOdooBody, formatOdooRichText } from "./format.js";
import { getOdooRuntime } from "./runtime.js";

export function getCfg(api: ClawdbotPluginApi): OdooConfig | null {
  const raw = api.config?.plugins?.entries?.["odoo-channel"]?.config
    || api.config?.channels?.odoo
    || api.config?.plugins?.["odoo-channel"];
  
  if (!raw) return null;
  
  const cfg = raw?.odoo?.url ? raw.odoo : raw;
  
  if (!cfg?.url || !cfg?.botPartnerId || !cfg.db || !cfg.uid || !cfg.password) {
    return null;
  }
  
  return cfg as OdooConfig;
}

export async function handleInboundMessage(
  api: ClawdbotPluginApi,
  cfg: OdooConfig,
  msg: OdooMessage,
) {
  const core = getOdooRuntime();
  const channelId = msg.res_id;
  api.logger?.info(`odoo-channel: handleInbound start messageId=${msg.id} channelId=${channelId ?? "?"}`);
  if (!channelId) return;

  const channels = await odooRpc(cfg, "discuss.channel", "search_read", [[["id", "=", channelId]]], {
    fields: ["id", "name", "channel_type"],
    limit: 1,
  });
  const channel = channels?.[0] as { id: number; name?: string; channel_type?: string } | undefined;
  api.logger?.info(`odoo-channel: fetched channel messageId=${msg.id} found=${channel ? "yes" : "no"}`);
  if (!channel) return;

  const isPrivateChat = channel.channel_type === "chat";
  const mentionsBot = Array.isArray(msg.partner_ids) && msg.partner_ids.includes(cfg.botPartnerId);
  api.logger?.info(`odoo-channel: channel_type=${channel.channel_type ?? "?"} isPrivate=${isPrivateChat} mentionsBot=${mentionsBot}`);
  if (!isPrivateChat && !mentionsBot) return;

  const bodyText = cleanOdooBody(msg.body ?? "");
  api.logger?.info(`odoo-channel: cleaned body messageId=${msg.id} len=${bodyText.length}`);
  if (!bodyText) return;

  const authorId = String(msg.author_id?.[0] ?? "unknown");
  const authorName = msg.author_id?.[1] ?? "Unknown User";
  const peerId = String(channelId);

  const resolvedRoute = core.channel.routing.resolveAgentRoute({
    cfg: api.config,
    channel: "odoo",
    accountId: "default",
    peer: {
      kind: isPrivateChat ? "dm" : "group",
      id: peerId,
    },
    messageText: isPrivateChat ? bodyText : null,
  });
  const agentId = resolvedRoute?.agentId || "main";
  const accountId = resolvedRoute?.accountId || "default";
  const sessionKey = `agent:${agentId}:odoo:${isPrivateChat ? "dm" : "group"}:${peerId}`;
  api.logger?.info(`odoo-channel: sessionKey=${sessionKey} agentId=${agentId}`);

  const chatType = isPrivateChat ? "direct" : "group";
  const to = isPrivateChat ? `chat:${channelId}` : `channel:${channelId}`;
  const fromLabel = isPrivateChat
    ? authorName
    : `${channel.name || `channel-${channelId}`} / ${authorName}`;

  core.system.enqueueSystemEvent(
    isPrivateChat
      ? `Odoo DM from ${authorName}: ${bodyText.slice(0, 160)}`
      : `Odoo message in ${channel.name || channelId} from ${authorName}: ${bodyText.slice(0, 160)}`,
    { sessionKey, contextKey: `odoo:message:${channelId}:${msg.id}` },
  );

  const body = core.channel.reply.formatInboundEnvelope({
    channel: "Odoo Discuss",
    from: fromLabel,
    timestamp: msg.date ? Date.parse(msg.date) : undefined,
    body: `${bodyText}\n[odoo message id: ${msg.id} channel: ${channelId}]\n\n注意：你可以使用 odoo_api 工具查询或操作 Odoo 数据。`,
    chatType,
    sender: { name: authorName, id: authorId },
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: bodyText,
    CommandBody: bodyText,
    From: isPrivateChat ? `odoo:${authorId}` : `odoo:channel:${channelId}`,
    To: to,
    SessionKey: sessionKey,
    AccountId: accountId,
    ChatType: chatType,
    ConversationLabel: fromLabel,
    GroupSubject: !isPrivateChat ? (channel.name || `channel-${channelId}`) : undefined,
    SenderName: authorName,
    SenderId: authorId,
    Provider: "odoo",
    Surface: "odoo",
    MessageSid: String(msg.id),
    Timestamp: msg.date ? Date.parse(msg.date) : undefined,
    WasMentioned: !isPrivateChat ? mentionsBot : undefined,
    OriginatingChannel: "odoo",
    OriginatingTo: to,
  });

  if (isPrivateChat) {
    const storePath = core.channel.session.resolveStorePath(api.config?.session?.store, {
      agentId,
    });
    await core.channel.session.updateLastRoute({
      storePath,
      sessionKey,
      deliveryContext: { channel: "odoo", to, accountId },
    });
  }

  const textLimit = core.channel.text.resolveTextChunkLimit(api.config, "odoo", "default", {
    fallbackLimit: 4000,
  });
  const chunkMode = core.channel.text.resolveChunkMode(api.config, "odoo", "default");

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      humanDelay: core.channel.reply.resolveHumanDelayConfig(api.config, agentId),
      deliver: async (payload: { text?: string }) => {
        const text = payload.text ?? "";
        const chunks = core.channel.text.chunkMarkdownTextWithMode(text, textLimit, chunkMode);
        for (const chunk of chunks.length > 0 ? chunks : [text]) {
          if (!chunk) continue;
          await sendToChannel(cfg, channelId, formatOdooRichText(chunk), true);
        }
        api.logger?.info(`odoo-channel: delivered reply to ${to}`);
      },
      onError: (err: unknown, info: { kind: string }) => {
        api.logger?.error(`odoo ${info.kind} reply failed: ${String(err)}`);
      },
    });

  await core.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg: api.config,
    dispatcher,
    replyOptions,
  });
  markDispatchIdle();
}
