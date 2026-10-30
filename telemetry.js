/* Вкладка «Телеметрия»: графики круга по дистанции (скорость, газ, тормоз, передача, руль), сравнение двух
   кругов с дельтой времени, карта трассы и разбор поворотов. Список кругов — /api/traces, точки — /api/trace. */
let teleA=null,teleB=null,teleUid=null,teleT=[];
const traceCache={};
const TA='#ff4747',TB='#4aa8ff',STEP=5;  // цвета кругов А и Б; шаг сетки по дистанции, м
const TW=1100,TL=56,TR=14;               // ширина графиков и отступы оси Y
let tv=null;                             // то, что сейчас нарисовано: сетки А/Б, границы, проекция карты

const teleKey=t=>t.car+':'+t.lap;
const getTrace=(uid,key)=>{const [car,lap]=key.split(':');
  return traceCache[uid+'/'+key]??=api(`/api/trace?uid=${enc(uid)}&car=${car}&lap=${lap}`)};

/* значение трассы в точке d (линейно; передача — ступенькой) */
function traceAt(tr,k,d){
  const D=tr.d; let lo=0,hi=D.length-1;
  if(d<=D[0]) return tr[k][0]; if(d>=D[hi]) return tr[k][hi];
  while(hi-lo>1){const m=(lo+hi)>>1; if(D[m]<=d) lo=m; else hi=m}
  if(k==='g') return tr[k][lo];
  const f=D[hi]===D[lo]?0:(d-D[lo])/(D[hi]-D[lo]);
  return tr[k][lo]+(tr[k][hi]-tr[k][lo])*f;
}
/* круг на общей сетке через каждые STEP метров — так два круга сравниваются точка в точку */
function traceGrid(tr,d0,d1){
  const K=['t','v','thr','brk','g','st','x','z','gl'],o={d:[]};K.forEach(k=>o[k]=[]);
  for(let d=d0;d<=d1;d+=STEP){o.d.push(d);K.forEach(k=>o[k].push(traceAt(tr,k,d)))}
  return o;
}
/* повороты: точки минимальной скорости, перед которыми машина сбросила хотя бы 15 км/ч */
function findCorners(g){
  const v=g.v,n=v.length,W=Math.round(120/STEP),back=Math.round(500/STEP),out=[];
  for(let i=W;i<n-W;i++){
    let isMin=true;
    for(let j=i-W;j<=i+W&&isMin;j++) if(v[j]<v[i]||(v[j]===v[i]&&j<i)) isMin=false;
    if(isMin&&Math.max(...v.slice(Math.max(0,i-back),i))-v[i]>=15) out.push(i);
  }
  return out;
}
/* начало торможения перед апексом (индекс сетки) или null, если поворот проходится без тормоза */
function brakeStart(g,apex){
  const lim=Math.max(0,apex-Math.round(400/STEP));
  let j=apex; while(j>lim&&g.brk[j]<=10) j--;
  if(g.brk[j]<=10) return null;
  while(j>0&&g.brk[j-1]>10) j--;
  return j;
}
const pct=(a,f)=>Math.round(a.filter(f).length/a.length*100);

