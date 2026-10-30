/* События сессии (штрафы, столкновения, обгоны, сейфти-кар, лучший круг…), погода, сводка — для вкладок
   «Обзор» и «События» страницы сессии. Использует глобальные хелперы из index.html. */
const PEN_TYPE={0:'проезд по пит-лейну',1:'стоп-энд-гоу',2:'штраф на решётке',3:'напоминание о штрафе',4:'штраф по времени',
  5:'предупреждение',6:'дисквалификация',7:'снят с прогревочного круга',8:'таймер стоянки',9:'правила о шинах',
  10:'круг аннулирован',11:'аннулированы этот и следующий круг',12:'круг аннулирован',13:'аннулированы этот и следующий круг',
  14:'аннулированы этот и предыдущий круг',15:'аннулированы этот и предыдущий круг',16:'сход',17:'чёрный флаг'};
const INFRINGE={0:'блокировка медленной ездой',1:'езда против движения',2:'откат на старте',3:'сильное столкновение',
  4:'небольшое столкновение',5:'не вернул позицию после столкновения',6:'не вернул позиции после столкновения',
  7:'срезка с выигрышем времени',8:'обгон через срезку',9:'обгоны через срезку',10:'пересёк линию выезда с пит-лейна',
  11:'игнорирование синих флагов',12:'игнорирование жёлтых флагов',13:'не отбыл проезд по пит-лейну',
  14:'слишком много проездов по пит-лейну',15:'отбыть проезд за N кругов',16:'отбыть проезд на этом круге',
  17:'превышение скорости на пит-лейне',18:'слишком долгая стоянка',19:'нарушение правил о шинах',20:'слишком много штрафов',
  21:'много предупреждений',22:'близко к дисквалификации',23:'выбор шин',24:'выбор шин',25:'срезка',26:'выезд за пределы трассы',
  27:'срезка: небольшой выигрыш',28:'срезка: заметный выигрыш',29:'срезка: большой выигрыш',30:'езда по стене',
  31:'флешбэк',32:'возврат на трассу',33:'блокировка пит-лейна',34:'фальстарт',35:'столкновение с машиной безопасности',
  36:'обгон под сейфти-каром',37:'превышение темпа под SC',38:'превышение темпа под VSC',39:'медленно на прогревочном круге',
  40:'остановка на прогревочном круге',41:'поломка',42:'повреждения',43:'отстал от сейфти-кара',44:'чёрный флаг',
  45:'не отбыл стоп-энд-гоу',46:'не отбыл проезд по пит-лейну',47:'замена узла двигателя',48:'замена коробки передач',
  49:'нарушение parc fermé',50:'штраф лиги',51:'штраф за перезапуск',52:'незаконный выигрыш времени',53:'обязательный пит-стоп'};
const RETIRE={1:'сошёл',3:'повреждения',5:'мало кругов',6:'чёрный флаг',7:'красный флаг',8:'поломка'};
const WEATHER={0:'Ясно',1:'Малооблачно',2:'Пасмурно',3:'Слабый дождь',4:'Сильный дождь',5:'Ливень'};
const EV_KIND={PENA:['pen','ШТРАФ','#ff4747'],COLL:['coll','СТОЛКНОВЕНИЕ','#ff9f43'],OVTK:['ovtk','ОБГОН','#3471E9'],
  FTLP:['fast','ЛУЧШИЙ КРУГ','#b46bff'],SCAR:['flag','СЕЙФТИ-КАР','#ffd23f'],RDFL:['flag','КРАСНЫЙ ФЛАГ','#ff4747'],
  RTMT:['flag','СХОД','#636270'],LGOT:['flag','СТАРТ','#5EC61B'],CHQF:['flag','ФИНИШ','#c0c1db'],RCWN:['flag','ПОБЕДА','#DCBE55'],
  DTSV:['pen','ШТРАФ ОТБЫТ','#636270'],SGSV:['pen','ШТРАФ ОТБЫТ','#636270'],FLBK:['flag','ФЛЕШБЭК','#636270'],
  TMPT:['flag','НАПАРНИК В БОКСАХ','#636270'],DMG:['coll','ПОВРЕЖДЕНИЕ','#ff9f43'],FIX:['coll','РЕМОНТ','#2fa36b']};
