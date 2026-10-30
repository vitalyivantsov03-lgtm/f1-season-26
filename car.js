/* Вкладка «Машина»: схема повреждений, шины и тормоза, топливо и ERS, износ узлов силовой установки.
   Данные — состояние каждой машины на конец круга (car_state) и износ шин (car_wear). */
let carSel=null,carLap=null,carUid=null;
const WHEEL=[['ПЛ','Перед. левая','#ff9f43'],['ПП','Перед. правая','#ffd23f'],['ЗЛ','Зад. левая','#4aa8ff'],['ЗП','Зад. правая','#2fd67b']];
const PU_PARTS=[['ice','ДВС'],['mguh','MGU-H'],['mguk','MGU-K'],['es','Батарея (ES)'],['ce','Электроника (CE)'],['tc','Турбина (TC)']];
const nf=(v,d=0)=>v==null||isNaN(v)?'—':(+v).toFixed(d);
// 0% — приглушённый зелёный, 50% — жёлтый, 100% — красный
const dmgCol=p=>{if(p==null)return '#3a3f55';p=Math.min(Math.max(p,0),100);
  return `hsl(${Math.round(140-1.4*p)},${Math.round(45+.3*p)}%,${Math.round(30+.2*p)}%)`};

/* машина сверху: крылья, днище, понтоны, диффузор и колёса окрашены по повреждению/износу */
function carSVG(d,w){
  d=d||{};
  const t=(x,y,v,size=13)=>`<text x="${x}" y="${y}" text-anchor="middle" style="font:700 ${size}px var(--display,sans-serif);fill:#fff;paint-order:stroke;stroke:rgba(20,23,36,.55);stroke-width:2px">${v==null?'':Math.round(v)+'%'}</text>`;
  const r=(x,y,wd,h,rx,p,label,extra='')=>`<rect x="${x}" y="${y}" width="${wd}" height="${h}" rx="${rx}" fill="${dmgCol(p)}" stroke="#141724" stroke-width="2" ${extra}><title>${label}: ${p==null?'нет данных':Math.round(p)+'%'}</title></rect>`;
  const wheel=(x,y,wd,h,i)=>{const v=w?w[i]:null;return r(x,y,wd,h,12,v,WHEEL[i][1]+' шина — износ')+t(x+wd/2,y+h/2+5,v)};
  return `<svg viewBox="0 0 320 600" width="100%" style="max-width:300px;display:block;margin:auto">
    <polygon points="60,215 260,215 264,470 56,470" fill="${dmgCol(d.floor)}" opacity=".55" stroke="#141724" stroke-width="2"><title>Днище: ${d.floor??'—'}%</title></polygon>
    ${t(160,486,d.floor,11)}
    ${r(72,240,56,170,24,d.pod,'Понтоны')}${r(192,240,56,170,24,d.pod,'Понтоны')}${t(100,330,d.pod,12)}${t(220,330,d.pod,12)}
    <polygon points="146,52 174,52 170,172 150,172" fill="#4a5070" stroke="#141724" stroke-width="2"/>
    <rect x="134" y="165" width="52" height="300" rx="22" fill="#4a5070" stroke="#141724" stroke-width="2"/>
    <ellipse cx="160" cy="245" rx="15" ry="24" fill="#141724"/>
    ${r(142,300,36,110,10,d.eng,'Двигатель (повреждение)')}${r(146,418,28,46,8,d.gbox,'Коробка передач')}
    ${r(40,20,118,34,6,d.fwl,'Переднее крыло слева')}${r(162,20,118,34,6,d.fwr,'Переднее крыло справа')}
    ${t(99,42,d.fwl)}${t(221,42,d.fwr)}
    ${wheel(18,88,60,104,0)}${wheel(242,88,60,104,1)}${wheel(14,426,66,112,2)}${wheel(240,426,66,112,3)}
    <polygon points="108,478 212,478 224,522 96,522" fill="${dmgCol(d.diff)}" stroke="#141724" stroke-width="2"><title>Диффузор: ${d.diff??'—'}%</title></polygon>${t(160,505,d.diff,11)}
    ${r(70,540,180,36,6,d.rw,'Заднее крыло')}${t(160,563,d.rw)}
  </svg>
  <div style="max-width:300px;margin:8px auto 0"><div style="height:8px;border-radius:4px;background:linear-gradient(90deg,${dmgCol(0)},${dmgCol(50)},${dmgCol(100)})"></div>
  <div class="sub" style="display:flex;justify-content:space-between;margin:2px 0 0"><span>0%</span><span>повреждение / износ</span><span>100%</span></div></div>`;
}