/* график по дистанции; у всех графиков общая ось X, чтобы курсор двигался по ним синхронно */
function traceSVG(series,{h=120,yMin,yMax,yFmt=v=>Math.round(v),ticks=4,step=false,marks=[],xAxis=false,zero=false}){
  const T=8,B=xAxis?20:6,{d0,d1}=tv;
  const X=d=>TL+(d-d0)/(d1-d0)*(TW-TL-TR), Y=v=>T+(1-(v-yMin)/((yMax-yMin)||1))*(h-T-B);
  let g='';
  for(let i=0;i<=ticks;i++){const v=yMin+(yMax-yMin)*i/ticks;
    g+=`<line x1="${TL}" x2="${TW-TR}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2a2d38"/><text x="${TL-6}" y="${Y(v)+4}" text-anchor="end">${yFmt(v)}</text>`}
  if(zero) g+=`<line x1="${TL}" x2="${TW-TR}" y1="${Y(0)}" y2="${Y(0)}" stroke="#636270" stroke-width="1.5"/>`;
  marks.forEach(([d,label])=>g+=`<line x1="${X(d)}" x2="${X(d)}" y1="${T}" y2="${h-B}" stroke="#3a3f55" stroke-dasharray="3 4"/>${label?`<text x="${X(d)}" y="${T+10}" text-anchor="middle" style="fill:var(--peri);font-weight:700">${label}</text>`:''}`);
  if(xAxis) for(let d=Math.ceil(d0/500)*500;d<=d1;d+=500) g+=`<text x="${X(d)}" y="${h-4}" text-anchor="middle">${d?(d/1000).toFixed(1)+' км':'0'}</text>`;
  for(const s of series){
    const pts=[];s.y.forEach((v,i)=>{const x=X(tv.ga.d[i]).toFixed(1);
      if(step&&i) pts.push(x+','+Y(s.y[i-1]).toFixed(1)); pts.push(x+','+Y(v).toFixed(1))});
    g+=`<polyline fill="none" stroke="${s.color}" stroke-width="${s.width||1.6}" stroke-linejoin="round" points="${pts.join(' ')}"/>`;
  }
  g+=`<line class="tcur" x1="0" x2="0" y1="${T}" y2="${h-B}" stroke="#fff" stroke-width="1" visibility="hidden"/>`;
  return `<svg class="tsvg" viewBox="0 0 ${TW} ${h}" width="100%" style="display:block;cursor:crosshair;touch-action:pan-y">${g}</svg>`;
}

/* карта трассы по координатам круга А: с кругом Б — кто быстрее на каждом отрезке, без него — скорость */
function trackMap(ga,gb,cs){
  const xs=ga.x,zs=ga.z,x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  const W=360,pad=18,k=(W-2*pad)/Math.max(x1-x0,z1-z0,1),H=Math.round((z1-z0)*k+2*pad),w=Math.round((x1-x0)*k+2*pad);
  const P=i=>[(pad+(xs[i]-x0)*k).toFixed(1),(pad+(zs[i]-z0)*k).toFixed(1)];
  tv.proj=P;
  const n=xs.length,chunk=Math.round(50/STEP);
  const colorAt=i=>{
    if(gb){const j0=Math.floor(i/chunk)*chunk,j1=Math.min(n-1,j0+chunk);
      const gain=(ga.t[j1]-ga.t[j0])-(gb.t[j1]-gb.t[j0]);return Math.abs(gain)<4?'#8a8fa8':gain<0?TA:TB}
    const f=Math.min(Math.max((ga.v[i]-80)/260,0),1);return `hsl(${Math.round(220-220*f)},80%,55%)`};
  let g='',run=[P(0)],col=colorAt(0);
  for(let i=1;i<n;i++){const c=colorAt(i);run.push(P(i));
    if(c!==col||i===n-1){g+=`<polyline fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${run.map(p=>p.join(',')).join(' ')}"/>`;run=[P(i)];col=c}}
  const [sx,sy]=P(0);
  g=`<polyline fill="none" stroke="#141724" stroke-width="12" stroke-linejoin="round" points="${xs.map((_,i)=>P(i).join(',')).join(' ')}"/>`+g;
  g+=`<rect x="${sx-7}" y="${sy-7}" width="14" height="14" rx="3" fill="#fff"><title>Старт/финиш</title></rect>`;
  cs.forEach((a,i)=>{const [cx,cy]=P(a);g+=`<circle cx="${cx}" cy="${cy}" r="9" fill="#272C40" stroke="#C0C1DB"/><text x="${cx}" y="${+cy+4}" text-anchor="middle" style="font:700 10px var(--font);fill:#fff">${i+1}</text>`});
  g+=`<circle id="teleDot" r="7" fill="#fff" stroke="#141724" stroke-width="3" visibility="hidden"/>`;
  const legend=gb?`<span style="color:${TA}">■</span> быстрее А &nbsp; <span style="color:${TB}">■</span> быстрее Б &nbsp; <span style="color:#8a8fa8">■</span> поровну`
    :`<span style="color:hsl(220,80%,55%)">■</span> медленно → <span style="color:hsl(0,80%,55%)">■</span> быстро`;
  return `<svg viewBox="0 0 ${w} ${H}" width="100%" style="display:block;max-height:420px">${g}</svg><div class="sub" style="margin:6px 0 0;font-size:13px">${legend}</div>`;
}

