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
  assert.match(sw,/CACHE_VERSION = 'mercado-jesi-shell-v2'/);
  assert.match(sw,/fetch\(request, \{ cache: 'no-store' \}\)/);
});

test('login administrativo impede submissões simultâneas',()=>{
  const login=read('assets/js/admin-login.js');
  assert.match(login,/if \(isSubmitting\) return/);
  assert.match(login,/window\.location\.replace\("\/admin\/dashboard"\)/);
});