const PART_NAMES={fwl:'переднее крыло (лев.)',fwr:'переднее крыло (прав.)',rw:'заднее крыло',floor:'днище',diff:'диффузор',
  pod:'понтоны',gbox:'коробка передач',eng:'двигатель',drs:'отказ DRS',ers:'отказ ERS',blown:'двигатель взорван',seized:'двигатель заклинил'};
const FAULTS=['drs','ers','blown','seized'];
const evInfo=e=>{try{return e.info?JSON.parse(e.info):{}}catch{return {}}};
const isWarning=e=>e.code==='PENA'&&[5,10,11,12,13,14,15].includes(evInfo(e).type);  // предупреждения и аннулированные круги
const fmtT=t=>t==null?'':`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let evFilter='all';

function eventText(e,nm,meCar){
  const i=evInfo(e), n=c=>c==null?'':`<b${c===meCar?' style="color:#8fb3ff"':''}>${esc(nm(c))}</b>`;
  switch(e.code){
    case 'PENA':{const pen=PEN_TYPE[i.type]||`штраф #${i.type}`, inf=INFRINGE[i.infringement]||`нарушение #${i.infringement}`;
      const amount=i.type===4&&e.value&&e.value<255?` +${e.value} с`:i.type===2&&i.places?` +${i.places} поз.`:'';
      return `${n(e.car)}: ${pen}${amount} — ${inf}${e.other!=null?` (с ${n(e.other)})`:''}`}
    case 'COLL': return `${n(e.car)} и ${n(e.other)} — контакт`;
    case 'OVTK': return `${n(e.car)} обгоняет ${n(e.other)}`;
    case 'FTLP': return `${n(e.car)} — лучший круг ${fmt(Math.round(e.value*1000))}`;
    case 'SCAR':{const t={1:'Сейфти-кар',2:'Виртуальный сейфти-кар',3:'Машина прогревочного круга'}[i.type]||'Сейфти-кар';
      return `${t}: ${{0:'выехал',1:'заезжает в боксы',2:'заехал',3:'рестарт гонки'}[i.event]||'событие'}`}
    case 'RDFL': return 'Красный флаг — гонка остановлена';
    case 'RTMT': return `${n(e.car)} сошёл${RETIRE[i.reason]?` (${RETIRE[i.reason]})`:''}`;
    case 'LGOT': return 'Стартовые огни погасли — гонка началась';
    case 'CHQF': return 'Клетчатый флаг';
    case 'RCWN': return `Победитель — ${n(e.car)}`;
    case 'DTSV': return `${n(e.car)} отбыл проезд по пит-лейну`;
    case 'SGSV': return `${n(e.car)} отбыл стоп-энд-гоу`;
    case 'FLBK': return `Флешбэк к ${fmtT(e.value)}`;
    case 'TMPT': return `Напарник ${n(e.car)} заехал в боксы`;
    case 'DMG': case 'FIX':{const p=Object.entries(i.parts||{}).map(([k,[a,b]])=>FAULTS.includes(k)?PART_NAMES[k]:`${PART_NAMES[k]||k} ${a}% → ${b}%`).join(', ');
      return e.code==='DMG'?`${n(e.car)}: ${p}`:`${n(e.car)} — починили: ${p}`}
  }
  return e.code;
}