function teleHTML(T,R,nm,meCar,uid){
  teleT=T; if(!T.length) return '';
  if(teleUid!==uid){teleUid=uid;teleA=null;teleB=null}
  const byTime=[...T].filter(t=>t.time_ms).sort((a,b)=>a.time_ms-b.time_ms);
  const mine=T.filter(t=>t.car===meCar), myBest=byTime.find(t=>t.car===meCar&&t.valid);
  const has=k=>T.some(t=>teleKey(t)===k);
  if(!teleA||!has(teleA)) teleA=teleKey(myBest||mine[0]||byTime[0]||T[0]);
  if(teleB!==''&&(!teleB||!has(teleB))){const a=+teleA.split(':')[0];
    const rival=byTime.find(t=>t.car!==a&&t.valid), second=byTime.find(t=>t.car===a&&teleKey(t)!==teleA);
    teleB=rival?teleKey(rival):second?teleKey(second):''}
  const best=Math.min(...byTime.filter(t=>t.valid).map(t=>t.time_ms));
  const label=t=>`${t.car===meCar?'Я':esc(nm(t.car))} · круг ${t.lap} · ${fmt(t.time_ms)}${t.time_ms===best?' ★':''}${t.valid?'':' (недейств.)'}`;
  const opts=cur=>[...mine,...byTime.filter(t=>t.car!==meCar)].map(t=>`<option value="${teleKey(t)}"${teleKey(t)===cur?' selected':''}>${label(t)}</option>`).join('');
  return `<h2>Телеметрия круга</h2>
    <div class="bar"><span style="color:${TA};font-weight:700">А</span><select id="teleA">${opts(teleA)}</select>
      <span style="color:${TB};font-weight:700">Б</span><select id="teleB"><option value="">— без сравнения —</option>${opts(teleB)}</select></div>
    <div class="sub">Все твои круги и лучший круг каждого соперника. Наведи на график — точка покажет место на карте.</div>
    <div id="teleView"><div class="empty" style="padding:24px">Загрузка телеметрии…</div></div>`;
}

