import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
const URL=Deno.env.get("SUPABASE_URL")!;const SERVICE= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN")||"";const PHONE_ID=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")||"";
const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
const normalize=(v:string)=>v.replace(/\D/g,"");
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});if(req.method!=='POST')return json({error:'Método não permitido.'},405);if(!TOKEN||!PHONE_ID)return json({error:'WhatsApp Business ainda não configurado.'},503);
 try{const {data:rows,error}=await db.from('whatsapp_notifications').select('*').eq('status','pending').lt('attempts',5).order('created_at',{ascending:true}).limit(20);if(error)throw error;let sent=0,failed=0;
 for(const row of rows||[]){const phone=normalize(row.phone);if(phone.length<10){await db.from('whatsapp_notifications').update({status:'failed',attempts:row.attempts+1,last_error:'Telefone inválido'}).eq('id',row.id);failed++;continue;}
  const response=await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'text',text:{preview_url:false,body:row.message}})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){await db.from('whatsapp_notifications').update({status:row.attempts+1>=5?'failed':'pending',attempts:row.attempts+1,last_error:String(body?.error?.message||`HTTP ${response.status}`)}).eq('id',row.id);failed++;continue;}
  await db.from('whatsapp_notifications').update({status:'sent',attempts:row.attempts+1,sent_at:new Date().toISOString(),provider_message_id:body?.messages?.[0]?.id||null,last_error:null}).eq('id',row.id);sent++;
 }
 return json({ok:true,processed:(rows||[]).length,sent,failed});}catch(error){console.error(error);return json({error:error instanceof Error?error.message:'Falha ao processar WhatsApp.'},500);}});
