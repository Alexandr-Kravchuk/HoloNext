export interface AgentAction {
  id: string;
  kind: "mutation" | "query" | "human-delegated";
  label: string;
  description?: string;
  params: Record<string, unknown>;
  returns?: Record<string, unknown>;
  safety?: Record<string, unknown>;
}

export interface AgentManifest {
  version: string;
  page: { url: string; title: string; context?: string };
  actions: AgentAction[];
  state: Record<string, unknown>;
  events_endpoint: string;
}

export async function loadManifest(baseUrl: string): Promise<AgentManifest> {
  const res = await fetch(`${baseUrl}/.well-known/agent-manifest.json`);
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  return res.json();
}
