import { supabase, isSupabaseConfigured } from "./supabase.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#form-message");
const submitButton = form.querySelector('button[type="submit"]');
let isSubmitting = false;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "Verificando acesso...";
  message.textContent = "";
  if (!isSupabaseConfigured) {
    message.textContent =
      "Configure as credenciais do Supabase em assets/js/config.js.";
    resetSubmit();
    return;
  }
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      message.textContent =
        "Não foi possível entrar. Confira seu e-mail e senha.";
      resetSubmit();
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,active")
      .eq("id", data.user.id)
      .single();

    if (
      profileError ||
      !profile?.active ||
      !["owner", "admin", "manager", "employee", "operator"].includes(profile.role)
    ) {
      await supabase.auth.signOut();
      message.textContent =
        "Esta conta não possui permissão para acessar a administração.";
      resetSubmit();
      return;
    }

    window.location.replace("/admin/dashboard");
  } catch (error) {
    console.error("Falha ao autenticar no painel:", error);
    message.textContent = "Não foi possível concluir o acesso. Tente novamente.";
    resetSubmit();
  }
});

function resetSubmit() {
  isSubmitting = false;
  submitButton.disabled = false;
  submitButton.textContent = "Entrar no painel";
}

// Exibe a senha somente enquanto o botão estiver pressionado.
const passwordInput = document.querySelector("#password");
const passwordPeek = document.querySelector("#password-peek");
const revealPassword = () => {
  passwordInput.type = "text";
};
const hidePassword = () => {
  passwordInput.type = "password";
};
passwordPeek.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  passwordPeek.setPointerCapture?.(event.pointerId);
  revealPassword();
});
["pointerup", "pointercancel", "lostpointercapture", "pointerleave"].forEach(
  (type) => passwordPeek.addEventListener(type, hidePassword),
);
passwordPeek.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") revealPassword();
});
passwordPeek.addEventListener("keyup", (event) => {
  if (event.key === " " || event.key === "Enter") hidePassword();
});
