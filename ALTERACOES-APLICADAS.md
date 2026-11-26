# Alterações aplicadas nesta versão

- Indicadores do painel protegidos contra elementos HTML ausentes.
- Consultas de indicadores tratadas individualmente para que uma falha não impeça a atualização dos demais.
- Faturamento diário calculado somente com pagamentos `paid` que possuem `paid_at`.
- Contagem e listagem do painel consideram pedidos não excluídos (`deleted_at IS NULL`).
- Indicador de estoque mostra a soma das unidades disponíveis, em vez de contar produtos abaixo do mínimo.
- Aba Pedidos separa pedidos ativos, arquivados e excluídos; os indicadores resumidos consideram somente pedidos ativos.

## Pendência externa

A confirmação automática de pagamentos depende da configuração e da entrega do webhook do Mercado Pago no Supabase. Esta cópia não altera credenciais ou configurações externas e, portanto, não declara o webhook corrigido.

## Conteúdo omitido por segurança e tamanho

O pacote não inclui `node_modules`, `.git`, `supabase/.temp` nem `supabase-data-backup.sql` (backup com dados de usuários/clientes). O schema e as migrations de código permanecem incluídos.
