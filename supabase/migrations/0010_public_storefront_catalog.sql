-- Permite que visitantes consultem somente os campos públicos do catálogo.
-- A view storefront_products já filtra produtos ativos e não expõe estoque bruto.
grant usage on schema public to anon, authenticated;
grant select on table public.storefront_products to anon, authenticated;

comment on view public.storefront_products is
  'Catálogo público: somente produtos ativos e campos necessários à vitrine.';
