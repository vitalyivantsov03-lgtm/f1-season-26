/* Режимы игры, сезоны, ручной ввод итогов. Использует глобальные хелперы из index.html. */
const MODES={time_trial:'Time Trial',multiplayer:'Multiplayer',solo:'Одиночная'};
const ROLES={race:'Гонка',sprint:'Спринт',quali:'Квалификация',sq:'Спринт-квалиф.',practice:'Практика',other:'Не в зачёте'};
const STATUS={3:'',4:'DNF',5:'DSQ',6:'NC',7:'DNS'};
const STATUS_IN={'':3,dnf:4,dsq:5,nc:6,dns:7,ret:7};
const TRACK_NAMES=['Melbourne','Paul Ricard','Shanghai','Sakhir','Barcelona','Monaco','Montreal','Silverstone','Hockenheim','Hungaroring','Spa','Monza','Singapore','Suzuka','Abu Dhabi','Austin','Interlagos','Spielberg','Sochi','Mexico City','Baku','Zandvoort','Imola','Portimao','Jeddah','Miami','Las Vegas','Lusail','Madrid'];
const SESSION_TYPES=['Race','Sprint','Race 2','Q1','Q2','Q3','Short Qualifying','Sprint Shootout 1','Practice 1','Practice 2','Practice 3'];

const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json());
const del=u=>fetch(u,{method:'DELETE'});
const refresh=()=>route();

window.modeBadge=s=>`<span class="tag">${MODES[s.mode]||s.mode||'—'}</span>`+(s.season_name?`<span class="tag pb">${esc(s.season_name)}</span>`:'');

/* ---------- ввод итогов текстом: «Имя | Команда | DNF | 1:23.456», порядок строк = порядок финиша ---------- */
function parseResults(text,orig=[]){
  const known=Object.fromEntries(orig.map(r=>[r.name,r]));
  return text.split('\n').map(l=>l.trim()).filter(Boolean).map((l,i)=>{
    const [name,team='',st='',best='']=l.split(/\s*[|;\t]\s*/), m=best.match(/^(\d+):(\d+(?:\.\d+)?)$/), o=known[name]||{};
    return {pos:i+1,name,team,status:STATUS_IN[st.toLowerCase()]??3,best_ms:m?Math.round(m[1]*6e4+m[2]*1e3):(o.best_ms||0),
      ai:o.ai||0,me:o.me||0,grid:o.grid||0,laps:o.laps||0};
  });
}
const resultsToText=rows=>rows.map(r=>[r.name,r.team||'',STATUS[r.status]||'',r.best_ms?fmt(r.best_ms):''].join(' | ')).join('\n');
// старт в гонке и штраф на решётке: итог квалификации → стартовая позиция (считает сервер)
const gridPen=x=>x.grid_penalty>0?`<span class="tag inv" title="Квалифицировался ${x.quali_final}-м, стартовал ${x.start_grid}-м">штраф +${x.grid_penalty} поз.</span>`:'';
const startCell=x=>x.start_grid?`${x.start_grid}${gridPen(x)}`:(x.grid||'—');
const HINT='По одной строке на пилота в порядке финиша: <code>Имя | Команда | DNF | 1:23.456</code>. Команда, статус (DNF, DSQ, NC) и лучший круг необязательны.';

/* ---------- расширения страницы сессии: режим, сезон, роль, итоги ---------- */
window.sessionExtras=async function(s){
  await weekendBlock(s);
  const [seasons,res]=await Promise.all([api('/api/seasons'),api('/api/results?uid='+s.uid)]);
  const sel=(id,opts,cur)=>`<select id="${id}">${opts.map(([v,t])=>`<option value="${v}"${String(v)===String(cur??'')?' selected':''}>${esc(t)}</option>`).join('')}</select>`;
  const box=document.createElement('div');
  box.innerHTML=`<div class="edit"><h2>Режим и зачёт</h2>
  <div class="bar">
    <label>Режим ${sel('m-mode',Object.entries(MODES),s.mode)}</label>
    <label>Сезон ${sel('m-season',[['','— вне сезона —'],...seasons.map(x=>[x.id,x.name+(x.active?' (текущий)':'')])],s.season_id)}</label>
    <label>Роль в зачёте ${sel('m-role',[['','авто ('+(ROLES[autoRole(s.type)])+')'],...Object.entries(ROLES)],s.role)}</label>
  </div>
  <div class="sub">«Вне сезона» — сессия остаётся в истории, но очки за неё не начисляются.</div></div>
  <h2>Итоги сессии ${res.length?'':'<span class="tag">нет данных</span>'}</h2>
  ${res.length?`<div class="panel"><table><thead><tr><th>Поз<th>Пилот<th>Команда<th>Старт в гонке<th>Лучший круг<th>Статус</tr></thead><tbody>
  ${res.map(r=>`<tr class="${r.me?'':''}"><td>${r.pos}<td>${esc(r.name)}${r.ai?'<span class="tag">бот</span>':''}${r.me?'<span class="tag pb">я</span>':''}<td>${esc(r.team)}<td>${startCell(r)}<td>${fmt(r.best_ms)}<td>${STATUS[r.status]||'Финиш'}`).join('')}</tbody></table></div>`:''}
  <div class="bar edit" style="margin-top:10px"><button id="m-edit">${res.length?'Править итоги':'Ввести итоги вручную'}</button></div>
  <div id="m-editor"></div>`;
  box.dataset.tab='overview';
  app.appendChild(box);
  const upd=f=>async e=>{await post('/api/session_update',{uid:s.uid,[f]:e.target.value===''?null:(f==='season_id'?+e.target.value:e.target.value)});refresh()};
  $('#m-mode').onchange=upd('mode');$('#m-season').onchange=upd('season_id');$('#m-role').onchange=upd('role');
  $('#m-edit').onclick=()=>{
    $('#m-editor').innerHTML=`<div class="sub">${HINT}</div><textarea id="m-text" rows="12" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;font:13px ui-monospace,monospace">${esc(resultsToText(res))}</textarea>
    <div class="bar"><button id="m-save">Сохранить итоги</button></div>`;
    $('#m-save').onclick=async()=>{await post('/api/results_update',{uid:s.uid,results:parseResults($('#m-text').value,res)});refresh()};
  };
};
function autoRole(t){return t==='Sprint'?'sprint':t.startsWith('Race')?'race':t.includes('Shootout')?'sq':['Q1','Q2','Q3','Short Qualifying','One-Shot Qualifying'].includes(t)?'quali':t.includes('Practice')?'practice':'other'}

