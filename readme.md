# Mercado Jesi

Loja virtual e sistema de gestão para mercearia, com frontend HTML/CSS/JavaScript e Supabase.

## Requisitos

- Projeto Supabase
- Navegador moderno
- Servidor HTTP local (não abra os módulos ES diretamente via `file://`)

## Começar

1. Crie um projeto em https://supabase.com/dashboard.
2. No SQL Editor, execute `supabase/migrations/0001_initial_schema.sql`.
3. Execute, em ordem, todas as migrations `0002_seed_categories.sql` até `0007_manage_stock.sql`. Elas criam categorias, mensagens, PDV/caixa, configurações, perfis de equipe e a função transacional de movimentação de estoque.
4. Em Project Settings > API, copie a Project URL e a chave publishable (ou anon).
5. Preencha `assets/js/config.js`.
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

- Vitrine pública: catálogo conectado à view `storefront_products`; sacola funciona no navegador, mas o checkout público ainda não cria pedidos nem recebe pagamentos.
- Login e sessão administrativa: Supabase Auth + `profiles` + RLS.
- Produtos e categorias: CRUD conectado ao Supabase; imagens usam o Storage `product-images`.
- Pedidos: consulta e atualização de status conectadas ao Supabase.
- Estoque: consulta e histórico conectados; movimentações dependem da RPC `manage_stock`, incluída na migration `0007_manage_stock.sql`.
- PDV e caixa: abertura/fechamento e finalização presencial usam RPCs transacionais das migrations `0004_pos_cash_register.sql`; a venda baixa estoque e grava pedido, itens, pagamento e movimento de caixa.
- Clientes, fornecedores, cupons, despesas, relatórios, usuários e configurações possuem telas e consultas/operações implementadas no frontend; valide as permissões e os cenários de negócio no ambiente Supabase antes de produção.
- Mensagens de contato: envio público e gerenciamento administrativo conectados ao Supabase.

## Checklist antes de produção

1. Aplicar todas as migrations em ordem, incluindo `0007_manage_stock.sql` e `0008_store_checkout_delivery.sql`.
2. Publicar as Edge Functions e cadastrar os secrets do Mercado Pago e o domínio HTTPS conforme a seção de checkout acima.
3. Validar RLS por perfil, políticas de Storage, concorrência de estoque, fechamento de caixa e permissões de cada papel.
4. Testar compra de ponta a ponta em ambiente de teste do Mercado Pago: Pix aprovado/pendente, cartão aprovado/recusado, webhook repetido, falha de gateway e cancelamento.
5. Configurar domínio/HTTPS, backups, monitoramento, política de privacidade e rotina de suporte a pagamentos pendentes/estornos.
6. Definir uma rotina de conciliação da maquininha para pagamentos presenciais e lançar as vendas de entrega no controle financeiro conforme a operação da loja.

O checkout e as funções estão preparados no código, mas não são ativados na conta remota até que a migration 0008 seja aplicada, as Edge Functions sejam publicadas e os secrets reais sejam cadastrados. Não foi feita conexão administrativa nem execução remota no Supabase ou no Mercado Pago nesta entrega.

## Ajustes de integridade e navegação (versão 2026-11-22)

- A visão geral não contém pedidos, clientes, vendas ou indicadores de demonstração. Os indicadores são inicializados em zero e consultam os registros reais de `orders`, `products` e `inventory` após autenticação.
- A receita do dia considera apenas pedidos com status `completed`.
- Os módulos sem CRUD/operação implementados continuam identificados como não integrados; não exibem registros fictícios.
- Links de marca e retorno apontam explicitamente para `index.html`, evitando abrir listagem de diretório em servidor local.
- `vercel.json` define rotas amigáveis para `/admin` e `/admin/dashboard`.
- O login inclui visualização temporária da senha enquanto o botão do olho estiver pressionado.
- Font Awesome 6.7.2 foi padronizado nos ícones principais da loja, login e navegação administrativa.

## Executar localmente

Não abra `index.html` por duplo clique (`file://`). Abra a pasta no VS Code e use Live Server, ou rode `npx serve .`. Acesse a URL HTTP fornecida pelo servidor, normalmente `http://127.0.0.1:5500/`.

## Checkout, Mercado Pago e entrega própria (migration 0008)

A migration `0008_store_checkout_delivery.sql` adiciona o checkout público transacional, os metadados de pagamento, histórico de status, idempotência de webhooks e dados do entregador. A loja oferece Pix e cartão online pelo Checkout Pro do Mercado Pago, além de cartão na entrega. O estoque é reservado no momento da criação do pedido e liberado automaticamente se a criação da preferência falhar ou a equipe cancelar um pedido ainda não pago.

### Aplicar banco e publicar funções

1. Execute `supabase/migrations/0008_store_checkout_delivery.sql` no SQL Editor do projeto, depois das migrations 0001–0007.
2. Instale a Supabase CLI e vincule a pasta do projeto: `supabase link --project-ref flnbpysrsjlbnnsvhrpp`.
3. No Supabase Dashboard, abra **Edge Functions > Secrets** e configure:
   - `MERCADOPAGO_ACCESS_TOKEN`: Access Token da aplicação Mercado Pago (comece com credenciais de teste).
   - `MERCADOPAGO_WEBHOOK_SECRET`: assinatura secreta criada na configuração de Webhooks do Mercado Pago.
   - `SITE_URL`: URL HTTPS pública da loja, sem barra no final (ex.: `https://mercadojesi.com.br`).
4. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados pelo runtime das Edge Functions. Nunca copie a `service_role` para o navegador ou para `assets/js/config.js`.
5. Publique as funções:

```bash
supabase functions deploy create-checkout
supabase functions deploy mercadopago-webhook
supabase functions deploy manage-delivery
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
