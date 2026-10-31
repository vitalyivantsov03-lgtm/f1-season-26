/* Правки друга на сайте GitHub Pages. Сайт там только читает снимок базы, поэтому правка (итоги сессии,
   новая сессия вручную, сезон/роль сессии, уикенд) уходит заявкой — JSON-файлом в папку edits/ репозитория,
   от имени аккаунта GitHub друга. Трекер хозяина забирает заявки, применяет к базе и публикует сайт заново.
   Страница «Правки»: вход, заявки, которые ждут применения, и история применённых. */
const REPO=window.F1_REPO, GH_API=window.F1_GH_API||'https://api.github.com';  // подмена — только для тестов
const FRIEND_ACTIONS=['/api/results_update','/api/manual_session','/api/session_update','/api/weekend_join'];
const store={get:k=>{try{return localStorage.getItem(k)||''}catch{return ''}},
  set:(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch{}}};
const ghToken=()=>store.get('f1_gh_token'), ghLogin=()=>store.get('f1_gh_login');
const repoPath=p=>`/repos/${REPO.owner}/${REPO.repo}${p}`;
async function gh(path,opt={},token=ghToken()){
  const r=await fetch(GH_API+path,{...opt,cache:'no-store',headers:{Accept:'application/vnd.github+json',
    ...(token?{Authorization:'Bearer '+token}:{}),...(opt.body?{'Content-Type':'application/json'}:{})}});
  if(!r.ok){const m=(await r.json().catch(()=>({}))).message||'';throw new Error(`GitHub ответил ${r.status}${m?': '+m:''}`)}
  return r.status===204?{}:r.json();
}
// base64 для UTF-8 (имена и комментарии по-русски)
const b64utf8=s=>{const b=new TextEncoder().encode(s);let out='';for(let i=0;i<b.length;i+=0x8000)out+=String.fromCharCode(...b.subarray(i,i+0x8000));return btoa(out)};
function toast(text,bad){
  const el=document.createElement('div');el.textContent=text;
  el.style.cssText=`position:fixed;right:20px;bottom:20px;max-width:420px;z-index:99;padding:14px 16px;border-radius:8px;line-height:1.4;
    background:${bad?'#5a1f24':'#1f3d2c'};color:#fff;border:1px solid ${bad?'#ff4747':'#2fd67b'};box-shadow:0 6px 24px rgba(0,0,0,.4)`;
  document.body.appendChild(el);setTimeout(()=>el.remove(),bad?9000:7000);
}

/* описание заявки по-человечески */
let sessCache=null;
async function editText(e){
  sessCache??=await api('/api/sessions').catch(()=>[]);
  const b=e.body||{}, s=sessCache.find(x=>x.uid===b.uid), lbl=s?`${s.track} · ${s.type} · ${fmtD(s.started)}`:'сессия';
  const n=(b.results||[]).length;
  switch(e.action){
    case '/api/results_update': return `Итоги: ${lbl} — ${n} пилотов`;
    case '/api/manual_session': return `Новая сессия: ${b.track||'?'} · ${b.type||''} · ${b.date||''} — ${n} пилотов`;
    case '/api/session_update': return `${lbl}: `+Object.entries(b).filter(([k])=>k!=='uid').map(([k,v])=>`${{season_id:'сезон',role:'роль',mode:'режим'}[k]||k} → ${v??'сброс'}`).join(', ');
    case '/api/weekend_join': return b.target?`${lbl}: объединить в уикенд`:`${lbl}: отделить от уикенда`;
  }
  return e.action||'неизвестная правка';
}