/* ---------- список сессий с вкладками по режимам ---------- */
let modeTab='all';
async function sessionsPage(){
  const ss=await api('/api/sessions'), cnt=m=>m==='all'?ss.length:ss.filter(s=>s.mode===m).length;
  app.innerHTML=`<h1>Сессии</h1><div class="sub">Разделены по режимам игры</div>
  <div class="bar">${[['all','Все'],...Object.entries(MODES)].map(([k,t])=>`<button data-m="${k}" style="${modeTab===k?'background:var(--blue2);border-color:#c7cbe0':''}">${t} · ${cnt(k)}</button>`).join('')}
  <input id="f" placeholder="Поиск по трассе или типу…"></div><div id="list"></div>`;
  const draw=()=>{const q=$('#f').value.toLowerCase();
    $('#list').innerHTML=sessTable(ss.filter(s=>(modeTab==='all'||s.mode===modeTab)&&(s.track+' '+s.type).toLowerCase().includes(q)))};
  $('#f').oninput=draw;draw();
  app.onclick=e=>{const b=e.target.closest('button[data-m]');if(b){modeTab=b.dataset.m;sessionsPage()}};
}

/* ---------- сезоны: в стиле страницы лиги EA Racenet ---------- */
// трасса -> [страна/название этапа, цвет карточки]
const TRACK_INFO={Melbourne:['Австралия','#1d6b45'],Shanghai:['Китай','#8a1c1c'],Suzuka:['Япония','#7a1f3d'],Sakhir:['Бахрейн','#8a5a1c'],
  Jeddah:['Саудовская Аравия','#1c5a3a'],Miami:['Майами','#1c6a8a'],Imola:['Имола','#2a4a8a'],Monaco:['Монако','#8a1c3a'],
  Barcelona:['Испания','#8a6a1c'],Montreal:['Канада','#8a1c1c'],Spielberg:['Австрия','#5a2a6a'],Silverstone:['Великобритания','#1c3a7a'],
  Spa:['Бельгия','#4a5a1c'],Hungaroring:['Венгрия','#1c6a4a'],Zandvoort:['Нидерланды','#9a5a1c'],Monza:['Италия','#1c6a2a'],
  Baku:['Азербайджан','#1c4a7a'],Singapore:['Сингапур','#5a1c6a'],Austin:['США','#3a1c7a'],'Mexico City':['Мексика','#1c6a5a'],
  Interlagos:['Бразилия','#3a7a1c'],'Las Vegas':['Лас-Вегас','#6a1c7a'],Lusail:['Катар','#6a1c3a'],'Abu Dhabi':['Абу-Даби','#1c5a7a'],
  Madrid:['Мадрид','#8a3a1c'],'Paul Ricard':['Франция','#1c3a8a'],Portimao:['Португалия','#1c6a3a'],Hockenheim:['Германия','#3a3a3a'],
  Sochi:['Сочи','#1c4a6a'],Hanoi:['Вьетнам','#7a1c1c']};
const tinfo=t=>TRACK_INFO[t]||[t,'#3a3f6a'];
const CAL_PRESETS={
  f1_2026:['Календарь Ф1 2026 (24 этапа)',['Melbourne','Shanghai','Suzuka','Sakhir','Jeddah','Miami','Montreal','Monaco','Barcelona','Spielberg',
    'Silverstone','Spa','Hungaroring','Zandvoort','Monza','Madrid','Baku','Singapore','Austin','Mexico City','Interlagos','Las Vegas','Lusail','Abu Dhabi']],
  valvit:['Лига ValVit World Championship 2026 (17 этапов)',['Melbourne','Shanghai','Suzuka','Sakhir','Jeddah','Miami','Imola','Monaco',
    'Barcelona','Montreal','Spielberg','Silverstone','Spa','Hungaroring','Zandvoort','Monza','Baku']]};
const EV_STATUS={done:['ЗАВЕРШЁН','done'],live:['ИДЁТ',''],next:['СЛЕДУЮЩИЙ','next'],future:['БУДУЩИЙ','done'],extra:['ВНЕ КАЛЕНДАРЯ','done']};

if(!document.getElementById('season-css')){const st=document.createElement('style');st.id='season-css';st.textContent=`
.lg-box{background:var(--panel);border-radius:8px;padding:0 0 24px;margin-top:24px;overflow:hidden;box-shadow:-2px 2px 4px 0 rgba(34,20,33,.4)}
.lg-box>.lg-title{text-align:center;padding:14px 14px 12px;background:var(--row)}.lg-title b{font:700 24px/1.1 var(--display);display:block}.lg-title span{font-size:12px;color:var(--peri)}
.lg-in{padding:0 20px}
.evs{display:flex;gap:12px;overflow-x:auto;padding:4px 2px 12px;scroll-snap-type:x mandatory}
.ev{flex:0 0 266px;border-radius:8px;background:var(--panel2);cursor:pointer;overflow:hidden;border:2px solid transparent;scroll-snap-align:start;transition:all .2s ease-in-out}.ev:hover{opacity:.9}
.ev.on{border-color:var(--peri);box-shadow:0 0 6px 1px rgba(192,193,219,.35)}
.ev .art{height:104px;position:relative;overflow:hidden}
.ev .art:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.06) 0 14px,transparent 14px 30px)}
.ev .art .n{position:absolute;right:10px;bottom:-14px;font:900 72px var(--font);color:rgba(255,255,255,.18);font-style:italic}
.ev .art .t{position:absolute;left:12px;top:10px;font-weight:700;font-size:13px;color:rgba(255,255,255,.85);letter-spacing:.4px;text-transform:uppercase}
.ev .art .status{position:absolute;left:12px;bottom:10px;z-index:1}
.ev .cap{padding:12px 12px 14px}.ev .cap b{display:block;font:700 20px/1.2 var(--display);color:var(--red)}.ev.on .cap b{color:#fff}.ev .cap span{color:var(--peri);font-size:16px}
.settings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 34px}
.lg-box table th:nth-child(2),.lg-box table td:nth-child(2),.lg-box table th:nth-child(3),.lg-box table td:nth-child(3){text-align:left}
.wk th:nth-child(2),.wk td:nth-child(2),.wk th:nth-child(3),.wk td:nth-child(3){text-align:left}
.settings-grid h3{margin:16px 0 6px;font-size:20px;color:var(--text)}.settings-grid div{color:var(--peri);margin:4px 0;font-size:16px}.settings-grid div b{color:var(--text);font-weight:600}
.lgcard .status{margin-bottom:8px}.lgcard .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.lgcard .chip{font-size:13px;height:26px;padding:0 10px}
`;document.head.appendChild(st)}

