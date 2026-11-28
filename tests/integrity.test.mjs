import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('arquivos JS do painel possuem sintaxe válida',()=>{
  for(const file of fs.readdirSync(path.join(root,'assets/js')).filter(f=>f.endsWith('.js'))){
    execFileSync(process.execPath,['--check',path.join(root,'assets/js',file)],{stdio:'pipe'});
  }
});

test('migration 0022 contém os módulos críticos',()=>{
  const sql=read('supabase/migrations/0022_finance_loyalty_tracking_whatsapp.sql');
  for(const needle of ['financial_entries','financial_reconciliations','loyalty_redemptions','redeem_loyalty_points','get_public_order_tracking','whatsapp_notifications','get_profitability_report']) assert.match(sql,new RegExp(needle));
});

test('checkout e rastreamento estão conectados',()=>{
  const checkout=read('supabase/functions/create-checkout/index.ts');
  const tracking=read('assets/js/tracking.js');
  assert.match(checkout,/tracking_code/);
  assert.match(tracking,/get_public_order_tracking/);
});

test('processador WhatsApp não expõe token no frontend',()=>{
  const fn=read('supabase/functions/process-whatsapp-queue/index.ts');
  assert.match(fn,/WHATSAPP_ACCESS_TOKEN/);
  assert.doesNotMatch(read('assets/js/app.js'),/WHATSAPP_ACCESS_TOKEN/);
});


test('service worker não intercepta o painel administrativo',()=>{
  const sw=read('sw.js');
  assert.match(sw,/url\.pathname\.startsWith\('\/admin\/'\)/);
  assert.match(sw,/CACHE_VERSION = 'mercado-jesi-shell-v3'/);
  assert.match(sw,/fetch\(request, \{ cache: 'no-store' \}\)/);
});

test('login administrativo impede submissões simultâneas',()=>{
  const login=read('assets/js/admin-login.js');
  assert.match(login,/if \(isSubmitting\) return/);
  assert.match(login,/window\.location\.replace\("\/admin\/dashboard"\)/);
});


test('rastreamento do cliente usa código e GPS no mapa sem depender da fila WhatsApp',()=>{
  const migration=read('supabase/migrations/0023_order_tracking_notifications.sql');
  const emailFn=read('supabase/functions/process-email-queue/index.ts');
  const whatsappFn=read('supabase/functions/process-whatsapp-queue/index.ts');
  const checkout=read('supabase/functions/create-checkout/index.ts');
  assert.match(migration,/create table if not exists public\.email_notifications/);
  assert.match(migration,/after insert or update of status on public\.orders/);
  assert.match(emailFn,/RESEND_API_KEY/);
  assert.match(emailFn,/tracking_code/);
  assert.match(whatsappFn,/WHATSAPP_TEMPLATE_NAME/);
  assert.match(whatsappFn,/tracking_code/);
  assert.match(checkout,/process-email-queue/);
  assert.doesNotMatch(checkout,/process-whatsapp-queue/);
  assert.match(read('supabase/migrations/0026_public_customer_live_tracking.sql'),/get_public_order_tracking_by_code/);
  assert.match(read('assets/js/tracking.js'),/get_public_order_tracking_by_code/);
  assert.match(read('assets/js/tracking.js'),/openstreetmap\.org/);
});

test('checkout mostra código de rastreamento ao cliente',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/showTrackingReceipt/);
  assert.match(app,/mercado_jesi_tracking/);
  assert.match(app,/Copiar código/);
  assert.match(read('assets/js/tracking.js'),/mercado_jesi_tracking/);
});
