/* Гараж: мои настройки машины (вкладка «Настройки» и архив на странице трассы), комплекты шин
   на уикенд (вкладка «Стратегия») и Time Trial (вкладка «Обзор»). */
const SETUP_GROUPS=[
  ['Аэродинамика',[['fw','Переднее крыло'],['rw','Заднее крыло']]],
  ['Трансмиссия',[['diff_on','Дифференциал на газу','%'],['diff_off','Дифференциал без газа','%'],['engine_braking','Торможение двигателем','%']]],
  ['Геометрия подвески',[['camber_f','Развал передних','°',2],['camber_r','Развал задних','°',2],['toe_f','Схождение передних','°',2],['toe_r','Схождение задних','°',2]]],
  ['Подвеска',[['susp_f','Жёсткость передней подвески'],['susp_r','Жёсткость задней подвески'],['arb_f','Передний стабилизатор'],
    ['arb_r','Задний стабилизатор'],['height_f','Клиренс спереди'],['height_r','Клиренс сзади']]],
  ['Тормоза',[['brake_press','Давление в тормозах','%'],['brake_bias','Баланс тормозов','%']]],
  ['Шины',[['press_fl','Давление ПЛ',' psi',1],['press_fr','Давление ПП',' psi',1],['press_rl','Давление ЗЛ',' psi',1],['press_rr','Давление ЗП',' psi',1]]],
  ['Прочее',[['ballast','Балласт'],['fuel','Топливо','',1]]]];
const SESS_SHORT={1:'P1',2:'P2',3:'P3',4:'Практика',5:'Q1',6:'Q2',7:'Q3',8:'Квалификация',9:'Квал. 1 круг',10:'SQ1',11:'SQ2',12:'SQ3',
  13:'Спринт-квал.',14:'Спринт-квал. 1 круг',15:'Гонка',16:'Гонка 2',17:'Гонка 3',18:'Time Trial'};
let setupIdx=null,setupUid=null,archSel=null;
const sv=(v,f)=>v==null?'—':(f?(+v).toFixed(f):v);

/* таблицы настроек по группам; cmp — с чем сравнить (изменённые параметры подсвечены) */
function setupTables(s,cmp,cmpLabel){
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">${SETUP_GROUPS.map(([g,fields])=>`
    <div class="panel" style="padding:10px 14px"><div style="font:700 15px var(--display);color:var(--peri);margin-bottom:4px">${g}</div>
    ${fields.map(([k,label,unit='',f])=>{const ch=cmp&&cmp[k]!=null&&cmp[k]!==s[k], d=ch?s[k]-cmp[k]:0;
      return `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--line)">
        <span style="color:${ch?'var(--text)':'var(--mute)'}">${label}</span>
        <span style="font-variant-numeric:tabular-nums;white-space:nowrap">${ch?`<span style="color:var(--mute);text-decoration:line-through;margin-right:6px" title="${esc(cmpLabel)}">${sv(cmp[k],f)}</span>`:''}
          <b style="${ch?`color:${d>0?'#2fd67b':'#ff9f43'}`:''}">${sv(s[k],f)}${unit}</b>${ch?`<span class="tag" style="margin-left:6px">${d>0?'+':''}${f?d.toFixed(f):d}</span>`:''}</span></div>`}).join('')}</div>`).join('')}</div>`;
}

/* вкладка «Настройки» сессии */
function setupHTML(R,uid){
  const S=R.setups||[]; if(!S.length) return '';
  if(setupUid!==uid){setupUid=uid;setupIdx=null}
  if(setupIdx==null||setupIdx>=S.length) setupIdx=S.length-1;
  const cur=S[setupIdx], before=setupIdx>0?S[setupIdx-1]:null, prev=R.prev_setup;
  const cmp=before||prev?.setup, cmpLabel=before?`до ${cur.lap?cur.lap+'-го круга':'изменения'}`:prev?`прошлый раз: ${fmtD(prev.started)} ${prev.type}`:'';
  const nChanged=cmp?SETUP_GROUPS.flatMap(([,f])=>f).filter(([k])=>cmp[k]!=null&&cmp[k]!==cur[k]).length:0;
  let h=`<h2>Настройки машины</h2>`;
  if(S.length>1) h+=`<div class="bar">${S.map((x,i)=>`<button class="${i===setupIdx?'':'ghost'}" data-setup="${i}" style="min-width:0">${i?`с ${x.lap?x.lap+'-го круга':'изменения '+i}`:'начальные'}</button>`).join('')}
    <span class="sub" style="margin:0">настройки менялись по ходу сессии</span></div>`;
  h+=`<div class="sub">${cmp?(nChanged?`Изменено параметров: <b style="color:var(--text)">${nChanged}</b> — по сравнению с «${esc(cmpLabel)}». Зачёркнуто — было, цветом — стало.`
    :`Без изменений по сравнению с «${esc(cmpLabel)}».`):'Первые записанные настройки на этой трассе — сравнивать пока не с чем.'}</div>`;
  return h+setupTables(cur,cmp,cmpLabel);
}
function bindSetup(box,draw){box.querySelectorAll('[data-setup]').forEach(b=>b.onclick=()=>{setupIdx=+b.dataset.setup;draw()})}