function seasonEvents(d){
  // этапы по календарю: каждый проведённый этап занимает первый свободный слот своей трассы
  const cal=d.season.config.calendar||[], rounds=d.rounds, used=new Set();
  const status=r=>r.winner?'done':'live';
  if(!cal.length) return rounds.map((r,i)=>({track:r.track,round:r,status:status(r),n:i+1}));
  const evs=cal.map((t,i)=>({track:t,round:null,status:'future',n:i+1})), extra=[];
  for(const r of rounds){const ev=evs.find(e=>!e.round&&e.track===r.track);if(ev)ev.round=r;else extra.push({track:r.track,round:r,status:'extra',n:'·'})}
  evs.forEach(e=>{if(e.round)e.status=status(e.round)});
  const nx=evs.find(e=>!e.round);if(nx)nx.status='next';
  return [...evs,...extra.map(e=>({...e,status:'extra'}))];
}
const fmtRace=t=>{if(!t)return'—';const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=(t%60).toFixed(3).padStart(6,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`};
function eventTable(r,kind){
  const QO={...Q_ORDER,...SQ_ORDER};
  const ses=r?r.sessions.filter(s=>s.role_final===kind&&s.results.length).sort((a,b)=>(QO[a.type]||0)-(QO[b.type]||0)||a.started-b.started):[];
  if(!ses.length) return `<div class="empty" style="padding:26px">${!r?'Этап ещё не проведён':kind==='race'?'Итогов гонки нет':kind==='sprint'||kind==='sq'?'Спринта на этом этапе не было':'Итогов квалификации нет'}</div>`;
  if(kind==='quali'||kind==='sq'){
    // итог по всем сегментам: место в последнем сегменте, где пилот участвовал (Q3, иначе Q2, иначе Q1)
    const D={};ses.forEach((s,si)=>s.results.forEach(r=>{const d=D[r.display]??={...r,seg:-1};if(si>=d.seg)Object.assign(d,r,{seg:si})}));
    const res=Object.values(D).sort((a,b)=>b.seg-a.seg||a.pos-b.pos).map((x,i)=>({...x,pos:i+1}));
    const fl=Math.min(...res.map(x=>x.best_ms).filter(Boolean)),win=res[0];
    const segName=x=>ses.length>1?`<span class="tag" style="margin-left:6px">${esc(qLabel(ses[x.seg].type))}</span>`:'';
    return `<table><thead><tr><th>Поз.<th>Пилот<th>Команда<th>Лучший круг<th>Отставание${kind==='quali'?'<th>Старт в гонке':''}</tr></thead><tbody>
    ${res.map(x=>`<tr style="${x.me?'background:rgba(52,113,233,.28)':''}"><td class="pos${x.pos}">${x.pos}<td>${esc(x.display)}${x.ai?'<span class="tag">бот</span>':''}<td>${esc(x.team)}<td class="${x.best_ms===fl?'p':''}">${fmt(x.best_ms)}${segName(x)}<td>${x.pos===1||!x.best_ms||!win.best_ms||x.seg!==win.seg?'—':'+'+((x.best_ms-win.best_ms)/1e3).toFixed(3)}${kind==='quali'?`<td>${x.start_grid?startCell(x):'—'}`:''}`).join('')}</tbody></table>`;
  }
  const res=ses[ses.length-1].results, win=res.find(x=>x.pos===1)||res[0];
  const fl=Math.min(...res.map(x=>x.best_ms).filter(Boolean));
  const time=x=>STATUS[x.status]||(x.pos===1?fmtRace(x.time_s):x.laps<win.laps?`+${win.laps-x.laps} кр.`:x.time_s&&win.time_s?'+'+(x.time_s-win.time_s).toFixed(3):'—');
  return `<table><thead><tr><th>Поз.<th>Пилот<th>Команда<th>Старт<th>Лучший круг<th>Время<th>Штраф<th>Очки</tr></thead><tbody>
    ${res.map(x=>`<tr style="${x.me?'background:rgba(52,113,233,.28)':''}"><td class="pos${x.pos}">${x.pos}<td>${esc(x.display)}${x.ai?'<span class="tag">бот</span>':''}<td>${esc(x.team)}<td>${startCell(x)}<td class="${x.best_ms===fl?'p':''}">${fmt(x.best_ms)}<td>${time(x)}<td>${x.penalty_s?'+'+x.penalty_s+' с':'—'}<td><b>${x.points||0}</b>`).join('')}</tbody></table>`;
}
function exportCSV(d){
  const R=d.rounds, rows=[['Поз','Пилот','Команда','Очки','Победы','Подиумы','Поулы',...R.map((r,i)=>`${i+1}. ${r.track}`)],
    ...d.drivers.map((x,i)=>[i+1,x.name,x.team,x.points,x.wins,x.podiums,x.poles,...x.by_round])];
  const csv='﻿'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=d.season.name+'.csv';a.click();
}

async function seasonsPage(){
  const ss=await api('/api/seasons');
  const st=s=>s.planned&&s.done>=s.planned?['ЗАВЕРШЁН','done']:s.done?['ИДЁТ','']:['НЕ НАЧАТ','next'];
  app.innerHTML=`<h1>Сезоны</h1><div class="sub">Чемпионаты Multiplayer Grand Prix: календарь, результаты этапов, зачёт пилотов и команд</div>
  <div class="edit"><div class="bar"><input id="sn" placeholder="Название, например «ValVit World Championship 2026»" style="min-width:340px"><button id="sc">Создать сезон</button>
  <button id="pub" class="ghost">Опубликовать на сайт</button><span id="pubst" style="color:var(--mute)"></span></div>
  <div class="sub">Новый сезон становится текущим: все multiplayer-сессии автоматически попадают в него. Сайт для друга обновляется кнопкой «Опубликовать на сайт». Через GitHub Pages это бесплатно и без лимита (если не изменилось — ничего не публикуется); через Netlify каждая выкладка тратит 15 из 300 бесплатных кредитов в месяц.</div></div>
  ${ss.length?`<div class="grid2">${ss.map(s=>`<div class="tcard lgcard" onclick="location.hash='#/season/${s.id}'">
    <span class="status ${st(s)[1]}">${st(s)[0]}</span><h3>${esc(s.name)}</h3>
    <div style="color:var(--mute)">${s.leader?`Лидер: <b style="color:var(--text)">${esc(s.leader)}</b> · ${s.leader_points} очк.`:'Очков пока нет'}</div>
    <div class="chips"><span class="chip">${s.planned?`${s.done} / ${s.planned} этапов`:`${s.done} этапов`}</span><span class="chip">${s.drivers} пилотов</span>${s.active?'<span class="chip blue">Текущий</span>':''}</div></div>`).join('')}</div>`
  :'<div class="empty">Сезонов пока нет</div>'}`;
  $('#sc').onclick=async()=>{const n=$('#sn').value.trim();if(!n)return;const r=await post('/api/seasons',{name:n});location.hash='#/season/'+r.id};
  if(STATIC) return;
  const showPub=p=>{$('#pubst').innerHTML=p.busy?'публикую…':p.error?`<span style="color:#ff7b7b">${esc(p.error)}</span>`
    :p.url?`опубликовано ${fmtD(p.last)}${p.target?' ('+p.target+')':''}: <a href="${esc(p.url)}" target="_blank" style="color:var(--purple)">${esc(p.url)}</a>`:''};
  showPub(await api('/api/publish_status'));
  $('#pub').onclick=async()=>{showPub({busy:true});showPub(await post('/api/publish',{}))};
}

let sKind='race',sStand='drivers',sMatrix=false,hideBots=false,sEv=null,sEvSeason=null,sSettings=false;
const posCls=i=>i===0?'p':'';
/* «Положение в чемпионате»: личный и командный зачёт рядом — главная таблица сезона */
function overallHTML(d){
  if(!d.drivers.length) return '';
  const lead=d.drivers[0].points, tlead=d.teams[0]?.points||0;
  const gap=(p,l)=>p===l?'—':'−'+(l-p);
  const humanTeams=new Set(d.drivers.filter(x=>!x.ai).map(x=>x.team));
  return `<h2 style="margin-top:8px">Положение в чемпионате</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;align-items:start">
    <div><div style="font:700 15px var(--display);color:var(--peri);margin:0 0 6px">Личный зачёт</div>
    <div style="overflow:auto"><table><thead><tr><th>Поз.<th>Пилот<th>Команда<th>Очки<th>Отрыв</tr></thead><tbody>
    ${d.drivers.map((x,i)=>`<tr style="${x.me?'background:rgba(52,113,233,.28)':!x.ai?'background:rgba(255,71,71,.10)':''}"><td class="pos${i+1}">${i+1}<td><b>${esc(x.name)}</b>${x.me?'<span class="tag pb">я</span>':x.ai?'':'<span class="tag">игрок</span>'}<td>${esc(x.team)}<td class="${i?'':'p'}"><b>${x.points}</b><td style="color:var(--mute)">${gap(x.points,lead)}`).join('')}</tbody></table></div></div>
    <div><div style="font:700 15px var(--display);color:var(--peri);margin:0 0 6px">Командный зачёт</div>
    <div style="overflow:auto"><table><thead><tr><th>Поз.<th>Команда<th>Пилоты<th>Очки<th>Отрыв</tr></thead><tbody>
    ${d.teams.map((t,i)=>`<tr style="${humanTeams.has(t.name)?'background:rgba(255,71,71,.10)':''}"><td class="pos${i+1}">${i+1}<td><b>${esc(t.name)}</b><td style="white-space:normal">${t.drivers.map(esc).join(', ')}<td class="${i?'':'p'}"><b>${t.points}</b><td style="color:var(--mute)">${gap(t.points,tlead)}`).join('')}</tbody></table></div></div>
  </div>`;
}

async function seasonPage(id){
  const d=await api('/api/season?id='+id);
  if(d.error){app.innerHTML='<div class="empty">Сезон не найден</div>';return}
  const S=d.season, cfg=S.config, evs=seasonEvents(d);
  if(sEvSeason!==id){sEvSeason=id;const cur=[...evs].reverse().find(e=>e.round);sEv=cur?evs.indexOf(cur):0}
  const ev=evs[sEv]||evs[0];
  const done=evs.filter(e=>e.status==='done').length, planned=(cfg.calendar||[]).length;
  const status=planned&&done>=planned?['ЗАВЕРШЁН','done']:d.rounds.length?['ИДЁТ','']:['НЕ НАЧАТ','next'];
  const hasSprint=d.rounds.some(r=>r.sessions.some(s=>s.role_final==='sprint'));
  const types=new Set(d.rounds.flatMap(r=>r.sessions.map(s=>s.type)));
  const set=d.settings||{}, flat=Object.values(set).flat(), sv=n=>(flat.find(x=>x[0]===n)||[])[1];
  const chips=[['fill','Multiplayer'],['',planned?`${planned} этапов`:`${d.rounds.length} этапов`],
    types.has('One-Shot Qualifying')?['','Квалификация: один круг']:[...types].some(t=>/^Q[123]$/.test(t))?['','Квалификация: полная']:null,
    sv('Дистанция гонки')?['','Дистанция: '+sv('Дистанция гонки')]:null,
    sv('Равные машины')==='Вкл'?['','Равные машины']:null, sv('Повреждения')?['','Повреждения: '+sv('Повреждения')]:null].filter(Boolean);
  const drivers=d.drivers.filter(x=>!(hideBots&&x.ai)), R=d.rounds, short=t=>t.slice(0,4).toUpperCase();

  const standings=sStand==='drivers'
    ?(drivers.length?`<table><thead><tr><th>Поз.<th>Пилот<th>Команда<th>Победы<th>Подиумы<th>Поулы${sMatrix?R.map((r,i)=>`<th title="${esc(r.track)}">${i+1}. ${short(r.track)}`).join(''):''}<th>Очки</tr></thead><tbody>
      ${drivers.map((x,i)=>`<tr><td class="pos${i+1}">${i+1}<td><b>${esc(x.name)}</b>${x.ai?'<span class="tag">бот</span>':''}<td>${esc(x.team)}<td>${x.wins}<td>${x.podiums}<td>${x.poles}${sMatrix?x.by_round.map(p=>`<td style="color:${p?'var(--text)':'var(--mute)'}">${p||'·'}`).join(''):''}<td class="${posCls(i)}"><b>${x.points}</b>`).join('')}</tbody></table>`
      :'<div class="empty" style="padding:26px">Очков пока нет</div>')
    :(d.teams.length?`<table><thead><tr><th>Поз.<th>Команда<th>Пилоты<th>Победы<th>Очки</tr></thead><tbody>
      ${d.teams.map((t,i)=>`<tr><td class="pos${i+1}">${i+1}<td><b>${esc(t.name)}</b><td>${t.drivers.map(esc).join(', ')}<td>${t.wins}<td class="${posCls(i)}"><b>${t.points}</b>`).join('')}</tbody></table>`
      :'<div class="empty" style="padding:26px">Очков пока нет</div>');

  const roundTools=ev&&ev.round?`<details class="edit" style="margin-top:10px"><summary style="cursor:pointer;color:var(--mute)">Сессии этапа (${ev.round.sessions.length}) — роли и исключение из сезона</summary>
    ${ev.round.sessions.map(s=>`<div class="bar" style="margin:8px 0 0"><a href="#/session/${s.uid}" style="color:var(--text);font-weight:700;min-width:170px">${esc(s.type)}</a>
      <select class="rolesel" data-uid="${s.uid}">${[['','авто → '+ROLES[s.role_final]],...Object.entries(ROLES)].map(([v,t])=>`<option value="${v}"${(s.role||'')===v?' selected':''}>${t}</option>`).join('')}</select>
      <button class="rm danger" data-uid="${s.uid}">Убрать из сезона</button></div>`).join('')}</details>`:'';

  const settingsHTML=Object.keys(set).length?`<div class="settings-grid">${Object.entries(set).map(([g,rows])=>`<div><h3>${esc(g)}</h3>${rows.map(([k,v])=>`<div>${esc(k)}: <b>${esc(v)}</b></div>`).join('')}</div>`).join('')}</div>
    <div class="sub" style="margin:12px 0 0">По данным телеметрии последней сессии сезона.</div>`
    :'<div class="sub">Появятся после первой сессии сезона: игра присылает их в телеметрии.</div>';

  let edit='';
  if(sSettings){const kv=o=>Object.entries(o).map(([a,b])=>a+' = '+b).join('\n');
    edit=`<div class="lg-box edit" style="padding:18px"><h2 style="margin-top:0">Настройки сезона</h2>
    <div class="bar"><label>Название <input id="c-name" value="${esc(S.name)}" style="min-width:300px"></label>
    <label>Бонус за лучший круг <input id="c-fl" type="number" min="0" style="width:80px" value="${cfg.fl}"></label></div>
    <div class="bar"><label>Очки за гонку <input id="c-race" size="34" value="${cfg.race.join(', ')}"></label><label>Очки за спринт <input id="c-sprint" size="26" value="${cfg.sprint.join(', ')}"></label></div>
    <div class="bar" style="align-items:flex-start">
      <label>Календарь (трасса на строку)<br><textarea id="c-cal" rows="9" cols="24" placeholder="Melbourne&#10;Shanghai&#10;Suzuka">${esc((cfg.calendar||[]).join('\n'))}</textarea>
        <br><select id="c-preset" style="margin-top:6px"><option value="">Заполнить шаблоном…</option>${Object.entries(CAL_PRESETS).map(([k,[t]])=>`<option value="${k}">${t}</option>`).join('')}</select></label>
      <label>Переименования пилотов<br><textarea id="c-alias" rows="9" cols="26" placeholder="Игровой ник = Как показывать">${esc(kv(cfg.aliases))}</textarea></label>
      <label>Команды пилотов (для зачёта)<br><textarea id="c-teams" rows="9" cols="26" placeholder="Пилот = Команда">${esc(kv(cfg.teams))}</textarea></label></div>
    <div class="sub">Названия трасс — как в игре: ${Object.keys(TRACK_INFO).slice(0,24).join(', ')}.</div>
    <div class="bar"><button id="c-save">Сохранить</button><button class="ghost" id="c-active">Сделать текущим</button><button class="danger" id="c-del">Удалить сезон</button></div></div>`}

  app.innerHTML=`<span class="back" onclick="location.hash='#/seasons'">← все сезоны</span>
  <div><span class="status ${status[1]}">${status[0]}</span></div>
  <h1 style="margin-top:10px">${esc(S.name)}</h1>
  <div class="bar" style="margin-top:12px">${chips.map(([c,t])=>`<span class="chip ${c}">${esc(t)}</span>`).join('')}</div>
  <div class="bar" style="margin-top:6px">${S.active?'<span class="chip blue">Текущий сезон</span>':''}<span class="chip blue">${d.drivers.filter(x=>!x.ai).length} игрока · ${d.drivers.length} пилотов</span>
    <button class="ghost edit" id="s-set">${sSettings?'Скрыть настройки':'Настройки сезона'}</button>
    <button class="ghost edit" onclick="location.hash='#/new/${S.id}'">+ Добавить сессию вручную</button></div>
  ${edit}
  <div class="lg-box"><div class="lg-title"><b>${esc(S.name)}</b><span>${planned?`Этап ${Math.min(done+1,planned)} из ${planned}`:`${R.length} этапов`}</span></div>
  <div class="lg-in">
    ${overallHTML(d)}
    <h2>Результаты</h2>
    <div style="text-align:center;margin-bottom:14px"><div class="seg">${[['race','Гонка'],...(hasSprint?[['sprint','Спринт'],['sq','Спринт-квал.']]:[]),['quali','Квалификация']].map(([k,t])=>`<button data-k="${k}" class="${sKind===k?'on':''}">${t}</button>`).join('')}</div></div>
    ${evs.length?`<div class="evs">${evs.map((e,i)=>{const [cn,col]=tinfo(e.track),[stt,stc]=EV_STATUS[e.status];
      return `<div class="ev ${i===sEv?'on':''}" data-ev="${i}"><div class="art" style="background:linear-gradient(135deg,${col},#14162a)">
        <span class="t">${esc(e.track)}</span><span class="n">${e.n}</span><span class="status ${stc}">${stt}</span></div>
        <div class="cap"><b>${esc(cn)}</b><span>${e.round?e.round.date:'Multiplayer'}${e.round&&e.round.sprint?' · <b style="display:inline;font:inherit;color:#ffd23f">Спринт</b>':''}</span></div></div>`}).join('')}</div>`
      :'<div class="empty">Добавьте календарь в настройках сезона или проведите первую гонку</div>'}
    ${ev?`<div style="overflow:auto">${eventTable(ev.round,sKind)}</div>${ev.round&&(ev.round.pole||ev.round.winner)?`<div class="bar" style="margin-top:8px">${ev.round.pole?`<span class="chip">Поул: ${esc(ev.round.pole)}</span>`:''}${ev.round.winner?`<span class="chip">Победа: ${esc(ev.round.winner)}</span>`:''}</div>`:''}${roundTools}`:''}

    <h2>Зачёт</h2>
    <div style="text-align:center;margin-bottom:10px"><div class="seg">${[['drivers','Пилоты'],['teams','Команды']].map(([k,t])=>`<button data-st="${k}" class="${sStand===k?'on':''}">${t}</button>`).join('')}</div></div>
    ${sStand==='drivers'?`<div class="bar" style="justify-content:flex-end"><label><input type="checkbox" id="mx" ${sMatrix?'checked':''}> очки по этапам</label><label><input type="checkbox" id="hb" ${hideBots?'checked':''}> без ботов</label></div>`:''}
    <div style="overflow:auto">${standings}</div>
    <div style="text-align:right;margin-top:6px"><a href="#" id="csv" style="color:var(--red);font-weight:700;text-decoration:none">⤓ Экспорт в CSV</a></div>

    <h2>Настройки игры</h2>${settingsHTML}
  </div></div>`;

  const hb=$('#hb');if(hb)hb.onchange=()=>{hideBots=hb.checked;seasonPage(id)};
  const mx=$('#mx');if(mx)mx.onchange=()=>{sMatrix=mx.checked;seasonPage(id)};
  $('#csv').onclick=e=>{e.preventDefault();exportCSV(d)};
  const sb=$('#s-set');if(sb)sb.onclick=()=>{sSettings=!sSettings;seasonPage(id)};
  app.onclick=async e=>{
    const k=e.target.closest('button[data-k]');if(k){sKind=k.dataset.k;return seasonPage(id)}
    const s=e.target.closest('button[data-st]');if(s){sStand=s.dataset.st;return seasonPage(id)}
    const c=e.target.closest('.ev');if(c){sEv=+c.dataset.ev;return seasonPage(id)}
    const rm=e.target.closest('.rm');if(rm){await post('/api/session_update',{uid:rm.dataset.uid,season_id:null});return seasonPage(id)}
  };
  app.onchange=async e=>{if(e.target.classList.contains('rolesel')){await post('/api/session_update',{uid:e.target.dataset.uid,role:e.target.value||null});seasonPage(id)}};
  // прокрутить ленту этапов к выбранному
  const on=app.querySelector('.ev.on');if(on)on.parentElement.scrollLeft=on.offsetLeft-on.parentElement.offsetLeft-20;
  if(sSettings&&!STATIC){
    const nums=v=>v.split(/[,\s]+/).filter(Boolean).map(Number).filter(n=>!isNaN(n));
    const kvp=v=>Object.fromEntries(v.split('\n').map(l=>l.split('=').map(x=>x.trim())).filter(p=>p[0]&&p[1]));
    $('#c-preset').onchange=e=>{const p=CAL_PRESETS[e.target.value];if(p)$('#c-cal').value=p[1].join('\n')};
    $('#c-save').onclick=async()=>{await post('/api/season_update',{id:S.id,name:$('#c-name').value,config:{race:nums($('#c-race').value),sprint:nums($('#c-sprint').value),
      fl:+$('#c-fl').value||0,aliases:kvp($('#c-alias').value),teams:kvp($('#c-teams').value),
      calendar:$('#c-cal').value.split('\n').map(x=>x.trim()).filter(Boolean)}});sSettings=false;sEvSeason=null;seasonPage(id)};
    $('#c-active').onclick=async()=>{await post('/api/season_update',{id:S.id,active:true});seasonPage(id)};
    $('#c-del').onclick=async()=>{if(confirm('Удалить сезон? Сессии останутся, но выйдут из зачёта.')){await del('/api/season?id='+S.id);location.hash='#/seasons'}};
  }
}

/* ---------- ручное добавление сессии ---------- */
async function newSessionPage(seasonId){
  const seasons=await api('/api/seasons'), today=new Date().toISOString().slice(0,10);
  app.innerHTML=`<span class="back" onclick="history.back()">← назад</span><h1>Добавить сессию вручную</h1>
  <div class="sub">Для гонок, которые не записались телеметрией, или результатов, введённых по памяти.</div>
  <div class="panel" style="padding:16px"><div class="bar">
    <label>Трасса <input id="n-track" list="tl" placeholder="Spa"></label><datalist id="tl">${TRACK_NAMES.map(t=>`<option value="${t}">`).join('')}</datalist>
    <label>Сессия <select id="n-type">${SESSION_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label>Дата <input id="n-date" type="date" value="${today}"></label>
    <label>Кругов <input id="n-laps" type="number" min="0" style="width:70px" placeholder="0"></label>
    <label>Сезон <select id="n-season"><option value="">— вне сезона —</option>${seasons.map(s=>`<option value="${s.id}"${String(s.id)===String(seasonId)||(!seasonId&&s.active)?' selected':''}>${esc(s.name)}</option>`).join('')}</select></label></div>
  <div class="sub">${HINT}</div>
  <textarea id="n-text" rows="12" style="width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;font:13px ui-monospace,monospace" placeholder="Vitya | Ferrari&#10;Friend | McLaren&#10;Bot Verstappen | Red Bull | DNF"></textarea>
  <div class="bar"><button id="n-save">Сохранить</button></div></div>`;
  $('#n-save').onclick=async()=>{
    const track=$('#n-track').value.trim(); if(!track){alert('Укажите трассу');return}
    const r=await post('/api/manual_session',{track,type:$('#n-type').value,date:$('#n-date').value,total_laps:+$('#n-laps').value||0,
      season_id:$('#n-season').value?+$('#n-season').value:null,results:parseResults($('#n-text').value)});
    location.hash='#/session/'+r.uid;
  };
}

/* ---------- уикенд: квалификация Q1–Q3 + гонка как одно событие ---------- */
const Q_ORDER={'Q1':1,'Q2':2,'Q3':3,'Short Qualifying':3,'One-Shot Qualifying':3};
const SQ_ORDER={'Sprint Shootout 1':1,'Sprint Shootout 2':2,'Sprint Shootout 3':3,'Short Sprint Shootout':3,'One-Shot Sprint Shootout':3};
const qLabel=t=>({'Short Qualifying':'Квал.','One-Shot Qualifying':'Один круг','Sprint Shootout 1':'SQ1','Sprint Shootout 2':'SQ2',
  'Sprint Shootout 3':'SQ3','Short Sprint Shootout':'Спринт-квал.','One-Shot Sprint Shootout':'SQ один круг','Sprint':'Спринт'}[t]||t);
const hasWeekend=s=>s.weekend&&s.weekend!=='0';

// блок «Уикенд» на странице сессии: ссылка на уикенд, присоединить к другим сессиям, отделить
async function weekendBlock(s){
  const all=await api('/api/sessions');
  const mates=hasWeekend(s)?all.filter(x=>x.weekend===s.weekend&&x.uid!==s.uid):[];
  const cands=all.filter(x=>x.uid!==s.uid&&x.track===s.track&&Math.abs(x.started-s.started)<2*86400&&!mates.includes(x));
  const el=document.createElement('div');
  el.innerHTML=`<div class="bar" style="margin:4px 0 18px">
    ${mates.length?`<a href="#/weekend/${enc(s.weekend)}" class="chip blue" style="text-decoration:none">Уикенд: ${[s,...mates].sort((a,b)=>a.started-b.started).map(x=>esc(qLabel(x.type))).join(' · ')} ›</a>
      <button class="danger edit" id="wk-out">Отделить от уикенда</button>`:''}
    ${cands.length?`<span class="edit" style="display:inline-flex;gap:8px;align-items:center"><select id="wk-to">${cands.map(x=>`<option value="${x.uid}">${fmtD(x.started)} · ${esc(qLabel(x.type))}${hasWeekend(x)&&all.filter(y=>y.weekend===x.weekend).length>1?' (уикенд)':''}</option>`).join('')}</select>
      <button class="ghost" id="wk-join">${mates.length?'Добавить ещё':'Объединить в уикенд'}</button></span>`:''}</div>`;
  const anchor=app.querySelector('.sub'); anchor?anchor.after(el):app.prepend(el);
  const j=el.querySelector('#wk-join');if(j)j.onclick=async()=>{const r=await post('/api/weekend_join',{uid:s.uid,target:el.querySelector('#wk-to').value});location.hash='#/weekend/'+enc(r.weekend)};
  const o=el.querySelector('#wk-out');if(o)o.onclick=async()=>{if(confirm('Отделить эту сессию от уикенда?')){await post('/api/weekend_join',{uid:s.uid,target:null});refresh()}};
}

async function weekendPage(key){
  const ws=await api('/api/weekend?key='+enc(key));
  if(!ws.length){app.innerHTML='<div class="empty">Уикенд не найден</div>';return}
  const byOrder=o=>ws.filter(s=>o[s.type]&&s.results.length).sort((a,b)=>o[a.type]-o[b.type]||a.started-b.started);
  const quali=byOrder(Q_ORDER), shoot=byOrder(SQ_ORDER);
  const races=ws.filter(s=>s.type.startsWith('Race')&&s.results.length);
  const race=races.length?races.reduce((a,b)=>(b.total_laps||0)>=(a.total_laps||0)?b:a):null;  // основная гонка
  // спринт: сессия «Sprint», а у старых записей без структуры уикенда — более короткая из двух гонок
  const sprint=ws.find(s=>s.type==='Sprint'&&s.results.length)||(races.length>1?races.find(s=>s!==race):null);
  const main=race||sprint, first=ws[0];
  const hl=me=>me?' style="background:rgba(52,113,233,.28)"':'';
  // сводная квалификация: время в каждом сегменте, итог — место в последнем сегменте, где пилот участвовал
  const summary=list=>{const D={};
    list.forEach((s,si)=>s.results.forEach(r=>{const d=D[r.name]??={name:r.name,team:r.team,ai:r.ai,me:0,t:{},seg:-1,segPos:99};
      d.t[si]=r.best_ms;d.me=d.me||r.me;if(si>=d.seg){d.seg=si;d.segPos=r.pos;d.start_grid=r.start_grid;d.grid_penalty=r.grid_penalty;d.quali_final=r.quali_final;d.grid=r.grid}}));
    const rows=Object.values(D).sort((a,b)=>b.seg-a.seg||a.segPos-b.segPos);
    return {rows,best:list.map((s,si)=>Math.min(...rows.map(d=>d.t[si]).filter(Boolean)))}};
  const qualiTable=(list,title,grid)=>{if(!list.length)return '';const {rows,best}=summary(list);
    return `<h2>${title}</h2><div class="panel wk"><table><thead><tr><th>Поз.<th>Пилот<th>Команда${list.map(s=>`<th>${esc(qLabel(s.type))}`).join('')}${grid?'<th>Старт в гонке':''}</tr></thead><tbody>
    ${rows.map((d,i)=>`<tr${hl(d.me)}><td class="pos${i+1}">${i+1}<td>${esc(d.name)}${d.me?'<span class="tag pb">я</span>':d.ai?'':'<span class="tag">игрок</span>'}<td>${esc(d.team)}
      ${list.map((s,si)=>`<td class="${d.t[si]&&d.t[si]===best[si]?'p':''}" style="${si>d.seg?'color:var(--mute)':''}">${d.t[si]?fmt(d.t[si]):si>d.seg?'':'—'}`).join('')}
      ${grid?`<td>${d.start_grid?startCell(d):'—'}`:''}`).join('')}</tbody></table></div>`};
  const resultTable=(s,title)=>{if(!s)return '';const win=s.results.find(r=>r.pos===1)||s.results[0],fl=Math.min(...s.results.map(r=>r.best_ms).filter(Boolean));
    const rtime=x=>STATUS[x.status]||(x.pos===1?fmtRace(x.time_s):x.laps<win.laps?`+${win.laps-x.laps} кр.`:x.time_s&&win.time_s?'+'+(x.time_s-win.time_s).toFixed(3):'—');
    return `<h2>${title}</h2><div class="panel wk"><table><thead><tr><th>Поз.<th>Пилот<th>Команда<th>Старт<th>Лучший круг<th>Время<th>Штраф</tr></thead><tbody>
    ${s.results.map(x=>`<tr${hl(x.me)}><td class="pos${x.pos}">${x.pos}<td>${esc(x.name)}${x.me?'<span class="tag pb">я</span>':x.ai?'':'<span class="tag">игрок</span>'}<td>${esc(x.team)}<td>${startCell(x)}<td class="${x.best_ms===fl?'p':''}">${fmt(x.best_ms)}<td>${rtime(x)}<td>${x.penalty_s?'+'+x.penalty_s+' с':'—'}`).join('')}</tbody></table></div>
    <div class="bar" style="margin-top:10px"><a href="#/session/${s.uid}" class="chip" style="text-decoration:none">Круги, темп соперников, стратегия и износ шин — на странице сессии ›</a></div>`};
  const Q=quali.length?quali:shoot, qs=summary(Q), meQ=qs.rows.findIndex(d=>d.me), meR=main?main.results.find(r=>r.me):null;
  const card=(k,v,extra='')=>`<div class="card"><div class="k">${k}</div><div class="v">${v??'—'}</div>${extra}</div>`;
  app.innerHTML=`<span class="back" onclick="history.back()">← назад</span>
  <h1>${esc(first.track)} <span class="tag">${sprint?'спринт-уикенд':'уикенд'}</span></h1>
  <div class="sub">${fmtD(first.started)} · ${window.modeBadge(first)}</div>
  <div class="bar">${ws.map(s=>`<a href="#/session/${s.uid}" class="chip" style="text-decoration:none">${esc(qLabel(s.type))} ›</a>`).join('')}</div>
  ${meQ>=0||meR?`<div class="cards">
    ${card(quali.length?'Квалификация':'Спринт-квалификация',meQ>=0?`P${meQ+1}`:'—',meQ>=0?`<div class="sub" style="margin:2px 0 0">${esc(qLabel(Q[qs.rows[meQ].seg].type))}</div>`:'')}
    ${card('Старт',meR?`P${meR.grid}`:'—',meR&&meR.grid_penalty>0?`<div style="margin-top:4px"><span class="tag inv">штраф +${meR.grid_penalty} поз.</span></div>`:'')}
    ${card(race?'Финиш':'Финиш спринта',meR?(STATUS[meR.status]||`P${meR.pos}`):'—')}
    ${card('Отыграно',meR&&meR.grid&&meR.status===3?((meR.grid-meR.pos>0?'+':'')+(meR.grid-meR.pos)):'—')}
    ${card(race?'Лучший круг гонки':'Лучший круг спринта',meR?fmt(meR.best_ms):'—')}</div>`:''}
  ${qualiTable(shoot,'Спринт-квалификация',false)}
  ${resultTable(sprint,'Спринт')}
  ${qualiTable(quali,'Квалификация',!!race)}
  ${quali.length&&race?'<div class="sub" style="margin-top:8px">Итог квалификации — место в последнем сегменте, где пилот участвовал. «Старт в гонке» и штраф считаются по стартовой позиции из итогов гонки.</div>':''}
  ${resultTable(race,'Гонка')}`;
}

window.extraRoutes=a=>({weekend:()=>weekendPage(a),sessions:sessionsPage,seasons:seasonsPage,season:()=>seasonPage(a),new:()=>newSessionPage(a)});