async function renderTele(box,uid,nm,meCar){
  const view=box.querySelector('#teleView'); if(!view) return;
  const keyA=teleA,keyB=teleB;
  const [a,b]=await Promise.all([getTrace(uid,keyA),keyB?getTrace(uid,keyB):null]);
  if(keyA!==teleA||keyB!==teleB||!view.isConnected) return;  // пока грузилось, выбрали другой круг
  if(!a.d?.length){view.innerHTML='<div class="empty">Нет данных телеметрии</div>';return}
  const d0=Math.ceil(Math.max(a.d[0],b?.d?.[0]??0)/STEP)*STEP, d1=Math.floor(Math.min(a.d[a.d.length-1],b?.d?.length?b.d[b.d.length-1]:1e9)/STEP)*STEP;
  tv={d0,d1}; tv.ga=traceGrid(a,d0,d1); tv.gb=b?.d?.length?traceGrid(b,d0,d1):null;
  const {ga,gb}=tv, cs=findCorners(ga), marks=cs.map((i,k)=>[ga.d[i],String(k+1)]);
  const who=k=>{const [car,lap]=k.split(':');return `${+car===meCar?'Я':nm(+car)}, круг ${lap}`};
  tv.names=[who(keyA),keyB?who(keyB):''];
  const lapTime=k=>{const t=teleT.find(x=>teleKey(x)===k);return t?.time_ms};  // официальное время круга
  const lapA=lapTime(keyA), lapB=keyB?lapTime(keyB):null;
  const card=(k,va,vb,sub='')=>`<div class="card"><div class="k">${k}</div><div class="v" style="font-size:20px"><span style="color:${TA}">${va}</span>${gb?` <span style="color:var(--mute)">/</span> <span style="color:${TB}">${vb}</span>`:''}</div>${sub?`<div class="sub" style="margin:2px 0 0">${sub}</div>`:''}</div>`;
  let h=`<div class="cards">
    ${card('Круг',fmt(lapA),lapB?fmt(lapB):'—',lapA&&lapB?`разница ${dS(lapA-lapB)} с`:'')}
    ${card('Макс. скорость',Math.round(Math.max(...ga.v))+' км/ч',gb?Math.round(Math.max(...gb.v))+' км/ч':'')}
    ${card('Полный газ',pct(ga.thr,v=>v>=98)+'%',gb?pct(gb.thr,v=>v>=98)+'%':'','доля дистанции')}
    ${card('Торможение',pct(ga.brk,v=>v>10)+'%',gb?pct(gb.brk,v=>v>10)+'%':'','доля дистанции')}
    ${card('Макс. перегрузка',Math.max(...ga.gl.map(Math.abs)).toFixed(1)+' g',gb?Math.max(...gb.gl.map(Math.abs)).toFixed(1)+' g':'','боковая')}</div>`;

  const S=(k,width)=>[{y:ga[k],color:TA,width},...(gb?[{y:gb[k],color:TB,width}]:[])];
  const vMax=Math.ceil(Math.max(...ga.v,...(gb?gb.v:[]))/50)*50, gMax=Math.max(8,...ga.g,...(gb?gb.g:[]));
  const lbl=t=>`<div class="sub" style="margin:10px 0 2px;font-size:13px;font-weight:700;color:var(--peri)">${t}</div>`;
  let charts=lbl('Скорость, км/ч')+traceSVG(S('v',2),{h:220,yMin:0,yMax:vMax,marks,xAxis:true});
  if(gb){const delta=ga.t.map((t,i)=>(t-gb.t[i])/1000), m=Math.max(.1,...delta.map(Math.abs));
    charts+=lbl('Дельта А − Б, с · ниже нуля — А впереди')+traceSVG([{y:delta,color:'#e8e9f3',width:2}],{h:110,yMin:-m,yMax:m,yFmt:v=>(v>0?'+':'')+v.toFixed(2),ticks:2,zero:true,marks:marks.map(([d])=>[d])})}
  charts+=lbl('Газ, %')+traceSVG(S('thr'),{h:80,yMin:0,yMax:100,ticks:2,marks:marks.map(([d])=>[d])});
  charts+=lbl('Тормоз, %')+traceSVG(S('brk'),{h:80,yMin:0,yMax:100,ticks:2,marks:marks.map(([d])=>[d])});
  charts+=lbl('Передача')+traceSVG(S('g'),{h:90,yMin:0,yMax:gMax,ticks:2,step:true,marks:marks.map(([d])=>[d])});
  charts+=lbl('Руль, % · минус — влево')+traceSVG(S('st'),{h:90,yMin:-100,yMax:100,ticks:2,zero:true,marks:marks.map(([d])=>[d]),xAxis:true});

  // карта первой в разметке и row-reverse: на широком экране она справа, на узком — над графиками
  h+=`<div style="display:flex;flex-direction:row-reverse;flex-wrap:wrap;gap:16px;margin-top:14px;align-items:flex-start">
    <div style="flex:1 1 300px;max-width:420px;min-width:0;position:sticky;top:10px;margin-left:auto">
      <div class="panel" style="padding:12px">${trackMap(ga,gb,cs)}</div>
      <div id="teleRead" class="panel" style="margin-top:10px;padding:10px 14px;font-size:14px;line-height:1.6;min-height:84px"><span class="sub">Наведи на график, чтобы увидеть значения в точке трассы.</span></div>
    </div>
    <div class="panel" style="flex:1 1 560px;min-width:0;padding:10px 14px">${charts}</div></div>`;

  // разбор поворотов
  if(cs.length){
    const bound=k=>k<0?0:k>=cs.length-1?ga.d.length-1:Math.round((cs[k]+cs[k+1])/2);
    const exitI=i=>Math.min(ga.d.length-1,i+Math.round(150/STEP));
    const rows=cs.map((ap,k)=>{const s=bound(k-1),e=bound(k);
      const seg=g=>g?(g.t[e]-g.t[s]):null, delta=gb?seg(ga)-seg(gb):null;
      const bA=brakeStart(ga,ap), bB=gb?brakeStart(gb,ap):null;
      const minB=gb?Math.min(...gb.v.slice(Math.max(0,ap-Math.round(60/STEP)),ap+Math.round(60/STEP))):null;
      return {k,ap,delta,minA:ga.v[ap],minB,bA,bB,exA:ga.v[exitI(ap)],exB:gb?gb.v[exitI(ap)]:null,
        gl:Math.max(...ga.gl.slice(s,e+1).map(Math.abs))}});
    const worst=gb?Math.max(...rows.map(r=>r.delta)):0;
    const two=(x,y,f=v=>Math.round(v),none='—')=>`<span style="color:${TA}">${x==null?none:f(x)}</span>${gb?` / <span style="color:${TB}">${y==null?none:f(y)}</span>`:''}`;
    h+=`<h2>Повороты</h2><div class="sub">Повороты найдены по провалам скорости и пронумерованы по порядку от старта — номера могут не совпадать с официальными.
      Отрезок поворота — от середины до середины между соседними поворотами.</div>
      <div class="panel"><table><thead><tr><th>#<th>Где<th>Начало торможения<th>Мин. скорость<th>Выход (+150 м)<th>Перегрузка А${gb?'<th>Δ на отрезке':''}</tr></thead><tbody>
      ${rows.map(r=>{const late=r.bA!=null&&r.bB!=null?(r.bA-r.bB)*STEP:null;
        return `<tr class="click" data-d="${ga.d[r.ap]}" style="${gb&&r.delta===worst&&worst>20?'background:rgba(255,71,71,.12)':''}"><td><b>${r.k+1}</b><td>${(ga.d[r.ap]/1000).toFixed(2)} км
        <td>${two(r.bA,r.bB,i=>Math.round(ga.d[i])+' м','нет')}${late?`<span class="tag" title="точка торможения А относительно Б">${late>0?'А позже на '+late:'А раньше на '+(-late)} м</span>`:''}
        <td>${two(r.minA,r.minB)} км/ч<td>${two(r.exA,r.exB)} км/ч<td>${r.gl.toFixed(1)} g
        ${gb?`<td class="${r.delta<0?'g':''}" style="${r.delta>0?'color:#ff7b7b':''}">${dS(r.delta)}`:''}`}).join('')}
      </tbody></table></div>`;
  }
  view.innerHTML=h;
  bindTeleCursor(view);
}

