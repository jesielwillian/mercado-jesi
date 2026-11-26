SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict beUFex5gOhlstAMawb40JQUhc0rdPFP5D03Wrk0JnD6Q6TL13NJsFzO5g6lGfik

-- Dumped from database version 17.12
-- Dumped by pg_dump version 17.12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', 'authenticated', 'authenticated', 'jesielwillianvieira1989@gmail.com', '$2a$10$AZXHjh3T8017sWkq9N/vKe9Hs/cqwg8911p7UlxOXO6p7rpWr5YTG', '2026-11-22 23:35:01.738825+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-11-23 07:52:51.368816+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-11-22 23:35:01.71478+00', '2026-11-23 09:51:04.817647+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('c2d05d9a-9302-4f88-9e7f-af71403bea5f', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '{"sub": "c2d05d9a-9302-4f88-9e7f-af71403bea5f", "email": "jesielwillianvieira1989@gmail.com", "email_verified": false, "phone_verified": false}', 'email', '2026-11-22 23:35:01.726147+00', '2026-11-22 23:35:01.726232+00', '2026-11-22 23:35:01.726232+00', '006a18c3-2364-4e7d-b34d-693137456d16');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('9560107f-4b82-4d95-9034-2fbf274712d2', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 05:02:12.026003+00', '2026-11-23 05:02:12.026003+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('f8734a04-d7b3-4835-aa96-28678c083679', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 05:19:10.520483+00', '2026-11-23 05:19:10.520483+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('40cb0b64-18f6-45cc-9459-7795b7ffec0c', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 05:22:18.826989+00', '2026-11-23 05:22:18.826989+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('b98d702e-d466-4561-ab1b-850176a8fa78', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 05:46:45.447429+00', '2026-11-23 05:46:45.447429+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('5e15e71a-4e19-43b4-9de3-ecf709b618ef', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 06:18:25.922779+00', '2026-11-23 06:18:25.922779+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('9bd2e2b9-eee7-455f-92a1-8781a517a777', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 06:23:23.007704+00', '2026-11-23 06:23:23.007704+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('f63b2c9e-717a-464e-bbbd-dde897d667da', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 06:41:30.029787+00', '2026-11-23 06:41:30.029787+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('39a14a41-dfee-4089-8aae-59ac1a4f720c', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 07:08:27.169627+00', '2026-11-23 07:08:27.169627+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('4ad50be1-c790-4501-b047-acd04bdc641b', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 07:19:14.822403+00', '2026-11-23 07:19:14.822403+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('2b94135d-55a4-45e2-8b24-c9567f246874', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 07:41:38.977674+00', '2026-11-23 07:41:38.977674+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL),
	('27d0c96b-9a87-46c0-bd04-ba4683dea477', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', '2026-11-23 07:52:51.368937+00', '2026-11-23 09:51:04.830565+00', NULL, 'aal1', NULL, '2026-11-23 09:51:04.830459', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', '187.33.206.217', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('9560107f-4b82-4d95-9034-2fbf274712d2', '2026-11-23 05:02:12.070686+00', '2026-11-23 05:02:12.070686+00', 'password', 'a474354f-a6a3-4a5a-a82a-7a26dab27032'),
	('f8734a04-d7b3-4835-aa96-28678c083679', '2026-11-23 05:19:10.559363+00', '2026-11-23 05:19:10.559363+00', 'password', '6d645682-8a26-47a5-b6c1-d83fb3d3995e'),
	('40cb0b64-18f6-45cc-9459-7795b7ffec0c', '2026-11-23 05:22:18.852577+00', '2026-11-23 05:22:18.852577+00', 'password', 'c2fc59c5-b5d5-41d8-bd58-6da62657945d'),
	('b98d702e-d466-4561-ab1b-850176a8fa78', '2026-11-23 05:46:45.502598+00', '2026-11-23 05:46:45.502598+00', 'password', 'c2d5f7c9-51d8-4730-8057-6488b85eeea0'),
	('5e15e71a-4e19-43b4-9de3-ecf709b618ef', '2026-11-23 06:18:25.974306+00', '2026-11-23 06:18:25.974306+00', 'password', '735dce81-f4c1-4b23-8282-295eabcbfbf4'),
	('9bd2e2b9-eee7-455f-92a1-8781a517a777', '2026-11-23 06:23:23.032368+00', '2026-11-23 06:23:23.032368+00', 'password', '80e4e844-ffba-4dae-b65b-f7f32336ae8e'),
	('f63b2c9e-717a-464e-bbbd-dde897d667da', '2026-11-23 06:41:30.055664+00', '2026-11-23 06:41:30.055664+00', 'password', '915c59e1-9182-454b-a397-1c2814dbc2d7'),
	('39a14a41-dfee-4089-8aae-59ac1a4f720c', '2026-11-23 07:08:27.237847+00', '2026-11-23 07:08:27.237847+00', 'password', '788fbad6-1499-49ca-96a7-e7fb57f4b07d'),
	('4ad50be1-c790-4501-b047-acd04bdc641b', '2026-11-23 07:19:14.832204+00', '2026-11-23 07:19:14.832204+00', 'password', '63fc563d-8822-4481-9d5e-081e0397598c'),
	('2b94135d-55a4-45e2-8b24-c9567f246874', '2026-11-23 07:41:39.042797+00', '2026-11-23 07:41:39.042797+00', 'password', 'd371a2c7-3e1d-4913-ae91-b30ad1f1c5ab'),
	('27d0c96b-9a87-46c0-bd04-ba4683dea477', '2026-11-23 07:52:51.383204+00', '2026-11-23 07:52:51.383204+00', 'password', 'd26fb299-6e63-47b7-aaab-7fbbad6b62ba');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_code_sets; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_recovery_codes; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 55, '4skfpi2rbsaj', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 05:02:12.052548+00', '2026-11-23 05:02:12.052548+00', NULL, '9560107f-4b82-4d95-9034-2fbf274712d2'),
	('00000000-0000-0000-0000-000000000000', 56, 'p6jyj67eqb5f', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 05:19:10.544503+00', '2026-11-23 05:19:10.544503+00', NULL, 'f8734a04-d7b3-4835-aa96-28678c083679'),
	('00000000-0000-0000-0000-000000000000', 57, 'ceudzkglhjd3', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 05:22:18.842953+00', '2026-11-23 05:22:18.842953+00', NULL, '40cb0b64-18f6-45cc-9459-7795b7ffec0c'),
	('00000000-0000-0000-0000-000000000000', 58, 'tfdg5dwyfpbx', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 05:46:45.481934+00', '2026-11-23 05:46:45.481934+00', NULL, 'b98d702e-d466-4561-ab1b-850176a8fa78'),
	('00000000-0000-0000-0000-000000000000', 59, 'zqfkfs7lkwwz', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 06:18:25.953178+00', '2026-11-23 06:18:25.953178+00', NULL, '5e15e71a-4e19-43b4-9de3-ecf709b618ef'),
	('00000000-0000-0000-0000-000000000000', 60, 'kjwjgm35nbbi', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 06:23:23.023371+00', '2026-11-23 06:23:23.023371+00', NULL, '9bd2e2b9-eee7-455f-92a1-8781a517a777'),
	('00000000-0000-0000-0000-000000000000', 61, 'avipqdtcxqhc', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 06:41:30.047778+00', '2026-11-23 06:41:30.047778+00', NULL, 'f63b2c9e-717a-464e-bbbd-dde897d667da'),
	('00000000-0000-0000-0000-000000000000', 62, '4xg6cxcgd6ut', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 07:08:27.200661+00', '2026-11-23 07:08:27.200661+00', NULL, '39a14a41-dfee-4089-8aae-59ac1a4f720c'),
	('00000000-0000-0000-0000-000000000000', 63, 'wnmxwnlexafj', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 07:19:14.827762+00', '2026-11-23 07:19:14.827762+00', NULL, '4ad50be1-c790-4501-b047-acd04bdc641b'),
	('00000000-0000-0000-0000-000000000000', 64, '4eb6ctaik5kd', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 07:41:39.017694+00', '2026-11-23 07:41:39.017694+00', NULL, '2b94135d-55a4-45e2-8b24-c9567f246874'),
	('00000000-0000-0000-0000-000000000000', 65, 'c4rxkwmixngd', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', true, '2026-11-23 07:52:51.377315+00', '2026-11-23 08:51:50.160282+00', NULL, '27d0c96b-9a87-46c0-bd04-ba4683dea477'),
	('00000000-0000-0000-0000-000000000000', 66, 'we5o276qqkch', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', true, '2026-11-23 08:51:50.171912+00', '2026-11-23 09:51:04.800076+00', 'c4rxkwmixngd', '27d0c96b-9a87-46c0-bd04-ba4683dea477'),
	('00000000-0000-0000-0000-000000000000', 67, 'utwunpyketft', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', false, '2026-11-23 09:51:04.810742+00', '2026-11-23 09:51:04.810742+00', 'we5o276qqkch', '27d0c96b-9a87-46c0-bd04-ba4683dea477');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: scim_users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "role", "active", "created_at", "full_name", "phone", "updated_at") VALUES
	('c2d05d9a-9302-4f88-9e7f-af71403bea5f', 'owner', true, '2026-11-23 01:14:10.197777+00', '', NULL, '2026-11-23 01:47:24.817253+00');


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: cash_registers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."cash_registers" ("id", "opened_by", "closed_by", "opening_amount", "closing_amount", "status", "opened_at", "closed_at") VALUES
	('e7bb1f8a-4390-4645-9e7c-80e17f7fe003', 'c2d05d9a-9302-4f88-9e7f-af71403bea5f', NULL, 0.00, NULL, 'open', '2026-11-23 04:55:38.773214+00', NULL);


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: cash_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: checkout_rate_limits; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contact_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: order_status_history; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: payment_webhook_events; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: store_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."store_settings" ("id", "store_name", "document", "email", "phone", "whatsapp", "address", "opening_hours", "delivery_fee", "free_delivery_minimum", "pickup_enabled", "delivery_enabled", "updated_at", "updated_by") VALUES
	(true, 'Mercado Jesi', NULL, NULL, NULL, NULL, NULL, NULL, 0.00, 0.00, true, true, '2026-11-23 04:00:14.457192+00', NULL);


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type", "versioning_status", "lifecycle_configuration", "lifecycle_configuration_generation") VALUES
	('product-images', 'product-images', NULL, '2026-11-23 01:53:37.647362+00', '2026-11-23 01:53:37.647362+00', true, false, 5242880, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD', 'DISABLED', NULL, NULL);


--
-- Data for Name: bucket_lifecycle_states; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: lifecycle_abandoned_artifacts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 67, true);


--
-- Name: orders_order_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."orders_order_number_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict beUFex5gOhlstAMawb40JQUhc0rdPFP5D03Wrk0JnD6Q6TL13NJsFzO5g6lGfik

RESET ALL;
