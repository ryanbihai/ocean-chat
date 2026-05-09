export interface Message {
  seq_id: number;
  from_openid: string;
  to_openid?: string;
  content: string;
  created_at: string;
}

export interface SyncData {
  messages: Message[];
  has_more: boolean;
}

export interface SendPayload {
  to_openid: string;
  client_msg_id: string;
  content: string;
}

export interface BlockPayload {
  from_openid: string;
}

export interface ReverseLookupData {
  real_agent_id: string;
}

export interface SendOptions {
  clientMsgId?: string;
}

export interface ListenOptions {
  intervalMs?: number;
  sinceSeq?: number;
  limit?: number;
}