/* курсор: одна вертикальная линия на всех графиках, точка на карте и значения в точке */
function bindTeleCursor(view){
  const read=view.querySelector('#teleRead'), dot=view.querySelector('#teleDot');
  const show=d=>{
    const {ga,gb,d0,d1}=tv; d=Math.min(Math.max(d,d0),d1);
    const i=Math.round((d-d0)/STEP), x=TL+(d-d0)/(d1-d0)*(TW-TL-TR);
    view.querySelectorAll('.tcur').forEach(l=>{l.setAttribute('x1',x);l.setAttribute('x2',x);l.setAttribute('visibility','visible')});
    const [px,py]=tv.proj(i); dot.setAttribute('cx',px); dot.setAttribute('cy',py); dot.setAttribute('visibility','visible');
    const line=(g,c,name)=>`<div><b style="color:${c}">${esc(name)}</b>: ${Math.round(g.v[i])} км/ч · газ ${Math.round(g.thr[i])}% · тормоз ${Math.round(g.brk[i])}% · ${g.g[i]||'N'} пер.</div>`;
    read.innerHTML=`<div style="color:var(--peri);font-weight:700">${(ga.d[i]/1000).toFixed(2)} км${gb?` · Δ ${dS(ga.t[i]-gb.t[i])} с`:''}</div>${line(ga,TA,tv.names[0])}${gb?line(gb,TB,tv.names[1]):''}`;
  };
  view.querySelectorAll('.tsvg').forEach(svg=>{
    svg.addEventListener('pointermove',e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*TW;
      show(tv.d0+(px-TL)/(TW-TL-TR)*(tv.d1-tv.d0))});
  });
  view.querySelectorAll('tr[data-d]').forEach(tr=>tr.onclick=()=>show(+tr.dataset.d));
}

function bindTele(box,uid,nm,meCar){
  const a=box.querySelector('#teleA'),b=box.querySelector('#teleB'); if(!a) return;
  a.onchange=()=>{teleA=a.value;renderTele(box,uid,nm,meCar)};
  b.onchange=()=>{teleB=b.value;renderTele(box,uid,nm,meCar)};
  renderTele(box,uid,nm,meCar);
}