function carHTML(R,nm,meCar,uid){
  const rows=R.car_state||[]; if(!rows.length) return '';
  const byCar={}; rows.forEach(r=>(byCar[r.car]??=[]).push(r));
  const wearOf={}; (R.car_wear||[]).forEach(w=>(wearOf[w.car]??=[]).push(w));
  if(meCar!=null&&!wearOf[meCar]&&R.wear.length) wearOf[meCar]=R.wear;
  // у игроков с «Your Telemetry: Restricted» нет топлива, температур и износа — только нули
  const hidden=c=>byCar[c].every(r=>r.fuel==null&&!r.temps)&&(wearOf[c]||[]).every(x=>!x.fl&&!x.fr&&!x.rl&&!x.rr);
  const cars=R.drivers.filter(d=>byCar[d.car]);
  if(carUid!==uid){carUid=uid;carSel=null;carLap=null}
  if(carSel==null||!byCar[carSel]) carSel=byCar[meCar]?meCar:cars[0]?.car;
  const S=byCar[carSel]||[];
  if(carLap==null||!S.some(r=>r.lap===carLap)) carLap=S[S.length-1]?.lap;
  const cur=S.find(r=>r.lap===carLap)||{}, d=cur.dmg, tm=cur.temps;
  const wl=(wearOf[carSel]||[]).find(x=>x.lap===carLap), wear=wl?[wl.fl,wl.fr,wl.rl,wl.rr]:null;
  const opts=cars.map(d=>`<option value="${d.car}"${d.car===carSel?' selected':''}>${d.pos?d.pos+'. ':''}${esc(d.name)}${d.car===meCar?' (я)':''}${hidden(d.car)?' — скрыто':''}</option>`).join('');
  let h=`<h2>Машина</h2><div class="bar"><select id="carSel">${opts}</select>
    <select id="carLap">${S.map(r=>`<option value="${r.lap}"${r.lap===carLap?' selected':''}>после ${r.lap}-го круга</option>`).join('')}</select>
    <span class="sub" style="margin:0">состояние на финише выбранного круга</span></div>`;
  if(hidden(carSel)) return h+`<div class="empty" style="padding:24px">${esc(nm(carSel))}: данные машины скрыты — у игрока в настройках телеметрии стоит «Your Telemetry: Restricted»</div>`;

  const card=(k,v,sub='')=>`<div class="card"><div class="k">${k}</div><div class="v" style="font-size:22px">${v}</div>${sub?`<div class="sub" style="margin:2px 0 0">${sub}</div>`:''}</div>`;
  const prev=S[S.indexOf(cur)-1], used=prev&&prev.fuel!=null&&cur.fuel!=null?prev.fuel-cur.fuel:null;
  h+=`<div class="cards">
    ${card('Топливо',cur.fuel!=null?nf(cur.fuel,1)+' кг':'—',used!=null&&used>0?`расход за круг ${nf(used,2)} кг`:'')}
    ${card('Запас топлива',cur.fuel_laps!=null?(cur.fuel_laps>0?'+':'')+nf(cur.fuel_laps,1)+' кр.':'—',cur.fuel_laps!=null?(cur.fuel_laps>=0?'хватает до финиша':'не хватает до финиша'):'')}
    ${card('Батарея ERS',cur.ers!=null?nf(cur.ers,1)+' МДж':'—',cur.ers!=null?`заряд ${Math.round(cur.ers/4*100)}%`:'')}
    ${card('ERS за круг',cur.harvested!=null?`+${nf(cur.harvested,1)} / −${nf(cur.deployed,1)}`:'—','собрано / отдано, МДж')}
    ${card('Баланс тормозов',cur.bias?cur.bias+'%':'—','вперёд')}</div>`;

  // схема + таблица по колёсам и узлы
  const row=(label,arr,f=v=>v,hint='')=>`<tr><td title="${hint}">${label}${arr?arr.map(v=>`<td>${v==null?'—':f(v)}`).join(''):'<td>—<td>—<td>—<td>—'}`;
  const pair=(a,b,u)=>a&&b?a.map((v,i)=>`${v} / ${b[i]}${u}`):null;
  const bar=(label,p,fault)=>`<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><div style="width:160px">${label}</div>
    <div style="flex:1;height:10px;background:var(--panel2);border-radius:5px;overflow:hidden"><div style="width:${Math.min(p||0,100)}%;height:100%;background:${dmgCol(p)}"></div></div>
    <div style="width:46px;text-align:right;font-variant-numeric:tabular-nums">${p==null?'—':p+'%'}</div>${fault?`<span class="tag inv">${fault}</span>`:''}</div>`;
  h+=`<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:14px">
    <div class="panel" style="flex:0 1 300px;min-width:240px;padding:14px">${carSVG(d,wear)}</div>
    <div style="flex:1 1 420px;min-width:0">
      <div class="panel" style="overflow-x:auto"><table><thead><tr><th>Колёса${WHEEL.map(w=>`<th style="color:${w[2]}">${w[0]}`).join('')}</tr></thead><tbody>
        ${row('Износ шины',wear,v=>v.toFixed(0)+'%')}
        ${row('Повреждение шины',d?.tyre,v=>v+'%')}
        ${row('Пузыри',d?.blister,v=>v+'%','вздутие протектора от перегрева')}
        ${row('Поверхность, °C',pair(tm?.surf,tm?.surf_max,''),v=>v,'средняя / максимальная за круг')}
        ${row('Каркас, °C',tm?.inner,v=>v,'средняя за круг')}
        ${row('Давление, psi',tm?.press,v=>v.toFixed(1),'среднее за круг')}
        ${row('Тормоза, °C',pair(tm?.brake,tm?.brake_max,''),v=>v,'средняя / максимальная за круг')}
        ${row('Износ тормозов',d?.brake,v=>v+'%')}
      </tbody></table></div>
      ${d?`<div class="panel" style="margin-top:12px;padding:12px 14px">
        <div style="font:700 15px var(--display);color:var(--peri);margin-bottom:4px">Силовая установка и трансмиссия <span class="sub" style="font:inherit;font-size:12px;font-weight:400">износ узлов</span></div>
        ${PU_PARTS.map(([k,t])=>bar(t,d.parts?.[k])).join('')}
        ${bar('Коробка передач',d.gbox)}${bar('Двигатель (повр.)',d.eng,d.blown?'взорван':d.seized?'заклинил':'')}
        ${d.drs||d.ers?`<div style="margin-top:6px">${d.drs?'<span class="tag inv">отказ DRS</span>':''}${d.ers?'<span class="tag inv">отказ ERS</span>':''}</div>`:''}
      </div>`:''}
    </div></div>`;

  // графики по кругам
  const pts=k=>S.filter(r=>r[k]!=null).map(r=>[r.lap,r[k]]);
  // четыре колеса идут близко — подписи у концов линий налезали бы друг на друга, поэтому легенда сверху
  const wheelLines=k=>WHEEL.map(([,t,c],i)=>({name:t,color:c,dots:true,label:false,points:S.filter(r=>r.temps).map(r=>[r.lap,r.temps[k][i]])}));
  const legend=`<div class="sub" style="margin:4px 0 8px">${WHEEL.map(([,t,c])=>`<span style="display:inline-block;width:12px;height:3px;background:${c};vertical-align:middle;margin-right:5px"></span>${t}`).join(' &nbsp; ')}</div>`;
  const lapX={xLabel:x=>x};
  if(S.some(r=>r.fuel!=null)) h+=`<h2>Топливо по кругам</h2><div class="chart">${lineChart([{name:'Топливо',color:'#ff9f43',width:3,dots:true,points:pts('fuel')}],{...lapX,yMin:0,yFmt:v=>v.toFixed(1)+' кг'})}</div>`;
  if(S.some(r=>r.harvested!=null)) h+=`<h2>ERS по кругам</h2><div class="sub">Собрано и отдано за круг, заряд батареи на финише круга (МДж). Батарея вмещает 4 МДж.</div>
    <div class="chart">${lineChart([{name:'Собрано',color:'#2fd67b',dots:true,width:3,points:pts('harvested')},{name:'Отдано',color:'#ff4747',dots:true,width:3,points:pts('deployed')},
      {name:'Батарея',color:'#4aa8ff',dots:true,points:pts('ers')}],{...lapX,yMin:0,yFmt:v=>v.toFixed(1)})}</div>`;
  if(S.some(r=>r.temps)){
    h+=`<h2>Температура шин</h2><div class="sub">Средняя температура поверхности за круг, °C.</div>${legend}<div class="chart">${lineChart(wheelLines('surf'),{...lapX,yFmt:v=>Math.round(v)+'°'})}</div>`;
    h+=`<h2>Температура тормозов</h2><div class="sub">Средняя за круг, °C.</div>${legend}<div class="chart">${lineChart(wheelLines('brake'),{...lapX,yFmt:v=>Math.round(v)+'°'})}</div>`;
  }
  // история повреждений этой машины из ленты событий
  const dev=(R.events||[]).filter(e=>(e.code==='DMG'||e.code==='FIX'||e.code==='COLL')&&(e.car===carSel||e.other===carSel));
  if(dev.length) h+=`<h2>История повреждений</h2><div class="panel" style="padding:6px 14px">${dev.map(e=>{const [,label,col]=EV_KIND[e.code];
    return `<div style="display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line)"><span style="color:var(--mute);min-width:64px">${e.lap?'круг '+e.lap:''}</span>
      <span class="status" style="background:${col};color:#fff;min-width:118px;text-align:center">${label}</span><span>${eventText(e,nm,meCar)}</span></div>`}).join('')}</div>`;
  return h;
}

function bindCar(box,draw){
  const s=box.querySelector('#carSel'),l=box.querySelector('#carLap');
  if(s) s.onchange=()=>{carSel=+s.value;carLap=null;draw()};
  if(l) l.onchange=()=>{carLap=+l.value;draw()};
}