/* комплекты шин на уикенд — для «Стратегии» */
function tyreSetsHTML(R){
  const T=R.tyre_sets; if(!T||!T.sets?.length) return '';
  const order=[16,17,18,7,8], byC={}; T.sets.forEach((s,i)=>(byC[s.visual]??=[]).push({...s,i}));
  const tile=s=>{const name=VIS[s.visual]||s.visual, col=TYRE[name]||'#777', fitted=s.i===T.fitted, gone=!s.available&&!fitted;
    return `<div title="${name}: износ ${s.wear}%, ресурс ${s.life} из ${s.usable} кр.${s.session?', рекомендован на '+(SESS_SHORT[s.session]||s.session):''}"
      style="width:112px;padding:10px;border-radius:8px;background:var(--panel2);${fitted?'outline:2px solid var(--text);':''}${gone?'opacity:.35;':''}text-align:center">
      <div style="width:44px;height:44px;margin:0 auto 6px;border-radius:50%;border:7px solid ${col};box-sizing:border-box;display:grid;place-items:center;font:700 12px var(--display)">${s.wear}%</div>
      <div style="font-size:13px">${fitted?'<b>стоит</b>':gone?'недоступен':s.wear?'б/у':'новый'}</div>
      <div class="sub" style="margin:2px 0 0;font-size:12px">${s.life}/${s.usable} кр.${!fitted&&s.delta?` · ${s.delta>0?'+':''}${(s.delta/1000).toFixed(2)} с`:''}</div>
      ${s.session?`<div class="sub" style="margin:2px 0 0;font-size:11px">${SESS_SHORT[s.session]||s.session}</div>`:''}</div>`};
  return `<h2>Комплекты шин на уикенд</h2><div class="sub">Износ, оставшийся ресурс в кругах, разница в темпе с тем комплектом, что стоит сейчас, и на какую сессию игра его рекомендует.
    Блёклые — уже недоступны (сданы).</div>
    <div class="panel" style="padding:12px 14px">${order.filter(c=>byC[c]).map(c=>`<div style="display:flex;align-items:center;gap:10px;margin:6px 0;flex-wrap:wrap">
      <div style="width:80px;font-weight:700;color:${TYRE[VIS[c]]}">${VIS[c]}</div>${byC[c].map(tile).join('')}</div>`).join('')}</div>`;
}

/* Time Trial — для «Обзора» */
function ttHTML(R){
  const T=R.time_trial; if(!T) return '';
  const assists=x=>[x.tc?`TC ${x.tc===2?'полный':'средний'}`:'без TC',x.abs?'ABS':'без ABS',{1:'ручная КПП',2:'ручная с подсказкой',3:'автомат КПП'}[x.gearbox]||'',
    x.equal?'равные машины':'',x.custom?'свои настройки':'стандартные настройки',x.valid?'':'недействителен'].filter(Boolean).map(t=>`<span class="tag">${t}</span>`).join(' ');
  const card=(k,x,ref)=>x?`<div class="card"><div class="k">${k}</div><div class="v ${k==='Личный рекорд'?'p':''}" style="font-size:24px">${fmt(x.lap)}</div>
    <div class="sub" style="margin:2px 0 4px">${fmtS(x.s1)} · ${fmtS(x.s2)} · ${fmtS(x.s3)}${ref&&ref!==x?` · <b style="color:${x.lap<=ref.lap?'#2fd67b':'#ff7b7b'}">${dS(x.lap-ref.lap)}</b> к рекорду`:''}</div>
    <div style="line-height:1.9">${assists(x)}</div></div>`:'';
  return `<h2>Time Trial</h2><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    ${card('Лучший в сессии',T.session,T.personal)}${card('Личный рекорд',T.personal)}${card('Соперник',T.rival,T.personal)}</div>`;
}

/* архив настроек на странице трассы */
window.trackSetups=async function(track){
  const G=await api('/api/track_setups?track='+enc(track)).catch(()=>[]);
  if(!G.length) return;
  const box=document.createElement('div'); app.appendChild(box);
  if(!archSel||archSel.track!==track) archSel={track,a:0,b:G.length>1?1:null};
  const draw=()=>{
    const A=G[archSel.a], B=archSel.b!=null?G[archSel.b]:null;
    box.innerHTML=`<h2>Настройки на этой трассе</h2><div class="sub">Одинаковые настройки разных сессий объединены. Клик по строке — показать эти настройки в сравнении с теми, что были показаны до этого; повторный клик — убрать сравнение.</div>
    <div class="panel"><table><thead><tr><th>#<th>Лучший круг<th>Сессии<th>Крылья<th>Дифф.<th>Баланс<th></tr></thead><tbody>
    ${G.map((g,i)=>`<tr class="click" data-g="${i}" style="${i===archSel.a?'background:rgba(255,71,71,.14)':i===archSel.b?'background:rgba(74,168,255,.14)':''}">
      <td>${i+1}<td class="${i?'':'p'}">${fmt(g.best)}<td>${g.sessions.map(s=>`${fmtD(s.started)} ${esc(s.type)}`).join('<br>')}
      <td>${g.setup.fw} / ${g.setup.rw}<td>${g.setup.diff_on}% / ${g.setup.diff_off}%<td>${g.setup.brake_bias}%
      <td>${i===archSel.a?'<span class="tag pb">показаны</span>':i===archSel.b?'<span class="tag">сравнение</span>':''}`).join('')}</tbody></table></div>
    <h3 style="margin:18px 0 10px">Настройки №${archSel.a+1}${B?` <span style="color:var(--mute);font-weight:400">в сравнении с №${archSel.b+1}</span>`:''}</h3>
    ${setupTables(A.setup,B?.setup,B?`настройки №${archSel.b+1}`:'')}`;
    box.querySelectorAll('tr[data-g]').forEach(tr=>tr.onclick=()=>{const i=+tr.dataset.g;
      if(i===archSel.a) archSel.b=null; else {archSel.b=archSel.a;archSel.a=i}  // прежние показанные — для сравнения
      draw()});
  };
  draw();
};
