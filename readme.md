# Mercado Jesi

Loja virtual e sistema de gestão para mercearia, com frontend HTML/CSS/JavaScript e Supabase.

## Requisitos

- Projeto Supabase
- Navegador moderno
- Servidor HTTP local (não abra os módulos ES diretamente via `file://`)

## Começar

1. Crie um projeto em https://supabase.com/dashboard.
2. No SQL Editor, execute todas as migrations de `supabase/migrations/` em ordem numérica, de `0001_initial_schema.sql` até `0021_advanced_operations.sql`. Não reaplique migrations já executadas.
3. Em Project Settings > API, copie a Project URL e a chave publishable (ou anon).
4. Preencha `assets/js/config.js` com esses valores públicos.
5. Sirva a pasta por HTTP. Exemplo com VS Code Live Server ou `npx serve .`.

## Criar o primeiro administrador

1. Em Authentication > Users, crie o usuário proprietário.
2. Copie o UUID desse usuário.
3. No SQL Editor, execute:

```sql
update public.profiles
set role = 'owner', active = true
where id = 'UUID_DO_USUARIO';
```

Não existe cadastro público de administrador. Novos usuários são criados como `customer`.

## Segurança

- Nunca exponha `service_role` ou secrets no navegador.
- A chave publishable/anon pode estar no frontend somente com RLS corretamente configurada.
- Revise as políticas antes de colocar em produção.
- Checkout, pagamentos, alteração de estoque e fechamento de caixa devem ser processados por RPC transacional ou Edge Functions, nunca confiados ao navegador.

## Estrutura

- `index.html`: vitrine pública
- `admin/index.html`: login administrativo
- `assets/js`: módulos JavaScript e integração Supabase
- `supabase/migrations`: schema versionado do banco

## Gestão de produtos (já disponível)

O painel em `admin/dashboard.html` possui cadastro, edição e exclusão de produtos, com:
- Nome, categoria, descrição, SKU e código de barras.
- Preço de venda, custo, unidade, estoque e estoque mínimo.
- Upload de imagem JPG, PNG ou WebP (limite de 5 MB).
- Status ativo/inativo e destaque na vitrine.
- Busca por nome, SKU e categoria.

Enquanto o Supabase não estiver configurado, o painel usa IndexedDB no próprio navegador. Os produtos e as imagens cadastrados nesse modo aparecem na vitrine aberta no mesmo navegador/origem. Esse modo é local: não sincroniza entre dispositivos, navegadores ou usuários e não deve ser usado como banco de produção.

Quando `assets/js/config.js` estiver configurado, o painel passa a usar as tabelas `products`, `categories`, `product_images` e `inventory`, além do bucket `product-images` no Storage. O usuário precisa estar autenticado e ter perfil administrativo ativo conforme as políticas RLS.


## Formulário de contato e mensagens

A página inicial possui a seção **Contato** com nome, e-mail, telefone, assunto e mensagem. O envio é encaminhado para a caixa **Relacionamento > Mensagens** no painel administrativo. Nela é possível filtrar por status, visualizar os dados, abrir uma resposta no cliente de e-mail, marcar como não lida/em atendimento/respondida/arquivada e excluir mensagens.

- Antes de configurar o Supabase, as mensagens ficam no IndexedDB do navegador e só aparecem no mesmo navegador/origem.
- Com o Supabase configurado, os envios são gravados em `public.contact_messages`.
- A migration `0003_contact_messages.sql` libera apenas INSERT público. Leitura, atualização e exclusão exigem usuário autenticado com perfil de equipe ativo (`public.is_staff()`).
- Para habilitar o modo Supabase, execute a migration 0003 depois da migration inicial e configure a sessão de administrador.

## Estado de implementação revisado

