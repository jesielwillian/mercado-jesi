import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const roles = new Set(["owner", "admin", "manager", "employee", "operator", "delivery", "customer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Faça login novamente para continuar." }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

    const { data: actor, error: actorError } = await admin.from("profiles")
      .select("role,active").eq("id", auth.user.id).single();
    if (actorError || !actor?.active || !["owner", "admin"].includes(actor.role)) {
      return json({ error: "Somente Proprietário ou Administrador pode adicionar usuários." }, 403);
    }

    const body = await req.json();
    const fullName = String(body.full_name || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim().slice(0, 20);
    const password = String(body.password || "");
    const role = String(body.role || "employee");
    if (fullName.length < 2) return json({ error: "Informe o nome completo." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (password.length < 8) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
    if (!roles.has(role)) return json({ error: "Função inválida." }, 400);
    if (role === "owner" && actor.role !== "owner") return json({ error: "Somente um Proprietário pode criar outro Proprietário." }, 403);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, phone }
    });
    if (createError || !created.user) {
      const message = createError?.message || "Não foi possível criar a conta.";
      return json({ error: message.includes("already") ? "Este e-mail já está cadastrado." : message }, 409);
    }

    const { error: profileError } = await admin.from("profiles").update({
      full_name: fullName, phone: phone || null, role, active: true
    }).eq("id", created.user.id);
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    return json({ ok: true, user_id: created.user.id });
  } catch (error) {
    console.error("create-staff-user", error);
    return json({ error: "Ocorreu um erro ao criar o usuário. Verifique a configuração da função no Supabase." }, 500);
  }
});
