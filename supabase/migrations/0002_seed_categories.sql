-- Categorias iniciais do Mercado Jesi. Seguro executar mais de uma vez.
insert into public.categories (name,slug,sort_order) values
('Mercearia','mercearia',1),
('Bebidas','bebidas',2),
('Hortifruti','hortifruti',3),
('Açougue e frios','acougue-e-frios',4),
('Padaria','padaria',5),
('Laticínios','laticinios',6),
('Congelados','congelados',7),
('Limpeza','limpeza',8),
('Higiene pessoal','higiene-pessoal',9),
('Pet shop','pet-shop',10),
('Doces e snacks','doces-e-snacks',11),
('Utilidades domésticas','utilidades-domesticas',12)
on conflict (slug) do nothing;