/* сводка для «Обзора»: погода + главное по мне */
function overviewHTML(s,R,meCar){
  const ev=R.events||[], mine=e=>e.car===meCar||e.other===meCar;
  const ci=(R.car_info||[]).find(c=>c.car===meCar)||{};
  const ovMade=ev.filter(e=>e.code==='OVTK'&&e.car===meCar).length, ovLost=ev.filter(e=>e.code==='OVTK'&&e.other===meCar).length;
  const coll=ev.filter(e=>e.code==='COLL'&&mine(e)).length;
  const pens=ev.filter(e=>e.code==='PENA'&&e.car===meCar&&!isWarning(e));
  const lastFast=[...ev].reverse().find(e=>e.code==='FTLP');
  const fc=(()=>{try{return JSON.parse(s.forecast||'[]')}catch{return []}})();
  const card=(k,v,sub='')=>`<div class="card"><div class="k">${k}</div><div class="v" style="font-size:22px">${v}</div>${sub?`<div class="sub" style="margin:2px 0 0">${sub}</div>`:''}</div>`;
  let h='';
  if(s.weather!=null) h+=`<h2>Погода</h2><div class="bar"><span class="chip fill">${WEATHER[s.weather]||'—'}</span>
    <span class="chip">Трасса ${s.track_temp}°C</span><span class="chip">Воздух ${s.air_temp}°C</span>
    ${fc.length?`<span class="sub" style="margin:0">прогноз:</span>${fc.slice(0,6).map(f=>`<span class="chip" title="трасса ${f[2]}°, воздух ${f[3]}°">+${f[0]} мин · ${WEATHER[f[1]]||'—'}${f[4]?` · дождь ${f[4]}%`:''}</span>`).join('')}`:''}</div>`;
  if(ev.length&&meCar!=null) h+=`<h2>Главное в сессии</h2><div class="cards">
    ${card('Обгоны',`${ovMade} / ${ovLost}`,'сделал / потерял позицию')}
    ${card('Контакты',coll)}
    ${card('Предупреждения',ci.warnings??ev.filter(e=>isWarning(e)&&e.car===meCar).length,ci.cut_warnings?`срезок: ${ci.cut_warnings}`:'')}
    ${card('Штрафы',pens.length?pens.map(e=>e.value&&e.value<255?`+${e.value} с`:PEN_TYPE[evInfo(e).type]).join(', '):'нет')}
    ${card('Макс. скорость',ci.speed_trap?`${Math.round(ci.speed_trap)} км/ч`:'—',ci.speed_trap_lap?`на ${ci.speed_trap_lap}-м круге`:'')}
    ${lastFast?card('Лучший круг сессии',fmt(Math.round(lastFast.value*1000)),esc(R.drivers.find(d=>d.car===lastFast.car)?.name||'')):''}</div>`;
  return h;
}

/* вкладка «События»: лента по кругам с фильтром + штрафы/предупреждения и спидтрап по пилотам */
function eventsHTML(R,nm,meCar){
  const ev=(R.events||[]).filter(e=>!['SPTP','SSTA','SEND','STLG','BUTN'].includes(e.code));
  if(!ev.length&&!(R.car_info||[]).length) return '';
  const filt={all:()=>true,mine:e=>e.car===meCar||e.other===meCar,pen:e=>['PENA','DTSV','SGSV'].includes(e.code),
    coll:e=>['COLL','DMG','FIX'].includes(e.code),ovtk:e=>e.code==='OVTK',fast:e=>e.code==='FTLP',flag:e=>['SCAR','RDFL','RTMT','LGOT','CHQF','RCWN'].includes(e.code)};
  const counts=Object.fromEntries(Object.entries(filt).map(([k,f])=>[k,ev.filter(f).length]));
  const shown=ev.filter(filt[evFilter]||filt.all);
  const byLap={};shown.forEach(e=>(byLap[e.lap??0]??=[]).push(e));
  const tabs=[['all','Все'],['mine','Мои'],['pen','Штрафы'],['coll','Контакты и повреждения'],['ovtk','Обгоны'],['fast','Лучшие круги'],['flag','Флаги и старт']];
  let h=`<h2>Лента событий</h2><div class="bar">${tabs.filter(([k])=>counts[k]||k==='all').map(([k,t])=>`<button class="${evFilter===k?'':'ghost'}" data-evf="${k}" style="min-width:0">${t} · ${counts[k]}</button>`).join('')}</div>`;
  h+=shown.length?Object.keys(byLap).sort((a,b)=>a-b).map(lap=>`<div class="panel" style="margin-bottom:10px;padding:10px 14px">
    <div style="font:700 15px var(--display);margin-bottom:6px;color:var(--peri)">${+lap?`Круг ${lap}`:'До старта'}</div>
    ${byLap[lap].map(e=>{const [,label,col]=EV_KIND[e.code]||['','СОБЫТИЕ','#636270'],warn=isWarning(e);
      return `<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line);${e.car===meCar||e.other===meCar?'background:rgba(52,113,233,.12);margin:0 -14px;padding:6px 14px':''}">
        <span style="color:var(--mute);min-width:42px;font-variant-numeric:tabular-nums">${fmtT(e.t)}</span>
        <span class="status" style="background:${warn?'#d0a23a':col};color:${['#ffd23f','#c0c1db','#DCBE55','#5EC61B'].includes(col)||warn?'#141724':'#fff'};min-width:118px;text-align:center">${warn?'ПРЕДУПРЕЖДЕНИЕ':label}</span>
        <span>${eventText(e,nm,meCar)}</span></div>`}).join('')}</div>`).join('')
    :'<div class="empty" style="padding:24px">Событий этого типа нет</div>';
  // штрафы и спидтрап по пилотам
  const ci=(R.car_info||[]).filter(c=>c.warnings||c.cut_warnings||c.penalty_s||c.speed_trap);
  if(ci.length){
    const top=Math.max(...ci.map(c=>c.speed_trap||0));
    h+=`<h2>Штрафы, предупреждения, спидтрап</h2><div class="panel"><table><thead><tr><th>Пилот<th>Штраф<th>Предупреждения<th>Срезки<th>Макс. скорость<th>Круг</tr></thead><tbody>
    ${[...ci].sort((a,b)=>(b.speed_trap||0)-(a.speed_trap||0)).map(c=>`<tr style="${c.car===meCar?'background:rgba(52,113,233,.28)':''}"><td>${esc(nm(c.car))}<td>${c.penalty_s?`<span class="tag inv">+${c.penalty_s} с</span>`:'—'}<td>${c.warnings||'—'}<td>${c.cut_warnings||'—'}<td class="${c.speed_trap===top?'p':''}">${c.speed_trap?c.speed_trap.toFixed(1)+' км/ч':'—'}<td>${c.speed_trap_lap||'—'}`).join('')}</tbody></table></div>`;
  }
  return h;
}

