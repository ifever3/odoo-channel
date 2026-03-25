export interface OdooConfig {
  url: string;
  db?: string;
  uid?: number;
  password?: string;
  apiKey?: string;
  botPartnerId: number;
  webhookSecret?: string;
}

export type MaybeWrappedOdooConfig = OdooConfig & { odoo?: OdooConfig };

export type OdooMessage = {
  id: number;
  body?: string;
  author_id?: [number, string];
  partner_ids?: number[];
  res_id?: number;
  date?: string;
};

export type OdooChannel = {
  id: number;
  name?: string;
  channel_type?: string;
};
