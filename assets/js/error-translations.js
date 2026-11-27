const ERROR_TRANSLATIONS = [
  [/inventory is not defined/ig, "O recurso de estoque não está disponível. Atualize a página e tente novamente."],
  [/new row violates row-level security policy/ig, "A operação não foi autorizada pelas regras de segurança do banco de dados."],
  [/row-level security policy|row-level security|rls policy/ig, "Acesso negado pelas regras de segurança do banco de dados (RLS)."],
  [/permission denied.*$/ig, "Você não tem permissão para realizar esta operação."],
  [/invalid login credentials/ig, "E-mail ou senha incorretos."],
  [/email not confirmed/ig, "Confirme seu e-mail antes de entrar."],
  [/user already registered/ig, "Já existe uma conta cadastrada com este e-mail."],
  [/password should be at least (\d+) characters?/ig, "A senha precisa ter pelo menos $1 caracteres."],
  [/jwt expired|token has expired/ig, "Sua sessão expirou. Entre novamente."],
  [/invalid api key|apikey is invalid/ig, "A chave de conexão com o servidor é inválida. Verifique a configuração do Supabase."],
  [/failed to fetch|network request failed|networkerror|load failed/ig, "Falha de conexão. Verifique sua internet e tente novamente."],
  [/duplicate key value violates unique constraint/ig, "Já existe um registro com esses dados."],
  [/violates foreign key constraint/ig, "Não é possível concluir: este registro possui vínculos com outros dados."],
  [/violates check constraint/ig, "Um dos valores informados não atende às regras do sistema."],
  [/null value in column .* violates not-null constraint/ig, "Preencha todos os campos obrigatórios."],
  [/relation .* does not exist/ig, "Uma tabela necessária não foi encontrada no banco de dados. Verifique as migrations."],
  [/function .* does not exist/ig, "Uma função necessária não foi encontrada no banco de dados. Verifique as migrations."],
  [/column .* does not exist/ig, "Uma coluna necessária não foi encontrada no banco de dados. Verifique a estrutura da tabela."],
  [/invalid input syntax for type/ig, "Um dos valores informados está em formato inválido."],
  [/canceling statement due to statement timeout|statement timeout/ig, "A operação demorou mais que o esperado. Tente novamente."],
  [/not authenticated|authentication required/ig, "Sua sessão não está autenticada. Entre novamente."],
  [/unauthorized|not authorized/ig, "Você não tem autorização para realizar esta operação."],
  [/too many requests|rate limit exceeded/ig, "Muitas tentativas em pouco tempo. Aguarde e tente novamente."],
  [/bucket not found/ig, "O armazenamento de arquivos não foi encontrado no Supabase."],
  [/object not found/ig, "O arquivo solicitado não foi encontrado."],
  [/payload too large/ig, "O arquivo enviado é maior que o limite permitido."],
  [/invalid email/ig, "O endereço de e-mail informado é inválido."],
  [/invalid password/ig, "A senha informada é inválida."]
];

export function translateErrorMessage(value, fallback = "Não foi possível concluir a operação. Tente novamente.") {
  let message = String(value?.message ?? value ?? "").trim();
  if (!message) return fallback;
  for (const [pattern, replacement] of ERROR_TRANSLATIONS) message = message.replace(pattern, replacement);
  if (/\b(error|failed|failure|denied|invalid|missing|does not exist|not found|unauthorized|forbidden|timeout|network|request|constraint|violates|authentication)\b/i.test(message)) return fallback;
  return message;
}
