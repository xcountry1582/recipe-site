'use strict';

let refreshPromise=null;
let config,token=sessionStorage.getItem('recipe_admin_token'),jobs=[],cursor=null,current=null,listRequest=0;

const el=id=>document.getElementById(id);

const notice=(text,error=false)=>{el('message').textContent=text;el('message').classList.toggle('error',error);const inside=el('review-message');if(inside){inside.textContent=text;inside.classList.toggle('error',error);}};

const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function safeLink(node,url){try{const u=new URL(url);if(u.protocol==='https:'){node.href=u.href;node.hidden=false;return;}}catch{}node.removeAttribute('href');node.hidden=true;}

async function login(provider){const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));const state=random(),verifier=random();sessionStorage.setItem('recipe_admin_oauth',JSON.stringify({state,verifier,created:Date.now()}));const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));const p=new URLSearchParams({response_type:'code',client_id:config.ClientId,redirect_uri:config.callbackUrl,scope:'openid email profile',state,code_challenge:challenge,code_challenge_method:'S256'});if(provider==='Google'){p.set('identity_provider','Google');p.set('prompt','select_account');}location.assign(config.LoginDomain+'/oauth2/authorize?'+p);}

function gate(){el('desk').hidden=true;el('gate').hidden=false;el('logout').hidden=true;sessionStorage.removeItem('recipe_admin_token');sessionStorage.removeItem('recipe_admin_refresh');token=null;document.getElementById('review-dialog').close();}

