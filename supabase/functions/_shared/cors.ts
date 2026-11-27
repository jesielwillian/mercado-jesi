// Configure CORS_ALLOWED_ORIGIN in Supabase Edge Function secrets with the
// exact HTTPS origin of the storefront (for example: https://mercadojesi.com.br).
// For a separate staging environment, deploy with that environment's origin.
const configuredOrigin = Deno.env.get("CORS_ALLOWED_ORIGIN") || Deno.env.get("SITE_URL") || "";
let allowedOrigin = "https://invalid.invalid"; // fail closed when not configured

try {
  const parsedOrigin = new URL(configuredOrigin);
  if (parsedOrigin.protocol === "https:") allowedOrigin = parsedOrigin.origin;
} catch {
  // Keep the invalid fallback so browser requests are rejected by CORS.
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