/* отрыв по кругам для вкладки «Круги»: я, выбранный соперник и все остальные тонкими линиями */
function gapsHTML(R,meCar,cmpCar,nm){
  const laps={};(R.laps||[]).forEach(l=>{if(l.gap_leader!=null)(laps[l.car]??=[]).push(l)});
  if(!Object.keys(laps).length||meCar==null||!laps[meCar]) return '';
  // на пит-лейне игра отдаёт отрыв 0 — у не-лидера это «неизвестно», точку пропускаем
  const known=l=>l.pos===1||l.gap_leader>0;
  const pts=c=>(laps[c]||[]).filter(known).map(l=>[l.lap,l.gap_leader/1000]);
  const series=[...Object.keys(laps).map(Number).filter(c=>c!==meCar&&c!==cmpCar).map(c=>({name:nm(c),color:'#555b6e',width:1,opacity:.5,label:false,points:pts(c)})),
    ...(cmpCar!=null&&laps[cmpCar]?[{name:nm(cmpCar),color:'#4aa8ff',width:3,dots:true,points:pts(cmpCar)}]:[]),
    {name:nm(meCar),color:'#e10600',width:3,dots:true,points:pts(meCar)}];
  const mine=laps[meCar];
  return `<h2>Отставание от лидера по кругам</h2>
    <div class="sub">На финише каждого круга. Соперник для сравнения выбирается на вкладке «Соперники».</div>
    <div class="chart">${lineChart(series,{yMin:0,invert:true,yFmt:v=>'+'+v.toFixed(1)+' с'})}</div>
    <div class="panel" style="margin-top:12px"><table><thead><tr><th>Круг<th>Позиция<th>До машины впереди<th>До лидера</tr></thead><tbody>
    ${mine.map(l=>`<tr><td>${l.lap}<td>P${l.pos??'—'}<td>${l.pos===1?'лидер':known(l)?'+'+(l.gap_front/1000).toFixed(3)+' с':'— (пит-лейн)'}<td>${l.pos===1||!known(l)?'—':'+'+(l.gap_leader/1000).toFixed(3)+' с'}`).join('')}</tbody></table></div>`;
}