async function refreshSession(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{const refresh=sessionStorage.getItem('recipe_admin_refresh');if(!refresh)return false;
 const response=await fetch(config.LoginDomain+'/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:config.ClientId,refresh_token:refresh})});
 if(!response.ok)return false;const data=await response.json();if(!data.access_token)return false;
 token=data.access_token;sessionStorage.setItem('recipe_admin_token',token);if(data.refresh_token)sessionStorage.setItem('recipe_admin_refresh',data.refresh_token);return true;
 })().finally(()=>refreshPromise=null);return refreshPromise;
}
async function api(path,method='GET',body){
 const send=()=>fetch(config.ApiUrl+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 let response=await send();if(response.status===401&&await refreshSession())response=await send();
 let data={};try{data=await response.json();}catch{}
 if(response.status===401){stashDraft();gate();throw Error('Your session expired. Your review is saved in this tab. Sign in again to continue.');}
 if(!response.ok)throw Error(data.error||'Request failed. Please retry.');return data;
}
function stashDraft(){if(!current||!el('form'))return;const fields={};for(const id of ['title','ingredients','steps','recipe-notes','recipe-url'])fields[id]=el(id).value;fields.reviewed=el('reviewed').checked;if(JSON.stringify(fields)===current.baseFields){const old=JSON.parse(sessionStorage.getItem('recipe_admin_draft')||'null');if(old?.id===current.job.id)sessionStorage.removeItem('recipe_admin_draft');return;}sessionStorage.setItem('recipe_admin_draft',JSON.stringify({id:current.job.id,revision:current.review_revision,fields}));}
function restoreDraft(){const saved=JSON.parse(sessionStorage.getItem('recipe_admin_draft')||'null');if(!saved||saved.id!==current.job.id)return;if(saved.revision!==current.review_revision){notice('A newer review was saved. Your earlier text remains saved in this tab; do not overwrite the newer version.',true);return;}for(const [id,value]of Object.entries(saved.fields)){if(id==='reviewed')el(id).checked=value;else el(id).value=value;}notice('Restored your unsaved review from this tab.');}

function renderList(){const query=el('search').value.toLowerCase();el('list').replaceChildren();for(const row of jobs){if(query&&!String(row.title).toLowerCase().includes(query))continue;const button=document.createElement('button');button.className='job'+(current?.job.id===row.id?' active':'');const title=document.createElement('strong');title.textContent=String(row.title||'Untitled').slice(0,150);const status=document.createElement('small');status.textContent=row.status.replaceAll('_',' ');const image=document.createElement('img');image.alt='';image.loading='lazy';if(row.thumbnail){image.src=row.thumbnail;image.onerror=()=>image.hidden=true;}else image.hidden=true;const photo=document.createElement('span');photo.className='tile-photo';photo.textContent='Recipe review';photo.append(image);button.append(photo,title,status);button.onclick=()=>openRecipe(row.id);el('list').append(button);}el('count').textContent=jobs.length+' loaded'+(cursor?' · more available':'');el('more').hidden=true;}

async function load(more=false){

 const request=++listRequest;const wanted=el('filter').value;

 const combined=new Map((more?jobs:[]).map(row=>[wanted==='published'?(row.recipe_id||row.id):row.id,row]));

 let next=more?cursor:null;const seen=new Set();

 try{

  notice('Loading private recipes…');

  do{

   const p=new URLSearchParams({status:wanted});if(next)p.set('cursor',next);

   const data=await api('/admin/jobs?'+p);if(request!==listRequest)return;

   for(const row of data.jobs)combined.set(wanted==='published'?(row.recipe_id||row.id):row.id,row);

   next=data.cursor||null;if(next&&seen.has(next))throw Error('Recipe list did not finish loading. Refresh to retry.');if(next)seen.add(next);

   jobs=[...combined.values()];if(wanted==='published')jobs.sort((a,b)=>String(a.title).localeCompare(String(b.title)));

   cursor=next;renderList();if(next)notice('Loading all recipes… '+jobs.length+' loaded');

  }while(next);

  notice(jobs.length?'Select a recipe to review.':'No recipes in this group.');

 }catch(error){if(request===listRequest)notice(error.message,true);}

}

async function openRecipe(id){try{stashDraft();notice('Loading source and draft…');current=await api('/admin/jobs/'+id);const recipe=current.recipe||{};el('editor').replaceChildren(el('edit-template').content.cloneNode(true));el('status').textContent=current.job.status.replaceAll('_',' ');el('heading').textContent=recipe.title||current.metadata.title||current.job.source_url||'Shared video';el('title').value=recipe.title||'';el('ingredients').value=(recipe.ingredients||[]).join('\n');el('steps').value=(recipe.steps||[]).join('\n');el('recipe-notes').value=recipe.notes||'';el('recipe-url').value=recipe.source?.recipe_url||current.metadata.linked_recipe_url||'';el('reason').textContent=current.job.reason||'Awaiting your review.';el('caption').textContent=[current.metadata.description,current.metadata.linked_recipe_text].filter(Boolean).join('\n\n')||'No caption available.';el('transcript').textContent=current.transcript||'No transcript available.';el('notes').textContent=[...(recipe.uncertainties||[]),...(current.issues||[]),...(current.review.issues||[])].join('\n')||'No additional automated notes.';safeLink(el('source'),current.job.source_url||current.metadata.webpage_url);el('form').onsubmit=e=>{e.preventDefault();save('draft');};el('publish').onclick=()=>save('publish');el('hold').onclick=()=>save('hold');el('not-recipe').onclick=()=>classifyPost(false);el('restore').onclick=()=>classifyPost(true);el('not-recipe').hidden=current.job.status==='not_recipe';el('restore').hidden=current.job.status!=='not_recipe';el('next-post').onclick=nextPost;renderList();notice('Review the source before publishing.');el('form').oninput=stashDraft;const baseline={};for(const field of ['title','ingredients','steps','recipe-notes','recipe-url'])baseline[field]=el(field).value;baseline.reviewed=el('reviewed').checked;current.baseFields=JSON.stringify(baseline);restoreDraft();if(!el('review-dialog').open)el('review-dialog').showModal();}catch(error){notice(error.message,true);}}

async function save(action){if(action==='publish'&&!el('reviewed').checked){notice('Confirm that quantities and instructions have been reviewed.',true);return;}const lines=id=>el(id).value.split('\n').map(x=>x.trim()).filter(Boolean);const body={title:el('title').value.trim(),ingredients:lines('ingredients'),steps:lines('steps'),notes:el('recipe-notes').value.trim(),recipe_url:el('recipe-url').value.trim(),reviewed:el('reviewed').checked,review_revision:current.review_revision};if(!body.title||!body.ingredients.length||!body.steps.length){notice('Add a recipe name, ingredients and instructions.',true);return;}const buttons=[...el('form').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{notice(action==='publish'?'Publishing reviewed recipe…':'Saving private draft…');const id=current.job.id;await api('/admin/jobs/'+id+(action==='draft'?'':'/'+action),action==='draft'?'PUT':'POST',body);sessionStorage.removeItem('recipe_admin_draft');current=null;await load();await openRecipe(id);notice(action==='publish'?'Published. The recipe is now searchable on the family website.':'Saved privately.');}catch(error){notice(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}}

async function start(){try{config=await(await fetch('config.json',{cache:'no-store'})).json();el('login').onclick=()=>login();el('google-login').hidden=config.GoogleEnabled!=='true';el('google-login').onclick=()=>login('Google');el('logout').onclick=()=>{stashDraft();gate();location.assign(config.LoginDomain+'/logout?'+new URLSearchParams({client_id:config.ClientId,logout_uri:config.callbackUrl}));};const p=new URLSearchParams(location.search);if(p.has('code')){const saved=JSON.parse(sessionStorage.getItem('recipe_admin_oauth')||'null');sessionStorage.removeItem('recipe_admin_oauth');history.replaceState({},'',config.callbackUrl);if(!saved||saved.state!==p.get('state')||Date.now()-saved.created>1800000)throw Error('Sign-in verification expired. Sign in again.');const response=await fetch(config.LoginDomain+'/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.ClientId,redirect_uri:config.callbackUrl,code:p.get('code'),code_verifier:saved.verifier})});const data=await response.json();if(!response.ok||!data.access_token)throw Error('Sign-in could not be completed. Please retry.');token=data.access_token;sessionStorage.setItem('recipe_admin_token',token);if(data.refresh_token)sessionStorage.setItem('recipe_admin_refresh',data.refresh_token);}if(!token){gate();notice('Sign in to review private recipes.');return;}el('close-review').onclick=()=>{stashDraft();el('review-dialog').close();};el('review-dialog').addEventListener('cancel',stashDraft);el('gate').hidden=true;el('desk').hidden=false;el('logout').hidden=false;el('filter').onchange=()=>load();el('reload').onclick=()=>load();el('more').onclick=()=>load(true);el('search').oninput=renderList;await load();const draft=JSON.parse(sessionStorage.getItem('recipe_admin_draft')||'null');if(draft)await openRecipe(draft.id);}catch(error){gate();notice(error.message,true);}}

start();



async function classifyPost(restore=false){

  if(!current)return;

  const key=current.job.id;

  const index=jobs.findIndex(row=>row.id===key);

  const action=restore?'restore':'not-recipe';

  const button=el(restore?'restore':'not-recipe');button.disabled=true;

  try{

    notice(restore?'Returning post to review…':'Marking post as not a recipe…');

    await api('/admin/jobs/'+key+'/'+action,'POST',{review_revision:current.review_revision});

    sessionStorage.removeItem('recipe_admin_draft');jobs=jobs.filter(row=>row.id!==key);current=null;renderList();

    el('editor').innerHTML='<div class="empty"><h2>'+ (restore?'Post returned to review.':'Marked not a recipe.') +'</h2><p>'+(restore?'Find it under Waiting for review.':'It will stay out of automatic review. You can undo this under Not recipes.')+'</p></div>';

    const next=jobs[Math.min(Math.max(index,0),jobs.length-1)];

    if(next)await openRecipe(next.id);else if(cursor){await load(true);if(jobs.length)await openRecipe(jobs[0].id);}

    notice(restore?'Post returned to review.':'Marked not a recipe. Undo is available under Not recipes.');

  }catch(error){notice(error.message,true);if(button.isConnected)button.disabled=false;}

}

async function nextPost(){

  if(!current)return;

  const index=jobs.findIndex(row=>row.id===current.job.id);

  if(index>=0&&index<jobs.length-1)return openRecipe(jobs[index+1].id);

  if(cursor){const previous=jobs.length;await load(true);if(jobs[previous])return openRecipe(jobs[previous].id);}

  notice('End of the loaded posts. Choose another status or refresh the list.');

}