- Vitrine pública: catálogo conectado à view `storefront_products`; sacola persistente e checkout via Edge Function `create-checkout`, com validação de preço/estoque no servidor. Pagamentos dependem dos secrets e do deploy das funções.
- Login e sessão administrativa: Supabase Auth + `profiles` + RLS.
- Produtos e categorias: CRUD conectado ao Supabase; imagens usam o Storage `product-images`.
- Pedidos: consulta e atualização de status conectadas ao Supabase.
- Estoque: consulta e histórico conectados; movimentações dependem da RPC `manage_stock`, incluída na migration `0007_manage_stock.sql`.
- PDV e caixa: abertura/fechamento e finalização presencial usam RPCs transacionais das migrations `0004_pos_cash_register.sql`; a venda baixa estoque e grava pedido, itens, pagamento e movimento de caixa.
- Clientes, fornecedores, cupons, despesas, relatórios, usuários e configurações possuem telas e consultas/operações implementadas no frontend; valide as permissões e os cenários de negócio no ambiente Supabase antes de produção.
- Mensagens de contato: envio público e gerenciamento administrativo conectados ao Supabase.

## Checklist antes de produção

1. Aplicar todas as migrations ainda pendentes em ordem numérica, atualmente até `0021_advanced_operations.sql`.
2. Publicar as Edge Functions e cadastrar os secrets do Mercado Pago e o domínio HTTPS conforme a seção de checkout acima.
3. Validar RLS por perfil, políticas de Storage, concorrência de estoque, fechamento de caixa e permissões de cada papel.
4. Testar compra de ponta a ponta em ambiente de teste do Mercado Pago: Pix aprovado/pendente, cartão aprovado/recusado, webhook repetido, falha de gateway e cancelamento.
5. Configurar domínio/HTTPS, backups, monitoramento, política de privacidade e rotina de suporte a pagamentos pendentes/estornos.
6. Definir uma rotina de conciliação da maquininha para pagamentos presenciais e lançar as vendas de entrega no controle financeiro conforme a operação da loja.

O checkout e as funções estão preparados no código, mas não são ativados na conta remota até que todas as migrations necessárias sejam aplicadas, as Edge Functions sejam publicadas e os secrets reais sejam cadastrados. Não foi feita conexão administrativa nem execução remota no Supabase ou no Mercado Pago nesta entrega.

## Ajustes de integridade e navegação (versão 2026-11-22)

- A visão geral não contém pedidos, clientes, vendas ou indicadores de demonstração. Os indicadores são inicializados em zero e consultam os registros reais de `orders`, `products` e `inventory` após autenticação.
- A receita do dia considera apenas pedidos com status `completed`.
- Os módulos sem CRUD/operação implementados continuam identificados como não integrados; não exibem registros fictícios.
- Links de marca e retorno apontam explicitamente para `index.html`, evitando abrir listagem de diretório em servidor local.
- `vercel.json` define rotas amigáveis para `/admin` e `/admin/dashboard`.
- O login inclui visualização temporária da senha enquanto o botão do olho estiver pressionado.
- Font Awesome 6.7.2 foi padronizado nos ícones principais da loja, login e navegação administrativa.


## Melhorias técnicas incluídas (2026-11-27)

- A sacola da loja é persistida no `localStorage` por versão e recuperada após atualizar a página. O servidor continua sendo a fonte de verdade para preço, disponibilidade e estoque no checkout.
- Os módulos administrativos são carregados sob demanda com `import()`, evitando baixar todos os módulos de gestão na abertura do painel. A navegação ignora carregamentos antigos quando o usuário troca de tela rapidamente.
- As notificações administrativas criam elementos DOM e usam `textContent` para os dados de mensagens, evitando interpretar conteúdo enviado por visitantes como HTML executável.
- `vercel.json` adiciona cabeçalhos HTTP de segurança e políticas de cache distintas para arquivos estáticos e documentos HTML.
- CORS das Edge Functions deixa de aceitar qualquer origem. Configure o secret `CORS_ALLOWED_ORIGIN` com a origem HTTPS exata da loja (por exemplo, `https://mercadojesi.com.br`). Se não configurado, o código usa `SITE_URL`. Ambientes de homologação devem usar sua própria configuração de origem.

Esses ajustes são alterações de código. A aplicação dos secrets, publicação das Edge Functions, configuração do domínio e validação no projeto Supabase/Vercel continuam exigindo acesso aos respectivos painéis e testes no ambiente real.

## Executar localmente

Não abra `index.html` por duplo clique (`file://`). Abra a pasta no VS Code e use Live Server, ou rode `npx serve .`. Acesse a URL HTTP fornecida pelo servidor, normalmente `http://127.0.0.1:5500/`.

