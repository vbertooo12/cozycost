import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const filledIn =
  /^https:\/\/.+\.supabase\.co\/?$/.test(SUPABASE_URL) &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  !SUPABASE_ANON_KEY.startsWith("YOUR-");

/** The Supabase client, or null when not configured / unreachable. */
export let supabase = null;
/** True only when settings are filled in AND the library loaded. */
export let isConfigured = false;

if (filledIn) {
  try {
    const { createClient } = await import(CDN);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    isConfigured = true;
  } catch (err) {
    console.warn("[Cozy Crafts] Couldn't load Supabase:", err);
  }
}

/** Turn a Supabase/Postgres error into a sentence for people. */
export function friendlyError(err) {
  if (!err) return "Something went wrong. Please try again.";
  const msg = err.message || String(err);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "We couldn't reach the shop server. Check your connection and try again.";
  if (/JWT|token/i.test(msg)) return "Your session expired. Please sign in again.";
  return msg;
}