/* вместо запроса к трекеру (на GitHub Pages его нет) — заявка в репозиторий */
window.friendEdit=async function(action,body){
  if(!REPO||!FRIEND_ACTIONS.includes(action)){toast('Это действие доступно только хозяину сайта',true);return {error:'forbidden'}}
  if(!ghToken()){toast('Сначала войдите: страница «Правки»',true);location.hash='#/edits';return {error:'login'}}
  const id=`${new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14)}-${Math.random().toString(36).slice(2,8)}`;
  const e={id,action,body,author:ghLogin(),ts:Date.now()/1000,page:location.hash};
  try{
    await gh(repoPath(`/contents/${REPO.dir}/${id}.json`),{method:'PUT',body:JSON.stringify({
      message:`Правка от ${ghLogin()}: ${await editText(e)}`,content:b64utf8(JSON.stringify(e,null,1)),branch:REPO.branch})});
  }catch(err){toast('Правка не отправлена: '+err.message,true);return {error:String(err)}}
  toast('Правка отправлена. Она появится на сайте, когда трекер хозяина её применит — обычно через несколько минут, если трекер запущен.');
  pendingBadge();
  return {pending:true};
};

/* заявки в репозитории, которые трекер ещё не применил */
async function pendingEdits(){
  const [list,applied]=await Promise.all([
    gh(repoPath(`/contents/${REPO.dir}?ref=${REPO.branch}`)).catch(e=>/ 404/.test(e.message)?[]:Promise.reject(e)),
    api('/api/edits').catch(()=>[])]);
  const done=new Set(applied.map(a=>a.file));
  const files=list.filter(f=>f.type==='file'&&f.name.endsWith('.json')&&!done.has(f.name));
  return Promise.all(files.map(async f=>({file:f.name,sha:f.sha,...await (await fetch(f.download_url,{cache:'no-store'})).json().catch(()=>({}))})));
}
async function pendingBadge(){
  const a=document.querySelector('nav a[data-r="edits"]'); if(!a||!STATIC||!REPO) return;
  try{const n=(await pendingEdits()).length;a.querySelector('.cnt')?.remove();
    if(n) a.insertAdjacentHTML('beforeend',`<span class="cnt" style="position:absolute;top:0;right:14px;background:var(--red);color:#fff;border-radius:9px;font:700 11px var(--font);padding:1px 6px">${n}</span>`)}catch{}
}

