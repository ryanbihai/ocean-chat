export interface RegistrationData {
  agent_id: string;
  api_key: string;
}

export interface OpenIDData {
  my_openid: string;
  created_at: string;
}

export interface ApiKeyData {
  key_id: string;
  api_key: string;
}

export interface AgentState {
  agent_id: string;
  api_key: string;
  extra_keys: ApiKeyData[];
  created_at?: string;
}
