/* Данные по всем машинам сессии: темп соперников, сравнение кругов, позиции по кругам,
   пит-стопы и стинты шин, износ моих шин. Использует глобальные хелперы из index.html. */
const VIS={16:'Soft',17:'Medium',18:'Hard',7:'Inter',8:'Wet'};
const LINE_COLORS=['#4aa8ff','#2fd67b','#ffd23f','#ff9f43','#00d2d3','#ff7bd5','#c8d6e5','#a3e635'];
let cmpA=null,cmpB=null,cmpUid=null,wearA=null,wearB=null;

/* универсальный линейный график: series=[{name,color,width,points:[[x,y],...]}] */
function lineChart(series,{h=260,yFmt=v=>v,invert=false,yMin=null,yMax=null,xLabel=x=>x}={}){
  const pts=series.flatMap(s=>s.points); if(!pts.length) return '<div class="empty">Нет данных</div>';
  const w=1100,L=64,R=110,T=12,B=26;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=yMin??Math.min(...ys),y1=yMax??Math.max(...ys);
  const X=x=>L+(x1===x0?(w-L-R)/2:(x-x0)*(w-L-R)/(x1-x0));
  const Y=y=>{const k=(y1===y0?.5:(y-y0)/(y1-y0));return T+(invert?k:1-k)*(h-T-B)};
  let g='';
  for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4;g+=`<line x1="${L}" x2="${w-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2a2d38"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end">${yFmt(v)}</text>`}
  const step=Math.max(1,Math.ceil((x1-x0)/20));
  for(let x=x0;x<=x1;x+=step) g+=`<text x="${X(x)}" y="${h-6}" text-anchor="middle">${xLabel(x)}</text>`;
  for(const s of series){
    if(!s.points.length) continue;
    g+=`<polyline fill="none" stroke="${s.color}" stroke-width="${s.width||2}" opacity="${s.opacity??1}" points="${s.points.map(p=>X(p[0])+','+Y(p[1])).join(' ')}"><title>${esc(s.name)}</title></polyline>`;
    if(s.dots) s.points.forEach(p=>g+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="${s.color}"><title>${esc(s.name)}: ${xLabel(p[0])} — ${yFmt(p[1])}</title></circle>`);
    if(s.label!==false){const p=s.points[s.points.length-1];g+=`<text x="${X(p[0])+6}" y="${Y(p[1])+4}" style="fill:${s.color}">${esc(s.name)}</text>`}
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">${g}</svg>`;
}
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
const dS=v=>v==null||isNaN(v)?'—':(v>0?'+':'')+(v/1e3).toFixed(3);

window.sessionRace=async function(s){
  const R=await api('/api/race?uid='+enc(s.uid));
  if(!R.drivers.length&&!R.wear.length&&!(R.events||[]).length) return;
  const laps={}; R.laps.forEach(l=>(laps[l.car]??=[]).push(l));
  const drv=Object.fromEntries(R.drivers.map(d=>[d.car,d]));
  const nm=c=>(drv[c]||{name:'Car '+c}).name;
  const me=R.drivers.find(d=>d.me);
  const maxLap=Math.max(0,...R.laps.map(l=>l.lap),...R.wear.map(w=>w.lap));
  // круг заезда в боксы и круг выезда — не показатель темпа, в средние и графики не берём
  const pitLap=(c,l)=>R.pits.some(p=>p.car===c&&(l===p.lap||l===p.lap+1));
  const clean=(c,l)=>l.valid&&l.time_ms&&!pitLap(c,l.lap);
  // статистика темпа по каждому пилоту
  const stat=c=>{const v=(laps[c]||[]).filter(l=>clean(c,l)),t=k=>v.map(l=>l[k]).filter(Boolean);
    return {best:min(t('time_ms')),b1:min(t('s1')),b2:min(t('s2')),b3:min(t('s3')),
      med:median(t('time_ms')),n:(laps[c]||[]).length,pits:R.pits.filter(p=>p.car===c).length};};
  const S=Object.fromEntries(R.drivers.map(d=>[d.car,stat(d.car)]));
  const fin=n=>isFinite(n)&&n>0;
  const top=k=>Math.min(...R.drivers.map(d=>S[d.car][k]).filter(fin));
  const stintsOf=c=>R.stints.filter(x=>x.car===c);
  const chips=c=>stintsOf(c).map(x=>`<span class="tyre" title="${VIS[x.visual]||x.visual}" style="border-color:${TYRE[VIS[x.visual]]||'#777'}"></span>`).join('');

  // кого сравнивать по умолчанию: я против другого человека, иначе против лидера
  if(cmpUid!==s.uid){
    cmpUid=s.uid; cmpA=me?me.car:R.drivers[0]?.car;
    const human=R.drivers.find(d=>!d.ai&&!d.me), leader=R.drivers.find(d=>d.car!==cmpA);
    cmpB=(human||leader||{}).car??null;
  }

  const wearOf={}; (R.car_wear||[]).forEach(w=>(wearOf[w.car]??=[]).push(w));
  if(me&&!wearOf[me.car]&&R.wear.length) wearOf[me.car]=R.wear;
  // у игрока с «Your Telemetry: Restricted» игра присылает нули на всех кругах
  const wearHidden=c=>{const w=wearOf[c]||[];return w.length>1&&w.every(x=>!x.fl&&!x.fr&&!x.rl&&!x.rr)};
  const lastWear=c=>{const w=wearOf[c];if(!w||wearHidden(c))return w?'скрыт':'—';const l=w[w.length-1];return Math.max(l.fl,l.fr,l.rl,l.rr).toFixed(0)+'%'};
  const box=document.createElement('div'); app.appendChild(box);
  const draw=()=>{
    let html=`<div data-tab="overview">${overviewHTML(s,R,me?.car)}</div><div data-tab="rivals">`;
    if(R.laps.length){
      const bt=top('best'),b1=top('b1'),b2=top('b2'),b3=top('b3');
      const cell=(v,best,f)=>`<td class="${fin(v)&&v===best?'p':''}">${fin(v)?f(v):'—'}`;
      html+=`<h2>Темп всех пилотов <span class="tag">клик по строке — сравнить с ним</span></h2>
      <div class="panel"><table><thead><tr><th>Поз<th>Пилот<th>Команда<th>Лучший<th>S1<th>S2<th>S3<th>Медиана<th>Кругов<th>Питы<th>Шины<th>Износ</tr></thead><tbody>
      ${R.drivers.map(d=>{const x=S[d.car];return `<tr class="click" data-car="${d.car}" style="${d.me?'background:rgba(180,107,255,.12)':d.car===cmpB?'background:rgba(74,168,255,.12)':''}">
        <td>${d.pos??'—'}<td>${esc(d.name)}${d.me?'<span class="tag pb">я</span>':d.ai?'':'<span class="tag">игрок</span>'}<td>${esc(d.team||'')}
        ${cell(x.best,bt,fmt)}${cell(x.b1,b1,fmtS)}${cell(x.b2,b2,fmtS)}${cell(x.b3,b3,fmtS)}<td>${x.med?fmt(x.med):'—'}<td>${x.n}<td>${d.pits??x.pits}<td>${chips(d.car)}<td title="Самая изношенная шина на последнем круге">${lastWear(d.car)}`}).join('')}
      </tbody></table></div>`;

      // сравнение двух пилотов по кругам
      const opt=cur=>R.drivers.map(d=>`<option value="${d.car}"${d.car===cur?' selected':''}>${esc(d.name)}</option>`).join('');
      const A=laps[cmpA]||[],Bl=laps[cmpB]||[],byLap=Object.fromEntries(Bl.map(l=>[l.lap,l]));
      const both=A.filter(l=>byLap[l.lap]);
      const ok=both.filter(l=>clean(cmpA,l)&&clean(cmpB,byLap[l.lap]));
      const avgD=k=>{const v=ok.filter(l=>l[k]&&byLap[l.lap][k]).map(l=>l[k]-byLap[l.lap][k]);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
      const card=(k,v)=>`<div class="card"><div class="k">${k}</div><div class="v ${v==null?'':v<=0?'g':'bad-v'}" style="${v>0?'color:#ff7b7b':''}">${dS(v)}</div></div>`;
      const pace=c=>({name:nm(c),color:c===cmpA?'#e10600':'#4aa8ff',dots:true,points:(laps[c]||[]).filter(l=>clean(c,l)).map(l=>[l.lap,l.time_ms])});
      html+=`<h2>Сравнение кругов</h2>
      <div class="bar"><select id="cmpA">${opt(cmpA)}</select> против <select id="cmpB">${opt(cmpB)}</select>
        <span class="sub" style="margin:0">Δ = первый минус второй: минус — первый быстрее. Круги с питом и недействительные в средние не входят.</span></div>
      <div class="cards">${card('Средняя Δ круга',avgD('time_ms'))}${card('Средняя Δ S1',avgD('s1'))}${card('Средняя Δ S2',avgD('s2'))}${card('Средняя Δ S3',avgD('s3'))}
        <div class="card"><div class="k">Лучший круг</div><div class="v" style="font-size:16px">${fmt(S[cmpA]?.best)} / ${fmt(S[cmpB]?.best)}</div></div></div>
      <div class="chart" style="margin-top:12px">${lineChart([pace(cmpA),pace(cmpB)],{yFmt:fmt,xLabel:x=>x})}</div>
      ${both.length?`<div class="panel" style="margin-top:12px"><table><thead><tr><th>Круг<th>${esc(nm(cmpA))}<th>${esc(nm(cmpB))}<th>Δ круг<th>Δ S1<th>Δ S2<th>Δ S3<th>Позиции</tr></thead><tbody>
      ${both.map(a=>{const b=byLap[a.lap],d=k=>a[k]&&b[k]?a[k]-b[k]:null,col=v=>v==null?'':v<0?'g':'',bad=!(a.valid&&b.valid);
        const pit=[cmpA,cmpB].filter(c=>pitLap(c,a.lap)).map(c=>`<span class="tag">пит: ${esc(nm(c))}</span>`).join('');
        return `<tr class="${bad?'bad':''}"><td>${a.lap}${pit}<td>${fmt(a.time_ms)}<td>${fmt(b.time_ms)}<td class="${col(d('time_ms'))}">${dS(d('time_ms'))}<td class="${col(d('s1'))}">${dS(d('s1'))}<td class="${col(d('s2'))}">${dS(d('s2'))}<td class="${col(d('s3'))}">${dS(d('s3'))}<td>${a.pos??'—'} / ${b.pos??'—'}`}).join('')}
      </tbody></table></div>`:'<div class="sub" style="margin-top:8px">Нет общих кругов для сравнения.</div>'}`;

      // позиции по кругам
      if(R.laps.some(l=>l.pos)){
        const others=R.drivers.filter(d=>d.car!==cmpA&&d.car!==cmpB);
        const posSeries=d=>{const p=(laps[d.car]||[]).filter(l=>l.pos).map(l=>[l.lap,l.pos]);if(d.grid)p.unshift([0,d.grid]);return p};
        const series=[...others.map(d=>({name:d.name,color:'#555b6e',width:1,opacity:.6,label:false,points:posSeries(d)})),
          ...[cmpB,cmpA].filter(c=>drv[c]).map(c=>({name:nm(c),color:c===cmpA?'#e10600':'#4aa8ff',width:3,points:posSeries(drv[c])}))];
        html+=`<h2>Позиции по кругам</h2><div class="chart">${lineChart(series,{invert:true,yMin:1,yMax:Math.max(...R.drivers.map(d=>d.grid||0),...R.laps.map(l=>l.pos||0)),yFmt:v=>'P'+Math.round(v),xLabel:x=>x?x:'старт'})}</div>`;
      }
    }

    html+='</div><div data-tab="strategy">';
    // стратегия: стинты и пит-стопы
    if(R.stints.length||R.pits.length){
      const total=Math.max(maxLap,...R.stints.map(x=>x.end_lap===255?0:x.end_lap))||1;
      const bar=c=>{let from=0;return stintsOf(c).map(x=>{const end=x.end_lap===255||x.end_lap>total?total:x.end_lap,wdt=Math.max(0,end-from)/total*100;
        const html=`<div title="${VIS[x.visual]||x.visual}: круги ${from+1}–${end}" style="width:${wdt}%;background:${TYRE[VIS[x.visual]]||'#777'};opacity:.85;height:14px;border-right:2px solid var(--bg)"></div>`;from=end;return html}).join('')};
      html+=`<h2>Стратегия и пит-стопы</h2><div class="panel" style="padding:12px 14px">
      ${R.drivers.filter(d=>stintsOf(d.car).length).map(d=>`<div style="display:flex;align-items:center;gap:10px;margin:5px 0">
        <div style="width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${d.me?'color:var(--purple);font-weight:700':''}">${d.pos?d.pos+'. ':''}${esc(d.name)}</div>
        <div style="flex:1;display:flex;background:var(--panel2);border-radius:4px;overflow:hidden">${bar(d.car)}</div></div>`).join('')||'<div class="sub">Стинтов пока нет.</div>'}
      <div class="sub" style="margin:8px 0 0">${Object.entries(VIS).map(([,v])=>`<span class="tyre" style="border-color:${TYRE[v]}"></span>${v}`).join(' &nbsp; ')}</div></div>
      ${R.pits.length?`<div class="panel" style="margin-top:12px"><table><thead><tr><th>Пилот<th>Круг<th>Время на пит-лейне<th>Стоянка</tr></thead><tbody>
      ${R.pits.map(p=>`<tr style="${drv[p.car]?.me?'background:rgba(180,107,255,.12)':''}"><td>${esc(nm(p.car))}<td>${p.lap}<td>${p.lane_ms?(p.lane_ms/1e3).toFixed(2)+' с':'—'}<td>${p.stop_ms?(p.stop_ms/1e3).toFixed(2)+' с':'—'}`).join('')}
      </tbody></table></div>`:''}`;
    }

    // износ шин: любой пилот + сравнение с соперником (у живых игроков может быть скрыт настройкой телеметрии)
    if(Object.keys(wearOf).length){
      if(wearA==null||!wearOf[wearA]) wearA=me&&wearOf[me.car]?me.car:+Object.keys(wearOf)[0];
      if(wearB!=null&&!wearOf[wearB]) wearB=null;
      const tyres=[['fl','Перед. левая','#ff9f43'],['fr','Перед. правая','#ffd23f'],['rl','Зад. левая','#4aa8ff'],['rr','Зад. правая','#2fd67b']];
      const W=wearOf[wearA], hidden=wearHidden(wearA), last=W[W.length-1];
      // темп износа: по последнему отрезку без сброса (после пита износ падает)
      let i0=W.length-1; while(i0>0&&W[i0-1].fl<=W[i0].fl+0.5&&W[i0-1].rl<=W[i0].rl+0.5) i0--;
      const seg=W.slice(i0), rate=k=>seg.length>1?(seg[seg.length-1][k]-seg[0][k])/(seg[seg.length-1].lap-seg[0].lap):null;
      const opts=(cur,none)=>(none?`<option value="">— без сравнения —</option>`:'')+R.drivers.filter(d=>wearOf[d.car]).map(d=>`<option value="${d.car}"${d.car===cur?' selected':''}>${esc(d.name)}${d.me?' (я)':''}${wearHidden(d.car)?' — скрыто':''}</option>`).join('');
      const avg=w=>(w.fl+w.fr+w.rl+w.rr)/4;
      const cmp=!hidden&&wearB!=null&&!wearHidden(wearB)?[{name:nm(wearA),color:'#e10600',width:3,dots:true,points:W.map(w=>[w.lap,avg(w)])},
        {name:nm(wearB),color:'#4aa8ff',width:3,dots:true,points:wearOf[wearB].map(w=>[w.lap,avg(w)])}]:null;
      html+=`<h2>Износ шин</h2>
      <div class="bar"><select id="wearA">${opts(wearA)}</select> сравнить с <select id="wearB">${opts(wearB,true)}</select></div>
      ${hidden?`<div class="empty" style="padding:24px">${esc(nm(wearA))}: износ скрыт — у игрока в настройках телеметрии стоит «Your Telemetry: Restricted»</div>`:`
      <div class="cards">${tyres.map(([k,t])=>`<div class="card"><div class="k">${t}</div><div class="v">${last[k].toFixed(0)}%</div>
        <div class="sub" style="margin:2px 0 0">${rate(k)!=null?'≈ '+rate(k).toFixed(1)+'% за круг':''}</div></div>`).join('')}</div>
      <div class="chart" style="margin-top:12px">${lineChart(tyres.map(([k,t,c])=>({name:t,color:c,dots:true,points:W.map(w=>[w.lap,w[k]])})),{yMin:0,yFmt:v=>v.toFixed(0)+'%'})}</div>`}
      ${cmp?`<h3 style="margin:18px 0 8px">Средний износ: ${esc(nm(wearA))} против ${esc(nm(wearB))}</h3><div class="chart">${lineChart(cmp,{yMin:0,yFmt:v=>v.toFixed(0)+'%'})}</div>`
        :wearB!=null&&wearHidden(wearB)?`<div class="sub" style="margin-top:10px">${esc(nm(wearB))}: износ скрыт настройкой телеметрии игрока.</div>`:''}
      ${hidden?'':`<div class="panel" style="margin-top:12px"><table><thead><tr><th>Круг<th>ПЛ<th>ПП<th>ЗЛ<th>ЗП<th>Макс.${cmp?`<th>Макс. у ${esc(nm(wearB))}`:''}</tr></thead><tbody>
      ${W.map(w=>{const o=cmp?wearOf[wearB].find(x=>x.lap===w.lap):null;return `<tr><td>${w.lap}<td>${w.fl}%<td>${w.fr}%<td>${w.rl}%<td>${w.rr}%<td><b>${Math.max(w.fl,w.fr,w.rl,w.rr)}%</b>${cmp?`<td>${o?Math.max(o.fl,o.fr,o.rl,o.rr)+'%':'—'}`:''}`}).join('')}</tbody></table></div>`}`;
    }
    html+=`</div><div data-tab="events">${eventsHTML(R,nm,me?.car)}</div><div data-tab="laps">${gapsHTML(R,me?.car,cmpB,nm)}</div>`;
    box.innerHTML=html;
    box.querySelectorAll('[data-evf]').forEach(b=>b.onclick=()=>{evFilter=b.dataset.evf;draw()});
    if(window.applyTab&&$('#stabs')?.innerHTML) applyTab();
    const a=box.querySelector('#cmpA'),b=box.querySelector('#cmpB');
    if(a){a.onchange=()=>{cmpA=+a.value;draw()};b.onchange=()=>{cmpB=+b.value;draw()}}
    const wa=box.querySelector('#wearA'),wb=box.querySelector('#wearB');
    if(wa){wa.onchange=()=>{wearA=+wa.value;draw()};wb.onchange=()=>{wearB=wb.value===''?null:+wb.value;draw()}}
    box.querySelectorAll('tr[data-car]').forEach(tr=>tr.onclick=()=>{cmpB=+tr.dataset.car;draw();box.querySelector('#cmpA')?.scrollIntoView({behavior:'smooth',block:'center'})});
  };
  draw();
};
