import { supabase, isSupabaseConfigured } from "./supabase.js";
import { saveLocalMessage } from "./contact-store.js";

const form = document.querySelector("#contact-form");
if (form) {
  const status = form.querySelector("[data-contact-status]");
  const submit = form.querySelector("[type=submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const message = {
      name: String(data.name || "").trim(),
      email: String(data.email || "").trim().toLowerCase(),
      phone: String(data.phone || "").trim() || null,
      subject: String(data.subject || "").trim(),
      message: String(data.message || "").trim()
    };
    if (!message.name || !message.email || !message.subject || !message.message) return;
    submit.disabled = true;
    submit.textContent = "Enviando...";
    status.textContent = "";
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from("contact_messages").insert(message);
        if (error) throw error;
      } else {
        await saveLocalMessage({ id: crypto.randomUUID(), ...message, status: "new", created_at: new Date().toISOString() });
      }
      form.reset();
      status.textContent = "Mensagem enviada! Nossa equipe entrará em contato.";
      status.className = "contact-status success";
    } catch (error) {
      console.error(error);
      status.textContent = "Não foi possível enviar agora. Tente novamente em instantes.";
      status.className = "contact-status error";
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar mensagem";
    }
  });
}