window.editsPage=async function(){
  const applied=await api('/api/edits').catch(()=>[]);
  let h=`<h1>Правки</h1><div class="sub">${STATIC
    ?'Здесь можно войти, чтобы править итоги, добавлять сессии вручную, менять сезон и роль сессии и собирать уикенды. Правка уходит хозяину сайта и появляется здесь после того, как его трекер её применит.'
    :'Правки, которые друг сделал на сайте GitHub Pages. Трекер забирает их сам каждые 3 минуты, пока запущен, и при нажатии «Опубликовать на сайт».'}</div>`;
  if(STATIC&&REPO){
    h+=ghToken()?`<div class="bar"><span class="chip blue">Вы вошли как ${esc(ghLogin())}</span><button class="ghost" id="ed-out">Выйти</button></div>`
      :`<div class="panel" style="padding:16px;max-width:760px"><h3 style="margin:0 0 10px">Вход для правок</h3>
      <ol style="line-height:1.6;color:var(--peri);margin:0 0 12px;padding-left:20px">
        <li>Хозяин сайта добавляет вас соавтором репозитория <b>${esc(REPO.owner)}/${esc(REPO.repo)}</b> (Settings → Collaborators), вы принимаете приглашение на GitHub.</li>
        <li>Создайте токен: GitHub → Settings → Developer settings → Personal access tokens → <b>Tokens (classic)</b> → Generate new token, отметьте только <b>public_repo</b>.</li>
        <li>Вставьте токен сюда. Он хранится только в этом браузере и уходит только на api.github.com.</li></ol>
      <div class="bar"><input id="ed-token" type="password" placeholder="ghp_…" style="min-width:320px" autocomplete="off"><button id="ed-in">Войти</button></div></div>`;
    h+=`<h2>Ждут применения</h2><div id="ed-pending"><div class="sub">Загрузка…</div></div>`;
  }
  h+=`<h2>Применённые</h2>${applied.length?`<div class="panel"><table><thead><tr><th style="text-align:left">Когда<th style="text-align:left">Кто<th style="text-align:left">Что<th>Итог</tr></thead><tbody>
    ${(await Promise.all(applied.map(async a=>`<tr><td style="text-align:left">${fmtD(a.applied)}<td style="text-align:left">${esc(a.author)}<td style="text-align:left;white-space:normal">${esc(await editText(a))}
      <td>${a.ok?'<span class="tag pb">применена</span>':`<span class="tag inv" title="${esc(a.result?.error||'')}">ошибка</span> <span style="color:var(--mute)">${esc(a.result?.error||'')}</span>`}`))).join('')}</tbody></table></div>`
    :'<div class="empty">Правок пока не было</div>'}`;
  app.innerHTML=h;
  const out=$('#ed-out');if(out)out.onclick=()=>{store.set('f1_gh_token','');store.set('f1_gh_login','');editsPage()};
  const inb=$('#ed-in');if(inb)inb.onclick=async()=>{
    const t=$('#ed-token').value.trim();if(!t)return;
    try{const u=await gh('/user',{},t), r=await gh(repoPath(''),{},t);
      if(!r.permissions?.push) throw new Error(`у ${u.login} нет прав на запись в ${REPO.owner}/${REPO.repo}: попросите хозяина добавить вас соавтором и примите приглашение`);
      store.set('f1_gh_token',t);store.set('f1_gh_login',u.login);document.body.classList.add('editor');toast('Готово: теперь на страницах сессий и сезона доступны правки');editsPage();
    }catch(err){toast('Не получилось войти: '+err.message,true)}};
  const pend=$('#ed-pending');if(!pend) return;
  try{const P=await pendingEdits();
    pend.innerHTML=P.length?`<div class="panel"><table><thead><tr><th style="text-align:left">Отправлена<th style="text-align:left">Кто<th style="text-align:left">Что<th></tr></thead><tbody>
      ${(await Promise.all(P.map(async p=>`<tr><td style="text-align:left">${p.ts?fmtD(p.ts):'—'}<td style="text-align:left">${esc(p.author||'?')}<td style="text-align:left;white-space:normal">${esc(await editText(p))}
        <td>${p.author&&p.author===ghLogin()?`<button class="ghost" data-undo="${esc(p.file)}" data-sha="${p.sha}">Отменить</button>`:'<span class="tag">ждёт</span>'}`))).join('')}</tbody></table></div>`
      :'<div class="sub">Все правки применены.</div>';
    pend.querySelectorAll('[data-undo]').forEach(b=>b.onclick=async()=>{
      try{await gh(repoPath(`/contents/${REPO.dir}/${b.dataset.undo}`),{method:'DELETE',body:JSON.stringify({message:`Отмена правки ${b.dataset.undo}`,sha:b.dataset.sha,branch:REPO.branch})});
        toast('Правка отменена');editsPage();pendingBadge()}catch(err){toast('Не получилось отменить: '+err.message,true)}});
  }catch(err){pend.innerHTML=`<div class="sub">Не удалось получить список с GitHub: ${esc(err.message)}</div>`}
};

/* пункт «Правки» в меню; в режиме правок показываем кнопки, доступные другу (.edit.fe).
   После загрузки страницы: STATIC объявляется в index.html уже после подключения скриптов */
addEventListener('DOMContentLoaded',()=>{
  if(STATIC&&!REPO) return;  // снимок без репозитория (Netlify) — правок нет
  if(STATIC&&ghToken()) document.body.classList.add('editor');
  const nav=document.querySelector('nav');
  nav?.insertAdjacentHTML('beforeend',`<a href="#/edits" data-r="edits" style="position:relative"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg>Правки</a>`);
  pendingBadge();
});
