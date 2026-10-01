import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { getKnownSupabaseSession, setKnownSupabaseSession } from "@/lib/supabase-auth";


type EdgeInvokeOptions = Parameters<typeof supabase.functions.invoke>[1];

function resolveSourceModule() {
  const stack = new Error().stack?.split("\n") ?? [];

  for (const line of stack) {
    if (line.includes("node_modules") || line.includes("src/lib/apiClient.ts") || line.includes("src/integrations/supabase/client.ts")) {
      continue;
    }

    const match = line.match(/(?:https?:\/\/[^\s)]+\/)?(src\/[^\s):?]+\.(?:ts|tsx|js|jsx))(?:\?[^\s):]*)?(?::\d+:\d+)?/);
    if (match?.[1]) return match[1];
  }

  return "unknown";
}

async function getAccessToken(): Promise<string | null> {
  const cachedSession = getKnownSupabaseSession();
  const now = Math.floor(Date.now() / 1000);

  // Do not reuse a cached JWT that is already expired (or about to expire).
  if (cachedSession?.access_token && (!cachedSession.expires_at || cachedSession.expires_at > now + 60)) {
    return cachedSession.access_token;
  }

  // Read the authoritative browser session. Supabase may refresh an expired
  // session here when auto-refresh is enabled.
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (session?.access_token && (!session.expires_at || session.expires_at > now + 60)) {
      setKnownSupabaseSession(session);
      return session.access_token;
    }

    // If the session is expired, explicitly refresh before invoking protected
    // Edge Functions so a stale cached JWT cannot produce a 401.
    const refreshed = await supabase.auth.refreshSession();
    const refreshedSession = refreshed.data?.session;
    if (refreshedSession?.access_token) {
      setKnownSupabaseSession(refreshedSession);
      return refreshedSession.access_token;
    }
  } catch {
    // ignore; the caller will surface the authenticated-request error
  }

  return null;
}

async function invokeWithHeaders(
  functionName: string,
  options?: EdgeInvokeOptions,
) {
  const accessToken = await getAccessToken();
  const headers = new Headers(options?.headers);
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const source = resolveSourceModule();
  // eslint-disable-next-line no-console
  console.debug("[apiClient:request]", {
    source,
    type: "edge",
    target: functionName,
    tokenPresent: !!accessToken,
    apiKeyPresent: headers.has("apikey"),
  });

  return supabase.functions.invoke(functionName, {
    ...options,
    headers: Object.fromEntries(headers.entries()),
  });
}

export const apiClient = {
  from: supabase.from.bind(supabase) as typeof supabase.from,
  rpc: supabase.rpc.bind(supabase) as typeof supabase.rpc,
  auth: supabase.auth,
  storage: supabase.storage,
  channel: supabase.channel.bind(supabase) as typeof supabase.channel,
  removeChannel: supabase.removeChannel.bind(supabase) as typeof supabase.removeChannel,
  removeAllChannels: supabase.removeAllChannels.bind(supabase) as typeof supabase.removeAllChannels,
  functions: {
    invoke: invokeWithHeaders,
  },
};

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
  
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const source = resolveSourceModule();
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  // eslint-disable-next-line no-console
  console.debug("[apiClient:request]", {
    source,
    type: url.startsWith(SUPABASE_URL) ? (url.includes("/functions/v1/") ? "edge" : "supabase") : "fetch",
    target: url,
    tokenPresent: !!accessToken,
    apiKeyPresent: headers.has("apikey"),
  });

  return fetch(input, { ...init, headers });
}
