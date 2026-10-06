/* =====================================================================
   Cozy Crafts — connection settings
   Paste your values from Supabase → Project Settings → API.
   The "anon" (or "publishable") key is meant to be public: what visitors
   can do is limited by the Row Level Security rules in supabase/schema.sql.
   NEVER put the service_role / secret key in this file.
   ===================================================================== */
export const SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-OR-PUBLISHABLE-KEY";

export const SHOP = {
  currency: "PHP",
  locale: "en-PH",
  lowStockHint: 5          // show "Only N left" on product cards at or below this
};
