import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return { supabaseUrl, supabaseAnonKey };
}

export function getSupabaseConfigError() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    return "Supabase is not configured. Check your environment variables.";
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL must be a valid URL like https://your-project.supabase.co.";
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "").toLowerCase();

  if (normalizedPath.includes("/rest/v1")) {
    return "NEXT_PUBLIC_SUPABASE_URL should be the project URL, not the REST API URL. Remove /rest/v1.";
  }

  if (normalizedPath && normalizedPath !== "/") {
    return "NEXT_PUBLIC_SUPABASE_URL should be the project URL only, without extra path segments.";
  }

  return null;
}

export function getSupabaseClient(accessToken?: string) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  if (getSupabaseConfigError() || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  if (typeof window === "undefined") {
    return createClient(supabaseUrl, supabaseAnonKey);
  }

  if (browserClient === undefined) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}