## Checkout, Mercado Pago e entrega própria (migration 0008)

A migration `0008_store_checkout_delivery.sql` adiciona o checkout público transacional, os metadados de pagamento, histórico de status, idempotência de webhooks e dados do entregador. A loja oferece Pix e cartão online pelo Checkout Pro do Mercado Pago, além de cartão na entrega. O estoque é reservado no momento da criação do pedido e liberado automaticamente se a criação da preferência falhar ou a equipe cancelar um pedido ainda não pago.

### Aplicar banco e publicar funções

1. Execute as migrations pendentes em ordem numérica, incluindo `0008_store_checkout_delivery.sql` e as atualizações posteriores até `0020_fix_checkout_order_notes.sql`.
2. Instale a Supabase CLI e vincule a pasta do projeto: `supabase link --project-ref flnbpysrsjlbnnsvhrpp`.
3. No Supabase Dashboard, abra **Edge Functions > Secrets** e configure:
   - `MERCADOPAGO_ACCESS_TOKEN`: Access Token da aplicação Mercado Pago (comece com credenciais de teste).
   - `MERCADOPAGO_WEBHOOK_SECRET`: assinatura secreta criada na configuração de Webhooks do Mercado Pago.
   - `SITE_URL`: URL HTTPS pública da loja, sem barra no final (ex.: `https://mercadojesi.com.br`).
   - `CORS_ALLOWED_ORIGIN`: a mesma origem HTTPS exata da loja, sem caminho ou barra final. Para homologação, configure a origem do ambiente de homologação.
4. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados pelo runtime das Edge Functions. Nunca copie a `service_role` para o navegador ou para `assets/js/config.js`.
5. Publique as funções:

```bash
supabase functions deploy create-checkout
supabase functions deploy mercadopago-webhook
supabase functions deploy manage-delivery
supabase functions deploy create-staff-user
supabase functions deploy delete-order-safely
```

O arquivo `supabase/config.toml` desativa a verificação JWT apenas para `create-checkout` (checkout público) e `mercadopago-webhook` (chamado pelo Mercado Pago). `manage-delivery` exige JWT e valida novamente o perfil/role da equipe antes de permitir alterações.

### Configurar Mercado Pago

1. Crie uma aplicação em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app) e obtenha o Access Token de teste.
2. Em **Webhooks / Configurar notificações**, cadastre a URL `https://SEU-PROJETO.supabase.co/functions/v1/mercadopago-webhook` e habilite o evento **Pagamentos** (`payment`).
3. Copie a assinatura secreta do webhook para `MERCADOPAGO_WEBHOOK_SECRET` nos Secrets do Supabase.
4. Faça uma compra de teste com as credenciais de teste. Só depois de validar aprovação, pendência, rejeição e retorno ao site troque para credenciais produtivas.
5. O Checkout Pro retorna ao domínio definido em `SITE_URL`. A preferência filtra Pix (`bank_transfer`) ou cartão de crédito (`credit_card`) conforme a escolha; o Mercado Pago pode manter dinheiro em conta disponível por regra da plataforma. Pix e cartão são processados no ambiente do Mercado Pago; a confirmação real vem do webhook, não da página de retorno.

Referências oficiais: [Checkout Pro / Preferências](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/overview), [Webhooks de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications) e [Secrets das Edge Functions](https://supabase.com/docs/guides/functions/secrets).

### Entrega própria e operação

- A taxa e o mínimo para frete grátis vêm de **Configurações da loja** (`store_settings.delivery_fee` e `free_delivery_minimum`).
- A equipe gerencia o status do pedido na área **Pedidos**, atribui entregador, telefone e instruções de entrega.
- Para pedidos com cartão na entrega, a equipe precisa registrar o recebimento antes de marcar o pedido como concluído.
- Pedidos com pagamento online não podem avançar para preparação/entrega antes da confirmação do Mercado Pago.
- O cancelamento de pedido não pago devolve o estoque reservado. Pedidos pagos exigem estorno antes do cancelamento.

### Limites e pendências operacionais

- O projeto precisa de domínio HTTPS público para receber webhooks e concluir o fluxo real. `localhost` serve apenas para desenvolvimento de interface.
- O código não inclui credenciais Mercado Pago; elas devem ser fornecidas pelo proprietário da conta no painel do Supabase.
- A taxa de entrega é fixa por configuração (com opção de frete grátis por valor mínimo); cálculo por bairro/CEP, mapa em tempo real, notificações WhatsApp/SMS e portal público de rastreamento não estão incluídos nesta etapa.
- A marcação de cartão recebido na entrega atualiza o pagamento no pedido. A conciliação com maquininha/adquirente e o lançamento automático no caixa precisam ser definidos conforme o processo financeiro da loja.
- Antes de produção, teste estoque concorrente, cupons, falhas de gateway, webhook repetido, cancelamento e permissões de cada perfil.


## Exclusão e arquivamento de pedidos

A migration `0017_order_safe_archive.sql` adiciona a RPC
`archive_order_preserving_financial_history(uuid)`. Aplique as migrations pendentes
no Supabase antes de publicar a atualização do painel.

Na tela Pedidos:
- Pedidos sem pagamentos e sem movimentações vinculadas exibem **Excluir**.
- Pedidos com pagamentos ou movimentações de caixa exibem **Arquivar**.
- Arquivar atualiza `orders.archived_at` e preserva integralmente pagamentos,
  referências do provedor e movimentações financeiras.
- A exclusão definitiva continua protegida pela RPC
  `delete_order_without_financial_history(uuid)`.

Atenção: arquivar um pedido não cancela uma cobrança ainda pendente no Mercado Pago.
A situação da cobrança deve continuar sendo acompanhada pelo webhook/provedor.


## Pedidos arquivados e restauração

A área **Pedidos** possui as visualizações **Pedidos ativos** e **Pedidos arquivados**.
Pedidos arquivados podem ser restaurados para a lista ativa. A exclusão definitiva
continua protegida pela função `delete_order_without_financial_history`: o banco
rejeita a exclusão se houver qualquer registro em `payments` ou `cash_transactions`,
independentemente do que a interface exibir.

Para habilitar a restauração, execute no SQL Editor do Supabase o conteúdo de:

`supabase/migrations/0018_order_restore.sql`

A função exige `public.is_staff()` e não altera registros financeiros.

## Atualizações funcionais — 2026-11-27

### Checkout
- A sacola persiste no `localStorage` e é normalizada ao recuperar os dados. O servidor continua sendo a fonte de verdade para preço e estoque.
- O checkout envia o código de cupom à Edge Function `create-checkout`; a validação e o cálculo permanecem no banco/servidor.
- O CEP pode preencher rua, bairro, cidade e UF pela API pública ViaCEP. A consulta é auxiliar; o cliente deve conferir o endereço antes de enviar.

### Operações avançadas (migration 0021)
A navegação administrativa ganhou **Operações avançadas**, com:
- **Compras:** pedido de compra vinculado a fornecedor e produtos. O recebimento usa a RPC `receive_purchase_order` para atualizar estoque, custo médio, movimentação e lote em transação.
- **Validade e lotes:** consulta de lotes, saldos e alertas para vencidos/próximos do vencimento. Saídas de estoque por venda/perda consomem os lotes rastreados em FIFO; saldo legado sem lote não bloqueia vendas.
- **Separação Kanban:** quadro de pedidos por etapa, alteração de status e atualização via Supabase Realtime. O link do WhatsApp abre conversa no aplicativo/site, não envia mensagens automaticamente.
- **Código de barras:** pesquisa por leitor USB/digitação e leitura por câmera quando `BarcodeDetector` está disponível e o site usa HTTPS.
- **Etiquetas:** montagem de folhas e impressão pelo navegador; códigos EAN-13 com dígito verificador válido são renderizados como barras.
- **Fidelidade:** crédito automático de 1 ponto a cada R$ 10,00 em pedido concluído vinculado a cliente. O trigger evita creditar o mesmo pedido duas vezes. O resgate de pontos ainda não está habilitado.

### PWA
- Manifesto instalável e service worker para cache do shell estático.
- APIs externas (Supabase, gateway de pagamento e ViaCEP) não são armazenadas pelo service worker.
- O cache offline não permite finalizar pedidos sem conexão.

### Implantação da migration 0021
1. Faça backup do banco remoto.
2. Confira se as migrations `0001` a `0020` já foram aplicadas. Não reaplique migrations existentes.
3. Execute `supabase/migrations/0021_advanced_operations.sql` no SQL Editor do Supabase ou pelo fluxo de migrations do Supabase CLI.
4. Confira a função `receive_purchase_order`, as políticas RLS e o trigger de pontos em ambiente de homologação.
5. Habilite Realtime para `public.orders` (a migration tenta incluir a tabela na publicação, se a publicação existir e ainda não contiver a tabela).
6. Teste compra, recebimento, baixa FIFO, atualização de pedido, pontos e permissões com usuários de cada perfil.

### Limitações que exigem configuração ou decisão operacional
- WhatsApp: apenas link `wa.me`; envio automatizado exige WhatsApp Business Platform, credenciais e webhook.
- Pagamentos: exigem credenciais reais/teste do Mercado Pago, secrets e deploy das Edge Functions.
- Fidelidade: regra inicial de pontos está fixa em 1 ponto/R$ 10 e não há resgate/troca no checkout.
- Etiquetas: o navegador imprime em folha; o alinhamento deve ser ajustado ao modelo físico de etiqueta.
- Leitura por câmera depende do navegador/dispositivo; leitor USB continua disponível como teclado.
- O rastreamento público é feito pela página `rastreamento.html`, exigindo número do pedido, telefone e código aleatório de rastreamento. A consulta usa a RPC `get_public_order_tracking`.
- Não foi feita publicação remota no Supabase/Vercel nem teste de pagamento real nesta execução.


## Notificações automáticas de rastreamento

A migration `0023_order_tracking_notifications.sql` cria a fila de e-mails. Ao criar um pedido ou alterar seu status, o banco registra notificações de e-mail (quando o cadastro do cliente possui e-mail). As Edge Functions `process-email-queue` e `process-whatsapp-queue` enviam as notificações usando credenciais mantidas somente nos Secrets do Supabase.

### Configuração necessária no Supabase

1. Execute as migrations pendentes, incluindo `0023_order_tracking_notifications.sql`.
2. Configure os Secrets `SITE_URL` e `CORS_ALLOWED_ORIGIN` com o domínio HTTPS real da loja.
3. Para e-mail, crie/verifique o domínio ou remetente no Resend e configure `RESEND_API_KEY` e `EMAIL_FROM`.
4. Para WhatsApp, configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_TEMPLATE_NAME`.
5. No WhatsApp Manager da Meta, crie e obtenha aprovação do template `order_tracking` (idioma `pt_BR`) com cinco variáveis no corpo, nesta ordem: nome do cliente, texto do evento, número do pedido, código de rastreamento e link da página de rastreamento.
6. Faça deploy das Edge Functions `create-checkout`, `mercadopago-webhook`, `process-email-queue` e `process-whatsapp-queue`.

O e-mail do checkout continua opcional: o cliente só recebe e-mail se preencher esse campo. O WhatsApp é enviado ao telefone informado, mas depende de uma conta WhatsApp Business Platform ativa e de template aprovado pela Meta. O código também aparece na confirmação do pedido no navegador; no retorno do Mercado Pago ele é recuperado do armazenamento local do mesmo navegador/dispositivo.

As credenciais nunca devem ser colocadas em arquivos públicos, no frontend ou commitadas no Git.


## Rastreamento do cliente pelo código e mapa GPS

A migração `supabase/migrations/0026_public_customer_live_tracking.sql` habilita a consulta pública segura pelo código secreto gerado no pedido e retorna a última posição GPS somente enquanto a entrega estiver ativa. Aplique essa migração no SQL Editor do Supabase depois das migrações anteriores. O cliente informa apenas o código em `rastreamento.html`; a tela atualiza automaticamente a cada 15 segundos e exibe o mapa OpenStreetMap quando o entregador iniciar a entrega e compartilhar o GPS. O checkout deixa de acionar a fila de WhatsApp; o código continua aparecendo na confirmação da compra.
