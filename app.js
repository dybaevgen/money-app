'use strict';

const DB_NAME = 'money-pwa-db';
const DB_VERSION = 1;
const STORE = 'app';
const STATE_KEY = 'state';
const COLORS = ['#7c9cff','#5dd7a9','#ffcc66','#ff7b8a','#b58cff','#6ed6ff','#ff9f68','#9ad37d','#d990ff','#78cbbf'];

const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const defaultState = () => ({
  version: 2,
  settings: { currency:'EUR', reserve:0, privacy:false },
  accounts: [
    { id:'acc-main', name:'Основная карта', type:'card', openingBalance:0, icon:'💳' },
    { id:'acc-cash', name:'Наличные', type:'cash', openingBalance:0, icon:'💶' }
  ],
  categories: [
    {id:'exp-food',type:'expense',name:'Продукты',icon:'🛒',preset:true},
    {id:'exp-cafe',type:'expense',name:'Рестораны и кофе',icon:'🍽️',preset:true},
    {id:'exp-home',type:'expense',name:'Жильё',icon:'🏠',preset:true},
    {id:'exp-bills',type:'expense',name:'Счета и подписки',icon:'🧾',preset:true},
    {id:'exp-transport',type:'expense',name:'Транспорт',icon:'🚇',preset:true},
    {id:'exp-car',type:'expense',name:'Автомобиль',icon:'🚗',preset:true},
    {id:'exp-study',type:'expense',name:'Учёба',icon:'🎓',preset:true},
    {id:'exp-tech',type:'expense',name:'Техника',icon:'💻',preset:true},
    {id:'exp-clothes',type:'expense',name:'Одежда',icon:'👕',preset:true},
    {id:'exp-health',type:'expense',name:'Здоровье',icon:'🩺',preset:true},
    {id:'exp-fun',type:'expense',name:'Развлечения',icon:'🎮',preset:true},
    {id:'exp-travel',type:'expense',name:'Путешествия',icon:'✈️',preset:true},
    {id:'exp-gifts',type:'expense',name:'Подарки',icon:'🎁',preset:true},
    {id:'exp-other',type:'expense',name:'Прочее',icon:'📦',preset:true},
    {id:'inc-salary',type:'income',name:'Зарплата',icon:'💼',preset:true},
    {id:'inc-side',type:'income',name:'Подработка',icon:'🧰',preset:true},
    {id:'inc-support',type:'income',name:'BAföG / поддержка',icon:'🎓',preset:true},
    {id:'inc-refund',type:'income',name:'Возврат',icon:'↩️',preset:true},
    {id:'inc-sale',type:'income',name:'Продажа',icon:'🏷️',preset:true},
    {id:'inc-gift',type:'income',name:'Подарок',icon:'🎁',preset:true},
    {id:'inc-other',type:'income',name:'Прочее',icon:'✨',preset:true}
  ],
  transactions: [],
  plans: [],
  budgets: [],
  goals: []
});

let state = defaultState();
let activeTab = 'overview';
let txFilter = 'all';
let statsRange = 6;
let planForecastRange = 12;
let planScenario = { extraIncome:0, extraExpense:0, oneTimeExpense:0, oneTimeMonth:3 };
let toastTimer = null;
const chartRegistry = new Map();

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readonly');
    const req = tx.objectStore(STORE).get(STATE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(value){
  const db = await openDB();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(value,STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function persist(){
  await dbSet(state);
}

function normalizeState(s){
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  return {
    version:2,
    settings:{...d.settings,...(s.settings||{})},
    accounts:Array.isArray(s.accounts)?s.accounts:d.accounts,
    categories:Array.isArray(s.categories)?s.categories:d.categories,
    transactions:Array.isArray(s.transactions)?s.transactions:[],
    plans:Array.isArray(s.plans)?s.plans.map(p=>({
      ...p,
      frequency:p.frequency==='monthly'?'monthly':'once',
      endDate:p.endDate||''
    })):[],
    budgets:Array.isArray(s.budgets)?s.budgets:[],
    goals:Array.isArray(s.goals)?s.goals:[]
  };
}

function fmt(n, signed=false){
  const val = Number(n)||0;
  if (state.settings.privacy) return '•••• €';
  const text = new Intl.NumberFormat('de-DE',{style:'currency',currency:state.settings.currency||'EUR',maximumFractionDigits:2}).format(Math.abs(val));
  if (!signed) return (val<0?'-':'')+text;
  return `${val>0?'+':val<0?'-':''}${text}`;
}

function fmtDate(iso){
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  const t = new Date();
  const y = new Date(); y.setDate(t.getDate()-1);
  if (d.toDateString()===t.toDateString()) return 'Сегодня';
  if (d.toDateString()===y.toDateString()) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:d.getFullYear()!==t.getFullYear()?'numeric':undefined}).format(d);
}

function monthKey(d=new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthLabel(d){ return new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d).replace('.',''); }
function addMonths(date,n){ const d=new Date(date); d.setDate(1); d.setMonth(d.getMonth()+n); return d; }
function endOfMonth(d){ return new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999); }
function parseISO(s){ return new Date(`${s}T12:00:00`); }

function account(id){ return state.accounts.find(a=>a.id===id); }
function category(id){ return state.categories.find(c=>c.id===id); }
function planCategory(p){ return category(p.categoryId); }
function accountBalance(id){
  const a = account(id); if (!a) return 0;
  let bal = Number(a.openingBalance)||0;
  for (const t of state.transactions){
    const amt = Number(t.amount)||0;
    if (t.type==='income' && t.accountId===id) bal += amt;
    if (t.type==='expense' && t.accountId===id) bal -= amt;
    if (t.type==='transfer'){
      if (t.accountId===id) bal -= amt;
      if (t.toAccountId===id) bal += amt;
    }
  }
  return bal;
}
function totalBalance(){ return state.accounts.reduce((s,a)=>s+accountBalance(a.id),0); }

function monthTotals(key=monthKey()){
  let income=0, expense=0;
  for (const t of state.transactions){
    if ((t.date||'').slice(0,7)!==key) continue;
    if (t.type==='income') income += Number(t.amount)||0;
    if (t.type==='expense') expense += Number(t.amount)||0;
  }
  return {income,expense,net:income-expense};
}

function actualAverage(type,days=90){
  const now = new Date();
  const start = new Date(now); start.setDate(start.getDate()-days);
  const total = state.transactions.filter(t=>t.type===type && parseISO(t.date)>=start && parseISO(t.date)<=now).reduce((sum,t)=>sum+Number(t.amount||0),0);
  return total/(days/30.4375);
}

function planStart(plan){ return parseISO(plan.date||todayISO()); }
function planEnd(plan){ return plan.endDate ? parseISO(plan.endDate) : null; }
function lastDayOfMonth(year,month){ return new Date(year,month+1,0).getDate(); }
function sameMonth(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth(); }

function occurrenceInMonth(plan, monthDate){
  if(!plan?.date) return null;
  const start=planStart(plan);
  const end=planEnd(plan);
  if(plan.frequency==='once') return sameMonth(start,monthDate) ? start : null;
  const monthStart=new Date(monthDate.getFullYear(),monthDate.getMonth(),1,12);
  const monthEnd=new Date(monthDate.getFullYear(),monthDate.getMonth(),lastDayOfMonth(monthDate.getFullYear(),monthDate.getMonth()),12);
  if(monthEnd<start || (end && monthStart>end)) return null;
  const day=Math.min(start.getDate(),lastDayOfMonth(monthDate.getFullYear(),monthDate.getMonth()));
  const occurrence=new Date(monthDate.getFullYear(),monthDate.getMonth(),day,12);
  if(occurrence<start || (end && occurrence>end)) return null;
  return occurrence;
}

function recurringPlanMonthly(type, monthDate=new Date()){
  return state.plans
    .filter(p=>p.type===type && p.frequency==='monthly' && occurrenceInMonth(p,monthDate))
    .reduce((sum,p)=>sum+Number(p.amount||0),0);
}

function hasRecurringPlan(type){
  return state.plans.some(p=>p.type===type && p.frequency==='monthly');
}

function oncePlansForMonth(type, monthDate){
  return state.plans
    .filter(p=>p.type===type && p.frequency==='once' && occurrenceInMonth(p,monthDate))
    .reduce((sum,p)=>sum+Number(p.amount||0),0);
}

function forecastSeries(months=12, scenario={}){
  const horizon=Math.max(1,Math.min(60,Number(months)||12));
  let balance=totalBalance();
  const avgIncome=actualAverage('income');
  const avgExpense=actualAverage('expense');
  const usePlanIncome=hasRecurringPlan('income');
  const usePlanExpense=hasRecurringPlan('expense');
  const extraIncome=Math.max(0,Number(scenario.extraIncome)||0);
  const extraExpense=Math.max(0,Number(scenario.extraExpense)||0);
  const oneTimeExpense=Math.max(0,Number(scenario.oneTimeExpense)||0);
  const oneTimeMonth=Math.max(1,Math.round(Number(scenario.oneTimeMonth)||1));
  const now=new Date();
  const series=[{label:'Сейчас',tooltipLabel:'Сейчас',value:balance,income:0,expense:0}];
  let totalIncome=0,totalExpense=0;
  for(let i=1;i<=horizon;i++){
    const d=addMonths(now,i);
    const recurringIncome=usePlanIncome?recurringPlanMonthly('income',d):avgIncome;
    const recurringExpense=usePlanExpense?recurringPlanMonthly('expense',d):avgExpense;
    const onceIncome=oncePlansForMonth('income',d);
    const onceExpense=oncePlansForMonth('expense',d);
    const simulatedOnce=i===oneTimeMonth?oneTimeExpense:0;
    const income=recurringIncome+onceIncome+extraIncome;
    const expense=recurringExpense+onceExpense+extraExpense+simulatedOnce;
    balance+=income-expense;
    totalIncome+=income; totalExpense+=expense;
    series.push({
      label:monthLabel(d),
      tooltipLabel:new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(d),
      value:balance,income,expense
    });
  }
  return {
    series,
    incomeBase:usePlanIncome?recurringPlanMonthly('income',addMonths(now,1)):avgIncome,
    expenseBase:usePlanExpense?recurringPlanMonthly('expense',addMonths(now,1)):avgExpense,
    modeIncome:usePlanIncome?'План':'Средний факт',
    modeExpense:usePlanExpense?'План':'Средний факт',
    totalIncome,totalExpense
  };
}

function monthlyCashflowHealth(series){
  const future=series.slice(1);
  const rows=future.map((x,index)=>{
    const income=Number(x.income)||0;
    const expense=Number(x.expense)||0;
    return {...x,index:index+1,income,expense,net:income-expense,shortfall:Math.max(0,expense-income)};
  });
  const deficits=rows.filter(x=>x.shortfall>0.005);
  const worst=deficits.reduce((best,x)=>!best||x.shortfall>best.shortfall?x:best,null);
  return {
    hasDeficit:deficits.length>0,
    deficitMonths:deficits.length,
    firstDeficit:deficits[0]||null,
    worstDeficit:worst,
    required:worst?Math.ceil(worst.shortfall*100)/100:0
  };
}

function forecastHealth(series){
  const future=series.slice(1);
  const min=future.length?Math.min(...future.map(x=>Number(x.value)||0)):totalBalance();
  const minIndex=future.findIndex(x=>(Number(x.value)||0)===min)+1;
  return {min,minIndex,cashflow:monthlyCashflowHealth(series)};
}

function nextOccurrence(plan, from=new Date()){
  const start=planStart(plan);
  const end=planEnd(plan);
  const f=new Date(from); f.setHours(0,0,0,0);
  if(plan.frequency==='once') return start>=f && (!end || start<=end) ? start : null;
  for(let i=0;i<=72;i++){
    const md=addMonths(f,i);
    const occ=occurrenceInMonth(plan,md);
    if(occ && occ>=f) return occ;
    if(end && new Date(md.getFullYear(),md.getMonth(),1,12)>end) break;
  }
  return null;
}

function planOccurrencesBetween(start,end){
  const out=[];
  for(const p of state.plans){
    if(p.frequency==='once'){
      const d=planStart(p);
      if(d>=start && d<=end) out.push({p,date:d});
      continue;
    }
    let cursor=new Date(start.getFullYear(),start.getMonth(),1,12);
    const stop=new Date(end.getFullYear(),end.getMonth(),1,12);
    while(cursor<=stop){
      const d=occurrenceInMonth(p,cursor);
      if(d && d>=start && d<=end) out.push({p,date:d});
      cursor=addMonths(cursor,1);
    }
  }
  return out.sort((a,b)=>a.date-b.date);
}

function upcomingPlans(days=45){
  const now=new Date(); now.setHours(0,0,0,0);
  const end=new Date(now); end.setDate(end.getDate()+days); end.setHours(23,59,59,999);
  return planOccurrencesBetween(now,end);
}

function monthRemainingPlans(){
  const now=new Date(); now.setHours(0,0,0,0);
  return planOccurrencesBetween(now,endOfMonth(now));
}

function monthRemainingSummary(){
  const rows=monthRemainingPlans();
  let income=0,expense=0;
  rows.forEach(({p})=>{ if(p.type==='income')income+=Number(p.amount||0); else expense+=Number(p.amount||0); });
  return {rows,income,expense,projected:totalBalance()+income-expense};
}

function upcomingExpenses(days=30){
  return upcomingPlans(days).filter(x=>x.p.type==='expense').reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}

function freeBalance(){ return totalBalance()-Number(state.settings.reserve||0)-upcomingExpenses(30); }

function expenseByCategory(key=monthKey()){
  const map={};
  state.transactions.filter(t=>t.type==='expense' && (t.date||'').slice(0,7)===key).forEach(t=>map[t.categoryId]=(map[t.categoryId]||0)+Number(t.amount||0));
  return Object.entries(map).map(([id,value])=>({id,name:category(id)?.name||'Без категории',icon:category(id)?.icon||'•',value})).sort((a,b)=>b.value-a.value);
}

function monthlySeries(count=6){
  const now=new Date(); const out=[];
  for(let i=count-1;i>=0;i--){
    const d=addMonths(now,-i), key=monthKey(d), t=monthTotals(key);
    out.push({label:monthLabel(d),income:t.income,expense:t.expense,key});
  }
  return out;
}

function capitalMonthlySeries(count=6){
  const now=new Date();
  const opening=state.accounts.reduce((s,a)=>s+Number(a.openingBalance||0),0);
  const out=[];
  for(let i=count-1;i>=0;i--){
    const d=addMonths(now,-i), end=endOfMonth(d);
    let v=opening;
    state.transactions.forEach(t=>{
      if(parseISO(t.date)<=end){
        if(t.type==='income')v+=Number(t.amount||0);
        if(t.type==='expense')v-=Number(t.amount||0);
      }
    });
    out.push({label:monthLabel(d),value:v});
  }
  return out;
}

function svgLine(data,{interactive=false,height='normal'}={}){
  if(!data.length || data.every(d=>!Number.isFinite(Number(d.value)))) return '<div class="chart-empty">Пока недостаточно данных</div>';
  const id=`chart-${uid()}`;
  chartRegistry.set(id,data);
  const w=680,h=230,pl=56,pr=18,pt=16,pb=34;
  const vals=data.map(d=>Number(d.value)||0);
  let min=Math.min(...vals),max=Math.max(...vals);
  const pad=(max-min||Math.max(1,Math.abs(max)*.2||1))*.14;
  min-=pad; max+=pad;
  if(min>0) min=Math.max(0,min);
  if(max<0) max=Math.min(0,max);
  if(max===min){max+=1;min-=1}
  const range=max-min;
  const xFor=i=>pl+(i*(w-pl-pr)/(Math.max(1,data.length-1)));
  const yFor=v=>pt+(max-v)/range*(h-pt-pb);
  const pts=data.map((d,i)=>({x:xFor(i),y:yFor(Number(d.value)||0),...d}));
  const path=pts.map((q,i)=>`${i?'L':'M'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
  const area=`${path} L ${pts.at(-1).x.toFixed(1)} ${h-pb} L ${pts[0].x.toFixed(1)} ${h-pb} Z`;
  const yTicks=[0,.5,1].map(r=>max-r*range);
  const grid=yTicks.map(v=>`<g><line class="chart-grid" x1="${pl}" y1="${yFor(v)}" x2="${w-pr}" y2="${yFor(v)}"/><text class="chart-y-label" x="${pl-8}" y="${yFor(v)+3}" text-anchor="end">${esc(compactMoney(v))}</text></g>`).join('');
  const stride=Math.max(1,Math.ceil((data.length-1)/5));
  const labels=pts.map((q,i)=>((i===0||i===pts.length-1||i%stride===0)&&q.label)?`<text class="chart-label" x="${q.x}" y="${h-8}" text-anchor="middle">${esc(q.label)}</text>`:'').join('');
  const zero=min<0&&max>0?`<line class="chart-zero" x1="${pl}" y1="${yFor(0)}" x2="${w-pr}" y2="${yFor(0)}"/>`:'';
  const dots=pts.map(q=>`<circle class="chart-dot" cx="${q.x}" cy="${q.y}" r="2.8"></circle>`).join('');
  return `<div class="chart-shell ${interactive?'interactive-chart':''} chart-${height}" data-chart-id="${id}">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="График">
      <defs><linearGradient id="areaGrad-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8cff" stop-opacity=".30"/><stop offset="1" stop-color="#5b8cff" stop-opacity="0"/></linearGradient></defs>
      ${grid}${zero}<path class="chart-area" style="fill:url(#areaGrad-${id})" d="${area}"/><path class="chart-line" d="${path}"/>${dots}${labels}
      ${interactive?`<line class="chart-cursor hidden" x1="${pl}" y1="${pt}" x2="${pl}" y2="${h-pb}"/><circle class="chart-cursor-dot hidden" cx="${pl}" cy="${pt}" r="5"/>`:''}
    </svg>
    ${interactive?'<div class="chart-tooltip hidden"></div>':''}
  </div>`;
}

function compactMoney(value){
  if(state.settings.privacy) return '•••';
  const n=Number(value)||0, abs=Math.abs(n);
  if(abs>=1000000) return `${(n/1000000).toFixed(abs>=10000000?0:1)}M€`;
  if(abs>=1000) return `${(n/1000).toFixed(abs>=10000?0:1)}k€`;
  return `${Math.round(n)}€`;
}

function bindInteractiveCharts(){
  $$('.interactive-chart').forEach(el=>{
    const data=chartRegistry.get(el.dataset.chartId); if(!data?.length)return;
    const svg=$('svg',el), cursor=$('.chart-cursor',el), dot=$('.chart-cursor-dot',el), tip=$('.chart-tooltip',el);
    let activePointer=null;
    const hide=()=>{ if(cursor)cursor.classList.add('hidden'); if(dot)dot.classList.add('hidden'); if(tip)tip.classList.add('hidden'); };
    const show=(clientX)=>{
      const rect=svg.getBoundingClientRect();
      const vb=svg.viewBox.baseVal, pl=56, pr=18, pt=16, pb=34;
      const scaleX=vb.width/Math.max(1,rect.width);
      const svgX=(clientX-rect.left)*scaleX;
      const plotX=Math.max(pl,Math.min(vb.width-pr,svgX));
      const ratio=(plotX-pl)/Math.max(1,(vb.width-pl-pr));
      const idx=Math.max(0,Math.min(data.length-1,Math.round(ratio*(data.length-1))));
      const d=data[idx];
      const x=pl+(idx*(vb.width-pl-pr)/(Math.max(1,data.length-1)));
      const values=data.map(x=>Number(x.value)||0); let min=Math.min(...values),max=Math.max(...values); const pad=(max-min||Math.max(1,Math.abs(max)*.2||1))*.14; min-=pad;max+=pad;if(min>0)min=Math.max(0,min);if(max<0)max=Math.min(0,max);if(max===min){max+=1;min-=1}
      const y=pt+(max-(Number(d.value)||0))/(max-min)*(vb.height-pt-pb);
      cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);dot.setAttribute('cx',x);dot.setAttribute('cy',y);
      cursor.classList.remove('hidden');dot.classList.remove('hidden');tip.classList.remove('hidden');
      tip.innerHTML=`<small>${esc(d.tooltipLabel||d.label||'')}</small><strong>${fmt(d.value)}</strong>${Number.isFinite(d.income)&&Number.isFinite(d.expense)?`<span><b class="positive">+${fmt(d.income)}</b> · <b class="negative">−${fmt(d.expense)}</b> · <b class="${d.income-d.expense>=0?'positive':'negative'}">${fmt(d.income-d.expense,true)}</b></span>`:''}`;
      const pct=x/vb.width*100; tip.style.left=`${Math.min(82,Math.max(18,pct))}%`;
    };
    el.addEventListener('pointerdown',e=>{
      activePointer=e.pointerId;
      try{el.setPointerCapture(e.pointerId)}catch(_){}
      e.preventDefault();
      show(e.clientX);
    },{passive:false});
    el.addEventListener('pointermove',e=>{
      if(activePointer!==e.pointerId && e.pointerType!=='mouse')return;
      if(e.pointerType!=='mouse')e.preventDefault();
      if(e.pointerType==='mouse' && !e.buttons && activePointer===null)return;
      show(e.clientX);
    },{passive:false});
    const finish=e=>{
      if(activePointer===null || activePointer===e.pointerId){
        if(activePointer===e.pointerId){ try{el.releasePointerCapture(e.pointerId)}catch(_){} }
        activePointer=null;
        hide();
      }
    };
    el.addEventListener('pointerup',finish);
    el.addEventListener('pointercancel',finish);
    el.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse' && activePointer===null) hide(); });
  });
}

function svgBars(data){
  if(!data.length || data.every(d=>d.income===0&&d.expense===0)) return '<div class="chart-empty">Добавьте операции — здесь появится график</div>';
  const w=620,h=190,p=24; const max=Math.max(1,...data.flatMap(d=>[d.income,d.expense])); const group=(w-2*p)/data.length; const bw=Math.min(25,group*.28);
  let bars='',labels='';
  data.forEach((d,i)=>{const cx=p+group*i+group/2; const hi=(d.income/max)*(h-48), he=(d.expense/max)*(h-48); bars+=`<rect class="bar-income" x="${cx-bw-2}" y="${h-24-hi}" width="${bw}" height="${hi}" rx="5"/><rect class="bar-expense" x="${cx+2}" y="${h-24-he}" width="${bw}" height="${he}" rx="5"/>`; labels+=`<text class="chart-label" x="${cx}" y="${h-5}" text-anchor="middle">${esc(d.label)}</text>`});
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line class="chart-grid" x1="${p}" y1="${h-24}" x2="${w-p}" y2="${h-24}"/>${bars}${labels}</svg>`;
}

function donutHTML(items){
  const total=items.reduce((s,x)=>s+x.value,0);
  if(!total) return '<div class="chart-empty">В этом месяце расходов пока нет</div>';
  let a=0; const parts=items.slice(0,8).map((x,i)=>{const start=a; a+=x.value/total*100; return `${COLORS[i%COLORS.length]} ${start.toFixed(2)}% ${a.toFixed(2)}%`});
  const legend=items.slice(0,6).map((x,i)=>`<div class="legend-row"><span class="legend-dot" style="background:${COLORS[i%COLORS.length]}"></span><span class="legend-label">${esc(x.icon)} ${esc(x.name)}</span><span class="legend-value">${fmt(x.value)}</span></div>`).join('');
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${parts.join(',')})"></div><div class="legend">${legend}</div></div>`;
}

function showToast(msg){
  const el=$('#toast'); el.textContent=msg; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.add('hidden'),2200);
}

function setPageTitle(title){ $('#pageTitle').textContent=title; }
function updateNavGlider(){
  const nav=$('.bottom-nav'), glider=$('.nav-glider'), items=$$('.nav-item');
  if(!nav||!glider||!items.length)return;
  const idx=Math.max(0,items.findIndex(b=>b.dataset.tab===activeTab));
  glider.style.setProperty('--nav-index',idx);
}

function render(){
  chartRegistry.clear();
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  updateNavGlider();
  const title={overview:'Обзор',transactions:'Операции',plan:'План',stats:'Статистика',more:'Ещё'}[activeTab]; setPageTitle(title);
  if(activeTab==='overview') renderOverview();
  if(activeTab==='transactions') renderTransactions();
  if(activeTab==='plan') renderPlan();
  if(activeTab==='stats') renderStats();
  if(activeTab==='more') renderMore();
}

function renderOverview(){
  const m=monthTotals();
  const total=totalBalance();
  const free=freeBalance();
  const forecast=forecastSeries(6);
  const monthPlan=monthRemainingSummary();
  const upcoming=monthPlan.rows.slice(0,5);
  const noData=state.transactions.length===0 && state.accounts.every(a=>Number(a.openingBalance||0)===0);
  const runway=actualAverage('expense')>0?Math.max(0,totalBalance()/actualAverage('expense')):null;
  $('#main').innerHTML=`
    <section class="hero liquid-card">
      <div class="hero-topline"><div class="hero-label">Общий капитал</div><span class="status-dot">● локально</span></div>
      <div class="hero-balance">${fmt(total)}</div>
      <div class="hero-row hero-row-3">
        <div class="mini-stat"><small>Свободно</small><strong class="${free>=0?'positive':'negative'}">${fmt(free)}</strong></div>
        <div class="mini-stat"><small>До конца месяца</small><strong class="${monthPlan.expense>0?'negative':''}">${monthPlan.expense?`−${fmt(monthPlan.expense)}`:fmt(0)}</strong></div>
        <div class="mini-stat"><small>После платежей</small><strong class="${monthPlan.projected>=0?'positive':'negative'}">${fmt(monthPlan.projected)}</strong></div>
      </div>
    </section>
    ${monthPlan.rows.length?`<section class="month-due glass-strip">
      <div><small>Осталось в этом месяце</small><strong>${monthPlan.rows.length} ${monthPlan.rows.length===1?'платёж':'операций'}</strong></div>
      <div class="month-due-money"><span class="positive">+${fmt(monthPlan.income)}</span><span class="negative">−${fmt(monthPlan.expense)}</span></div>
      <button data-tab-link="plan">›</button>
    </section>`:''}
    ${noData?`<section class="section"><div class="notice">Начните со своих реальных остатков: <b>Ещё → Счета и кошельки</b>. Затем расходы и доходы будут автоматически менять баланс каждого счёта.</div></section>`:''}
    <div class="quick-actions">
      <button class="quick-action" data-action="quick-expense"><span>−</span><small>Расход</small></button>
      <button class="quick-action" data-action="quick-income"><span>＋</span><small>Доход</small></button>
      <button class="quick-action" data-action="quick-transfer"><span>⇄</span><small>Перевод</small></button>
      <button class="quick-action" data-action="quick-plan"><span>⌚︎</span><small>План</small></button>
    </div>
    <section class="section">
      <div class="section-head"><h2>Этот месяц</h2></div>
      <div class="grid-3">
        <div class="kpi"><small>Доходы</small><strong class="positive">${fmt(m.income)}</strong></div>
        <div class="kpi"><small>Расходы</small><strong class="negative">${fmt(m.expense)}</strong></div>
        <div class="kpi"><small>Сбережено</small><strong>${m.income?Math.round(m.net/m.income*100):0}%</strong></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Мои деньги</h2><button data-action="manage-accounts">Управлять</button></div>
      <div class="account-list">${state.accounts.map(a=>`<button class="account-item" data-account="${a.id}" style="width:100%;color:inherit;text-align:left"><div class="account-icon">${esc(a.icon||'💳')}</div><div class="item-main"><div class="item-title">${esc(a.name)}</div><div class="item-sub">${accountTypeName(a.type)}</div></div><div class="item-amount">${fmt(accountBalance(a.id))}</div></button>`).join('')}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Прогноз капитала</h2><button data-tab-link="plan">Открыть план</button></div>
      <div class="card chart-card"><div class="chart">${svgLine(forecast.series,{interactive:true})}</div><div class="grid-2 forecast-mini"><div class="kpi"><small>Через 6 месяцев</small><strong class="${forecast.series.at(-1).value>=total?'positive':'negative'}">${fmt(forecast.series.at(-1).value)}</strong></div><div class="kpi"><small>Финансовый запас</small><strong>${runway===null?'—':`${runway.toFixed(1)} мес.`}</strong></div></div></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Платежи до конца месяца</h2><button data-action="add-plan">Добавить</button></div>
      ${upcoming.length?`<div class="plan-list">${upcoming.map(({p,date})=>planRow(p,date)).join('')}</div>`:`<div class="card empty"><div class="emoji">◷</div><strong>До конца месяца ничего не запланировано</strong><span>Добавьте аренду, зарплату, подписки или будущие покупки.</span></div>`}
    </section>`;
  bindCommonActions();
  bindInteractiveCharts();
}

function accountTypeName(type){ return ({card:'Банковская карта',bank:'Банковский счёт',cash:'Наличные',savings:'Накопительный счёт',credit:'Кредитная карта',other:'Другой счёт'})[type]||'Счёт'; }
function txRow(t){
  const a=account(t.accountId), c=category(t.categoryId), to=account(t.toAccountId);
  const icon=t.type==='transfer'?'⇄':(c?.icon||(t.type==='income'?'＋':'−'));
  const title=t.type==='transfer'?`${a?.name||'Счёт'} → ${to?.name||'Счёт'}`:(c?.name||'Без категории');
  const sub=[fmtDate(t.date),t.note].filter(Boolean).join(' · ');
  const signed=t.type==='expense'?-Number(t.amount):t.type==='income'?Number(t.amount):0;
  return `<button class="tx-item" data-tx="${t.id}" style="width:100%;color:inherit;text-align:left"><div class="tx-icon ${t.type}">${esc(icon)}</div><div class="item-main"><div class="item-title">${esc(title)}</div><div class="item-sub">${esc(sub)}</div></div><div class="item-amount ${t.type==='income'?'positive':t.type==='expense'?'negative':''}">${t.type==='transfer'?fmt(t.amount):fmt(signed,true)}<small>${t.type==='transfer'?'перевод':esc(a?.name||'')}</small></div></button>`;
}

function renderTransactions(){
  let txs=[...state.transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  if(txFilter!=='all') txs=txs.filter(t=>t.type===txFilter);
  $('#main').innerHTML=`
    <div class="filter-row">
      ${[['all','Все'],['expense','Расходы'],['income','Доходы'],['transfer','Переводы']].map(([k,n])=>`<button class="filter-chip ${txFilter===k?'active':''}" data-filter="${k}">${n}</button>`).join('')}
    </div>
    <section class="section">
      ${txs.length?`<div class="tx-list">${txs.map(txRow).join('')}</div>`:`<div class="card empty"><div class="emoji">↕</div><strong>Операций пока нет</strong><span>Нажмите + и добавьте первый доход или расход.</span></div>`}
    </section>`;
  $$('[data-filter]').forEach(b=>b.onclick=()=>{txFilter=b.dataset.filter;renderTransactions()});
  $$('[data-tx]').forEach(b=>b.onclick=()=>openTransactionSheet(state.transactions.find(t=>t.id===b.dataset.tx)));
}

function planRow(p,date=null){
  const c=planCategory(p), a=account(p.accountId); const d=date||nextOccurrence(p,new Date());
  const repeat=p.frequency==='monthly'?(p.endDate?`каждый месяц · до ${fmtDate(p.endDate)}`:'каждый месяц · без окончания'):'один раз';
  const when=d?fmtDate(toISODate(d)):(p.frequency==='monthly'&&p.endDate?'завершено':fmtDate(p.date));
  return `<button class="plan-item" data-plan="${p.id}" style="width:100%;color:inherit;text-align:left"><div class="plan-icon">${esc(c?.icon||(p.type==='income'?'＋':'−'))}</div><div class="item-main"><div class="item-title">${esc(p.title||c?.name||'План')}</div><div class="item-sub">${esc(when)} · ${esc(repeat)}${a?` · ${esc(a.name)}`:''}</div></div><div class="item-amount ${p.type==='income'?'positive':'negative'}">${fmt(p.type==='income'?Number(p.amount):-Number(p.amount),true)}</div></button>`;
}
function toISODate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function planForecastHTML(){
  planScenario.oneTimeMonth=Math.min(planForecastRange,Math.max(1,Number(planScenario.oneTimeMonth)||1));
  const forecast=forecastSeries(planForecastRange,planScenario);
  const final=forecast.series.at(-1).value;
  const health=forecastHealth(forecast.series);
  const start=totalBalance();
  const change=final-start;
  return `<div class="chart plan-chart">${svgLine(forecast.series,{interactive:true,height:'large'})}</div>
    <div class="grid-3 plan-kpis">
      <div class="kpi"><small>Через ${planForecastRange} мес.</small><strong class="${final>=start?'positive':'negative'}">${fmt(final)}</strong></div>
      <div class="kpi"><small>Минимум</small><strong class="${health.min>=0?'positive':'negative'}">${fmt(health.min)}</strong></div>
      <div class="kpi"><small>Изменение</small><strong class="${change>=0?'positive':'negative'}">${fmt(change,true)}</strong></div>
    </div>
    ${health.cashflow.required>0?`<div class="zero-alert"><div class="zero-alert-icon">↗</div><div><small>В плане есть месяцы с отрицательным результатом</small><strong>Нужно зарабатывать ещё ${fmt(health.cashflow.required)} / месяц</strong><p>Это разница между доходами и расходами в самом дефицитном месяце выбранного периода. Показатель считается по месячному денежному потоку, даже если накоплений пока хватает.</p></div></div>`:`<div class="notice good">Месячный план сбалансирован: во всех месяцах выбранного периода доходы не ниже расходов. Минимальный расчётный капитал: <b>${fmt(health.min)}</b>.</div>`}`;
}

function refreshPlanForecast(){
  chartRegistry.clear();
  const box=$('#forecastDynamic'); if(!box)return;
  box.innerHTML=planForecastHTML();
  const rangeLabel=$('#forecastRangeLabel'); if(rangeLabel)rangeLabel.textContent=`${planForecastRange} мес.`;
  $$('[data-forecast-range]').forEach(b=>b.classList.toggle('active',Number(b.dataset.forecastRange)===planForecastRange));
  const onceLabel=$('#simOnceMonthLabel'); if(onceLabel)onceLabel.textContent=`через ${planScenario.oneTimeMonth} мес.`;
  const onceSlider=$('#simOnceMonth'); if(onceSlider){onceSlider.max=String(planForecastRange);onceSlider.value=String(planScenario.oneTimeMonth);}
  bindInteractiveCharts();
}

function renderPlan(){
  chartRegistry.clear();
  const nextMonth=addMonths(new Date(),1);
  const recurringIncome=hasRecurringPlan('income')?recurringPlanMonthly('income',nextMonth):actualAverage('income');
  const recurringExpense=hasRecurringPlan('expense')?recurringPlanMonthly('expense',nextMonth):actualAverage('expense');
  const due=monthRemainingSummary();
  $('#main').innerHTML=`
    <section class="card forecast-card">
      <div class="section-head"><h2>Прогноз капитала</h2><span class="badge" id="forecastRangeLabel">${planForecastRange} мес.</span></div>
      <div class="forecast-range-tabs">${[3,6,12,24,36].map(n=>`<button data-forecast-range="${n}" class="${planForecastRange===n?'active':''}">${n}м</button>`).join('')}</div>
      <div class="range-control"><span>3 мес.</span><input id="forecastRangeSlider" type="range" min="3" max="36" step="1" value="${planForecastRange}"><span>36 мес.</span></div>
      <div id="forecastDynamic">${planForecastHTML()}</div>
      <div class="forecast-method"><span>Доходы: <b>${hasRecurringPlan('income')?'по плану':'средний факт'}</b></span><span>Расходы: <b>${hasRecurringPlan('expense')?'по плану':'средний факт'}</b></span></div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Симулятор</h2><button id="resetScenario">Сбросить</button></div>
      <div class="card simulator-card">
        <p class="section-note">Меняй цифры — график выше перестраивается. Эти значения не сохраняются в реальный план.</p>
        <div class="form-grid simulator-grid">
          <div class="field"><label>Доп. доход / месяц</label><input id="simIncome" type="number" min="0" step="25" inputmode="decimal" value="${planScenario.extraIncome||''}" placeholder="0 €"></div>
          <div class="field"><label>Доп. расход / месяц</label><input id="simExpense" type="number" min="0" step="25" inputmode="decimal" value="${planScenario.extraExpense||''}" placeholder="0 €"></div>
          <div class="field"><label>Разовая трата</label><input id="simOnce" type="number" min="0" step="50" inputmode="decimal" value="${planScenario.oneTimeExpense||''}" placeholder="0 €"></div>
          <div class="field"><label id="simOnceMonthLabel">через ${planScenario.oneTimeMonth} мес.</label><input id="simOnceMonth" type="range" min="1" max="${planForecastRange}" step="1" value="${Math.min(planForecastRange,planScenario.oneTimeMonth)}"></div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>До конца месяца</h2><span class="badge">${due.rows.length} операций</span></div>
      <div class="grid-3">
        <div class="kpi"><small>Придёт</small><strong class="positive">${fmt(due.income)}</strong></div>
        <div class="kpi"><small>Спишется</small><strong class="negative">${fmt(due.expense)}</strong></div>
        <div class="kpi"><small>Останется</small><strong class="${due.projected>=0?'positive':'negative'}">${fmt(due.projected)}</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Регулярные и будущие операции</h2><button data-action="add-plan">Добавить</button></div>
      ${state.plans.length?`<div class="plan-list">${[...state.plans].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(p=>planRow(p)).join('')}</div>`:`<div class="card empty"><div class="emoji">📅</div><strong>План пуст</strong><span>Добавьте зарплату, аренду, подписки и будущие крупные покупки.</span></div>`}
      <div class="grid-2" style="margin-top:10px"><div class="kpi"><small>Доход / след. месяц</small><strong class="positive">${fmt(recurringIncome)}</strong></div><div class="kpi"><small>Расход / след. месяц</small><strong class="negative">${fmt(recurringExpense)}</strong></div></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Бюджеты категорий</h2><button data-action="add-budget">Добавить</button></div>
      ${state.budgets.length?`<div class="budget-list">${state.budgets.map(b=>budgetRow(b)).join('')}</div>`:`<div class="card empty"><strong>Лимитов пока нет</strong><span>Например: продукты ≤ 350 € в месяц.</span></div>`}
    </section>
    <section class="section">
      <div class="section-head"><h2>Финансовые цели</h2><button data-action="add-goal">Добавить</button></div>
      ${state.goals.length?`<div class="goal-list">${state.goals.map(g=>goalRow(g)).join('')}</div>`:`<div class="card empty"><strong>Целей пока нет</strong><span>Например: резерв 5 000 € или поездка 1 200 €.</span></div>`}
    </section>`;
  bindCommonActions();
  bindInteractiveCharts();
  $$('[data-plan]').forEach(b=>b.onclick=()=>openPlanSheet(state.plans.find(p=>p.id===b.dataset.plan)));
  $$('[data-budget]').forEach(b=>b.onclick=()=>openBudgetSheet(state.budgets.find(x=>x.id===b.dataset.budget)));
  $$('[data-goal]').forEach(b=>b.onclick=()=>openGoalSheet(state.goals.find(x=>x.id===b.dataset.goal)));
  $$('[data-forecast-range]').forEach(b=>b.onclick=()=>{planForecastRange=Number(b.dataset.forecastRange);renderPlan()});
  const slider=$('#forecastRangeSlider'); if(slider)slider.oninput=e=>{planForecastRange=Number(e.target.value);refreshPlanForecast()};
  const simIncome=$('#simIncome'); if(simIncome)simIncome.oninput=e=>{planScenario.extraIncome=Math.max(0,Number(e.target.value)||0);refreshPlanForecast()};
  const simExpense=$('#simExpense'); if(simExpense)simExpense.oninput=e=>{planScenario.extraExpense=Math.max(0,Number(e.target.value)||0);refreshPlanForecast()};
  const simOnce=$('#simOnce'); if(simOnce)simOnce.oninput=e=>{planScenario.oneTimeExpense=Math.max(0,Number(e.target.value)||0);refreshPlanForecast()};
  const simMonth=$('#simOnceMonth'); if(simMonth)simMonth.oninput=e=>{planScenario.oneTimeMonth=Number(e.target.value);refreshPlanForecast()};
  const reset=$('#resetScenario'); if(reset)reset.onclick=()=>{planScenario={extraIncome:0,extraExpense:0,oneTimeExpense:0,oneTimeMonth:Math.min(3,planForecastRange)};renderPlan()};
}

function budgetRow(b){
  const c=category(b.categoryId); const spent=expenseByCategory().find(x=>x.id===b.categoryId)?.value||0; const limit=Number(b.limit)||0; const pct=limit?spent/limit*100:0;
  return `<button class="budget-item" data-budget="${b.id}" style="width:100%;color:inherit;text-align:left"><div class="item-main"><div class="item-title">${esc(c?.icon||'•')} ${esc(c?.name||'Категория')}</div><div class="item-sub">${fmt(spent)} из ${fmt(limit)}</div><div class="progress ${pct>100?'danger':''}"><i style="width:${Math.min(100,pct)}%"></i></div></div><div class="item-amount ${pct>100?'negative':''}">${Math.round(pct)}%</div></button>`;
}
function goalRow(g){
  const target=Number(g.target)||0,saved=Number(g.saved)||0,pct=target?saved/target*100:0;
  return `<button class="goal-item" data-goal="${g.id}" style="width:100%;color:inherit;text-align:left"><div class="item-main"><div class="item-title">🎯 ${esc(g.title)}</div><div class="item-sub">${fmt(saved)} из ${fmt(target)}</div><div class="progress"><i style="width:${Math.min(100,pct)}%"></i></div></div><div class="item-amount">${Math.round(pct)}%</div></button>`;
}

function renderStats(){
  chartRegistry.clear();
  const m=monthTotals(); const cats=expenseByCategory(); const monthly=monthlySeries(statsRange); const capital=capitalMonthlySeries(statsRange); const prevKey=monthKey(addMonths(new Date(),-1)); const prev=monthTotals(prevKey); const diff=prev.expense?((m.expense-prev.expense)/prev.expense*100):0;
  $('#main').innerHTML=`
    <div class="pill-tabs">${[3,6,9,12].map(n=>`<button data-range="${n}" class="${statsRange===n?'active':''}">${n} мес.</button>`).join('')}</div>
    <section class="section">
      <div class="grid-3">
        <div class="kpi"><small>Доходы месяца</small><strong class="positive">${fmt(m.income)}</strong></div>
        <div class="kpi"><small>Расходы месяца</small><strong class="negative">${fmt(m.expense)}</strong></div>
        <div class="kpi"><small>К прошлому месяцу</small><strong class="${diff<=0?'positive':'negative'}">${prev.expense?`${diff>0?'+':''}${Math.round(diff)}%`:'—'}</strong></div>
      </div>
    </section>
    <section class="section"><div class="section-head"><h2>Доходы и расходы</h2><span class="badge">месяцы</span></div><div class="card"><div class="chart">${svgBars(monthly)}</div><div class="inline-actions"><button><span class="positive">●</span> Доходы</button><button><span class="negative">●</span> Расходы</button></div></div></section>
    <section class="section"><div class="section-head"><h2>Капитал</h2><span class="badge">динамика</span></div><div class="card chart-card"><div class="chart">${svgLine(capital,{interactive:true})}</div></div></section>
    <section class="section"><div class="section-head"><h2>Расходы по категориям</h2><span class="badge">текущий месяц</span></div><div class="card">${donutHTML(cats)}</div></section>
    <section class="section"><div class="section-head"><h2>Ключевые показатели</h2></div><div class="card"><div class="stat-line"><span>Средний расход / месяц · 90 дней</span><strong>${fmt(actualAverage('expense'))}</strong></div><div class="stat-line"><span>Средний доход / месяц · 90 дней</span><strong>${fmt(actualAverage('income'))}</strong></div><div class="stat-line"><span>Средний расход / день</span><strong>${fmt(actualAverage('expense')/30.4375)}</strong></div><div class="stat-line"><span>Savings rate этого месяца</span><strong>${m.income?Math.round(m.net/m.income*100):0}%</strong></div></div></section>`;
  $$('[data-range]').forEach(b=>b.onclick=()=>{statsRange=Number(b.dataset.range);renderStats()});
  bindInteractiveCharts();
}

function renderMore(){
  $('#main').innerHTML=`
    <section class="card">
      <button class="list-button" data-action="manage-accounts"><span>💳</span><div class="lb-main"><strong>Счета и кошельки</strong><small>${state.accounts.length} · карты, счета, наличные</small></div><span class="arrow">›</span></button>
      <button class="list-button" data-action="manage-categories"><span>🏷️</span><div class="lb-main"><strong>Категории</strong><small>Доходы и расходы</small></div><span class="arrow">›</span></button>
      <button class="list-button" data-action="reserve"><span>🛡️</span><div class="lb-main"><strong>Неприкосновенный резерв</strong><small>Сейчас ${fmt(Number(state.settings.reserve||0))}</small></div><span class="arrow">›</span></button>
    </section>
    <section class="section"><div class="section-head"><h2>Данные</h2></div><div class="card">
      <button class="list-button" data-action="export-json"><span>⬆️</span><div class="lb-main"><strong>Резервная копия</strong><small>Сохранить все данные в JSON</small></div><span class="arrow">›</span></button>
      <button class="list-button" data-action="import-json"><span>⬇️</span><div class="lb-main"><strong>Восстановить копию</strong><small>Загрузить ранее сохранённый JSON</small></div><span class="arrow">›</span></button>
      <button class="list-button" data-action="export-csv"><span>📄</span><div class="lb-main"><strong>Экспорт операций CSV</strong><small>Для Excel / Numbers</small></div><span class="arrow">›</span></button>
    </div></section>
    <section class="section"><div class="section-head"><h2>О приложении</h2></div><div class="card"><div class="stat-line"><span>Хранение</span><strong>Локально на устройстве</strong></div><div class="stat-line"><span>Сервер</span><strong>Не используется</strong></div><div class="stat-line"><span>Версия</span><strong>2.0</strong></div></div></section>
    <section class="section"><button class="danger-btn" data-action="clear-data">Удалить все мои данные</button></section>`;
  bindCommonActions();
}

function bindCommonActions(){
  $$('[data-action="quick-expense"]').forEach(b=>b.onclick=()=>openTransactionSheet(null,'expense'));
  $$('[data-action="quick-income"]').forEach(b=>b.onclick=()=>openTransactionSheet(null,'income'));
  $$('[data-action="quick-transfer"]').forEach(b=>b.onclick=()=>openTransactionSheet(null,'transfer'));
  $$('[data-action="quick-plan"], [data-action="add-plan"]').forEach(b=>b.onclick=()=>openPlanSheet());
  $$('[data-action="manage-accounts"]').forEach(b=>b.onclick=openAccountsManager);
  $$('[data-action="manage-categories"]').forEach(b=>b.onclick=openCategoriesManager);
  $$('[data-action="add-budget"]').forEach(b=>b.onclick=()=>openBudgetSheet());
  $$('[data-action="add-goal"]').forEach(b=>b.onclick=()=>openGoalSheet());
  $$('[data-tab-link]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tabLink;render()});
  $$('[data-account]').forEach(b=>b.onclick=()=>openAccountSheet(account(b.dataset.account)));
  $$('[data-plan]').forEach(b=>b.onclick=()=>openPlanSheet(state.plans.find(p=>p.id===b.dataset.plan)));
  const reserve=$('[data-action="reserve"]'); if(reserve)reserve.onclick=openReserveSheet;
  const exj=$('[data-action="export-json"]'); if(exj)exj.onclick=exportJSON;
  const imj=$('[data-action="import-json"]'); if(imj)imj.onclick=()=>$('#importInput').click();
  const exc=$('[data-action="export-csv"]'); if(exc)exc.onclick=exportCSV;
  const clear=$('[data-action="clear-data"]'); if(clear)clear.onclick=clearAllData;
}

function openSheet(html){
  $('#sheet').innerHTML=`<div class="sheet-handle"></div>${html}`;
  $('#sheet').classList.remove('hidden'); $('#sheetBackdrop').classList.remove('hidden');
  $$('.sheet-close').forEach(b=>b.onclick=closeSheet);
}
function closeSheet(){ $('#sheet').classList.add('hidden'); $('#sheetBackdrop').classList.add('hidden'); }

function categoryOptions(type,selected=''){
  return state.categories.filter(c=>c.type===type).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
}
function accountOptions(selected='',exclude=''){
  return state.accounts.filter(a=>a.id!==exclude).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('');
}

function openTransactionSheet(existing=null,initialType='expense'){
  if(!state.accounts.length){showToast('Сначала добавьте хотя бы один счёт');openAccountsManager();return}
  let type=existing?.type||initialType;
  const build=()=>{
    const t=existing||{}; const isTransfer=type==='transfer';
    openSheet(`<div class="sheet-head"><h3>${existing?'Изменить операцию':'Новая операция'}</h3><button class="sheet-close">×</button></div>
      <div class="segmented"><button data-type="expense" class="${type==='expense'?'active':''}">Расход</button><button data-type="income" class="${type==='income'?'active':''}">Доход</button><button data-type="transfer" class="${type==='transfer'?'active':''}">Перевод</button></div>
      <form id="txForm">
        <div class="field"><input class="amount-input" name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="0,00 €" required value="${esc(t.amount||'')}"></div>
        <div class="form-grid">
          ${!isTransfer?`<div class="field full"><label>Категория</label><select name="categoryId">${categoryOptions(type,t.categoryId)}</select></div>`:''}
          <div class="field ${isTransfer?'':'full'}"><label>${isTransfer?'Откуда':'Счёт / способ оплаты'}</label><select name="accountId">${accountOptions(t.accountId||state.accounts[0]?.id)}</select></div>
          ${isTransfer?`<div class="field"><label>Куда</label><select name="toAccountId">${accountOptions(t.toAccountId||state.accounts[1]?.id||state.accounts[0]?.id,t.accountId)}</select></div>`:''}
          <div class="field full"><label>Дата</label><input name="date" type="date" required value="${esc(t.date||todayISO())}"></div>
          <div class="field full"><label>Комментарий</label><input name="note" maxlength="100" placeholder="Например: REWE, аренда, бензин…" value="${esc(t.note||'')}"></div>
        </div>
        <button class="primary-btn" type="submit">${existing?'Сохранить изменения':'Добавить'}</button>
        ${existing?'<button class="danger-btn" type="button" id="deleteTx">Удалить операцию</button>':''}
      </form>`);
    $$('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;build()});
    $('#txForm').onsubmit=async e=>{
      e.preventDefault(); const fd=new FormData(e.currentTarget); const amount=Number(fd.get('amount'));
      if(!amount||amount<=0)return;
      const obj={id:existing?.id||uid(),type,amount,date:fd.get('date'),accountId:fd.get('accountId'),toAccountId:type==='transfer'?fd.get('toAccountId'):null,categoryId:type==='transfer'?null:fd.get('categoryId'),note:String(fd.get('note')||'').trim(),createdAt:existing?.createdAt||Date.now()};
      if(type==='transfer' && obj.accountId===obj.toAccountId){showToast('Выберите разные счета');return}
      if(existing) state.transactions=state.transactions.map(x=>x.id===existing.id?obj:x); else state.transactions.push(obj);
      await persist();closeSheet();render();showToast(existing?'Операция обновлена':'Операция добавлена');
    };
    const del=$('#deleteTx'); if(del)del.onclick=async()=>{if(confirm('Удалить эту операцию?')){state.transactions=state.transactions.filter(x=>x.id!==existing.id);await persist();closeSheet();render();showToast('Операция удалена')}};
  }; build();
}

function openPlanSheet(existing=null){
  if(!state.accounts.length){showToast('Сначала добавьте счёт');return}
  let type=existing?.type||'expense';
  const build=()=>{
    const p=existing||{};
    openSheet(`<div class="sheet-head"><h3>${existing?'Изменить план':'Новая плановая операция'}</h3><button class="sheet-close">×</button></div>
      <div class="segmented" style="grid-template-columns:1fr 1fr"><button data-plan-type="expense" class="${type==='expense'?'active':''}">Расход</button><button data-plan-type="income" class="${type==='income'?'active':''}">Доход</button></div>
      <form id="planForm"><div class="form-grid">
        <div class="field full"><label>Название</label><input name="title" required placeholder="Например: аренда, зарплата или BAföG" value="${esc(p.title||'')}"></div>
        <div class="field full"><label>Сумма</label><input name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal" value="${esc(p.amount||'')}"></div>
        <div class="field full"><label>Категория</label><select name="categoryId">${categoryOptions(type,p.categoryId)}</select></div>
        <div class="field"><label>Повтор</label><select name="frequency" id="planFrequency"><option value="once" ${p.frequency!=='monthly'?'selected':''}>Один раз</option><option value="monthly" ${p.frequency==='monthly'?'selected':''}>Каждый месяц</option></select></div>
        <div class="field"><label id="planDateLabel">${p.frequency==='monthly'?'Первый платёж':'Дата'}</label><input name="date" type="date" required value="${esc(p.date||todayISO())}"></div>
        <div class="field full ${p.frequency==='monthly'?'':'hidden'}" id="planEndField"><label>Дата окончания <span class="field-hint">необязательно</span></label><input name="endDate" type="date" value="${esc(p.endDate||'')}"><small class="field-help">Оставьте пустым, если платёж идёт без ограничения по времени.</small></div>
        <div class="field full"><label>Счёт</label><select name="accountId">${accountOptions(p.accountId||state.accounts[0]?.id)}</select></div>
      </div><button class="primary-btn" type="submit">${existing?'Сохранить':'Добавить в план'}</button>${existing?'<button class="danger-btn" type="button" id="deletePlan">Удалить план</button>':''}</form>`);
    $$('[data-plan-type]').forEach(b=>b.onclick=()=>{type=b.dataset.planType;build()});
    const freq=$('#planFrequency');
    if(freq)freq.onchange=()=>{
      const monthly=freq.value==='monthly';
      $('#planEndField')?.classList.toggle('hidden',!monthly);
      if($('#planDateLabel'))$('#planDateLabel').textContent=monthly?'Первый платёж':'Дата';
    };
    $('#planForm').onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const frequency=fd.get('frequency');
      const date=fd.get('date');
      const endDate=frequency==='monthly'?String(fd.get('endDate')||''):'';
      if(endDate && endDate<date){showToast('Дата окончания не может быть раньше начала');return}
      const obj={id:existing?.id||uid(),type,title:String(fd.get('title')).trim(),amount:Number(fd.get('amount')),categoryId:fd.get('categoryId'),frequency,date,endDate,accountId:fd.get('accountId')};
      if(existing)state.plans=state.plans.map(x=>x.id===existing.id?obj:x);else state.plans.push(obj);
      await persist();closeSheet();render();showToast('План сохранён');
    };
    const del=$('#deletePlan');if(del)del.onclick=async()=>{if(confirm('Удалить эту плановую операцию?')){state.plans=state.plans.filter(x=>x.id!==existing.id);await persist();closeSheet();render()}};
  };build();
}

function openAccountsManager(){
  openSheet(`<div class="sheet-head"><h3>Счета и кошельки</h3><button class="sheet-close">×</button></div><div class="account-list">${state.accounts.map(a=>`<button class="account-item" data-edit-account="${a.id}" style="width:100%;color:inherit;text-align:left"><div class="account-icon">${esc(a.icon||'💳')}</div><div class="item-main"><div class="item-title">${esc(a.name)}</div><div class="item-sub">${accountTypeName(a.type)}</div></div><div class="item-amount">${fmt(accountBalance(a.id))}</div><span class="chevron">›</span></button>`).join('')}</div><button class="primary-btn" id="newAccount" style="margin-top:14px">Добавить счёт</button>`);
  $$('[data-edit-account]').forEach(b=>b.onclick=()=>openAccountSheet(account(b.dataset.editAccount)));
  $('#newAccount').onclick=()=>openAccountSheet();
}

function openAccountSheet(existing=null){
  const a=existing||{};
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить счёт':'Новый счёт'}</h3><button class="sheet-close">×</button></div><form id="accountForm"><div class="form-grid">
    <div class="field"><label>Иконка</label><select name="icon">${['💳','🏦','💶','💰','🪙','📱','🧾'].map(i=>`<option ${i===(a.icon||'💳')?'selected':''}>${i}</option>`).join('')}</select></div>
    <div class="field"><label>Тип</label><select name="type">${[['card','Карта'],['bank','Банковский счёт'],['cash','Наличные'],['savings','Накопительный'],['credit','Кредитная карта'],['other','Другой']].map(([v,n])=>`<option value="${v}" ${v===(a.type||'card')?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="field full"><label>Название</label><input name="name" required maxlength="40" placeholder="Например: Revolut" value="${esc(a.name||'')}"></div>
    <div class="field full"><label>Начальный остаток</label><input name="openingBalance" type="number" step="0.01" inputmode="decimal" value="${esc(a.openingBalance??0)}"></div>
  </div><div class="notice">Начальный остаток — сумма на счёте до первой внесённой в приложение операции. Позже баланс меняется автоматически.</div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button class="danger-btn" type="button" id="deleteAccount">Удалить счёт</button>':''}</form>`);
  $('#accountForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),name:String(fd.get('name')).trim(),type:fd.get('type'),icon:fd.get('icon'),openingBalance:Number(fd.get('openingBalance')||0)};if(existing)state.accounts=state.accounts.map(x=>x.id===existing.id?obj:x);else state.accounts.push(obj);await persist();closeSheet();render();showToast('Счёт сохранён')};
  const del=$('#deleteAccount');if(del)del.onclick=async()=>{const used=state.transactions.some(t=>t.accountId===existing.id||t.toAccountId===existing.id)||state.plans.some(p=>p.accountId===existing.id);if(used){showToast('Счёт используется в операциях или планах');return}if(state.accounts.length<=1){showToast('Нужен хотя бы один счёт');return}if(confirm('Удалить этот счёт?')){state.accounts=state.accounts.filter(x=>x.id!==existing.id);await persist();closeSheet();render()}};
}

function openCategoriesManager(){
  const row=c=>`<button class="account-item" data-edit-category="${c.id}" style="width:100%;color:inherit;text-align:left"><div class="account-icon">${esc(c.icon)}</div><div class="item-main"><div class="item-title">${esc(c.name)}</div><div class="item-sub">${c.type==='expense'?'Расход':'Доход'}</div></div><span class="chevron">›</span></button>`;
  openSheet(`<div class="sheet-head"><h3>Категории</h3><button class="sheet-close">×</button></div><div class="section-head"><h2>Расходы</h2></div><div class="account-list">${state.categories.filter(c=>c.type==='expense').map(row).join('')}</div><div class="section-head" style="margin-top:18px"><h2>Доходы</h2></div><div class="account-list">${state.categories.filter(c=>c.type==='income').map(row).join('')}</div><button class="primary-btn" id="newCategory" style="margin-top:14px">Добавить категорию</button>`);
  $$('[data-edit-category]').forEach(b=>b.onclick=()=>openCategorySheet(category(b.dataset.editCategory)));
  $('#newCategory').onclick=()=>openCategorySheet();
}
function openCategorySheet(existing=null){
  const c=existing||{};
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить категорию':'Новая категория'}</h3><button class="sheet-close">×</button></div><form id="catForm"><div class="form-grid"><div class="field"><label>Иконка</label><input name="icon" maxlength="4" value="${esc(c.icon||'📌')}"></div><div class="field"><label>Тип</label><select name="type"><option value="expense" ${c.type!=='income'?'selected':''}>Расход</option><option value="income" ${c.type==='income'?'selected':''}>Доход</option></select></div><div class="field full"><label>Название</label><input name="name" required maxlength="40" value="${esc(c.name||'')}"></div></div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button class="danger-btn" id="deleteCat" type="button">Удалить категорию</button>':''}</form>`);
  $('#catForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),name:String(fd.get('name')).trim(),icon:String(fd.get('icon')||'📌').trim(),type:fd.get('type'),preset:existing?.preset||false};if(existing)state.categories=state.categories.map(x=>x.id===existing.id?obj:x);else state.categories.push(obj);await persist();closeSheet();render();showToast('Категория сохранена')};
  const del=$('#deleteCat');if(del)del.onclick=async()=>{const used=state.transactions.some(t=>t.categoryId===existing.id)||state.plans.some(p=>p.categoryId===existing.id)||state.budgets.some(b=>b.categoryId===existing.id);if(used){showToast('Категория используется в данных');return}if(confirm('Удалить категорию?')){state.categories=state.categories.filter(x=>x.id!==existing.id);await persist();closeSheet();render()}};
}

function openBudgetSheet(existing=null){
  const b=existing||{};
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить бюджет':'Новый бюджет'}</h3><button class="sheet-close">×</button></div><form id="budgetForm"><div class="field"><label>Категория расходов</label><select name="categoryId">${categoryOptions('expense',b.categoryId)}</select></div><div class="field"><label>Лимит в месяц</label><input name="limit" type="number" step="0.01" min="0" inputmode="decimal" required value="${esc(b.limit||'')}"></div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button type="button" class="danger-btn" id="deleteBudget">Удалить бюджет</button>':''}</form>`);
  $('#budgetForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),categoryId:fd.get('categoryId'),limit:Number(fd.get('limit'))};state.budgets=state.budgets.filter(x=>x.id===existing?.id||x.categoryId!==obj.categoryId);if(existing)state.budgets=state.budgets.map(x=>x.id===existing.id?obj:x);else state.budgets.push(obj);await persist();closeSheet();render()};
  const del=$('#deleteBudget');if(del)del.onclick=async()=>{state.budgets=state.budgets.filter(x=>x.id!==existing.id);await persist();closeSheet();render()};
}

function openGoalSheet(existing=null){
  const g=existing||{};
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить цель':'Новая цель'}</h3><button class="sheet-close">×</button></div><form id="goalForm"><div class="field"><label>Название</label><input name="title" required maxlength="50" placeholder="Например: отпуск" value="${esc(g.title||'')}"></div><div class="form-grid"><div class="field"><label>Цель</label><input name="target" type="number" step="0.01" min="0" required value="${esc(g.target||'')}"></div><div class="field"><label>Уже отложено</label><input name="saved" type="number" step="0.01" min="0" value="${esc(g.saved||0)}"></div></div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button type="button" class="danger-btn" id="deleteGoal">Удалить цель</button>':''}</form>`);
  $('#goalForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),title:String(fd.get('title')).trim(),target:Number(fd.get('target')),saved:Number(fd.get('saved')||0)};if(existing)state.goals=state.goals.map(x=>x.id===existing.id?obj:x);else state.goals.push(obj);await persist();closeSheet();render()};
  const del=$('#deleteGoal');if(del)del.onclick=async()=>{state.goals=state.goals.filter(x=>x.id!==existing.id);await persist();closeSheet();render()};
}

function openReserveSheet(){
  openSheet(`<div class="sheet-head"><h3>Неприкосновенный резерв</h3><button class="sheet-close">×</button></div><form id="reserveForm"><div class="field"><label>Сумма резерва</label><input name="reserve" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(state.settings.reserve||0)}"></div><div class="notice">Резерв не меняет реальный баланс. Он вычитается только из показателя «Свободно», чтобы не считать эти деньги доступными для обычных трат.</div><button class="primary-btn" type="submit">Сохранить</button></form>`);
  $('#reserveForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);state.settings.reserve=Number(fd.get('reserve')||0);await persist();closeSheet();render()};
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJSON(){
  const stamp=todayISO(); downloadBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),`money-backup-${stamp}.json`);showToast('Резервная копия создана');
}
function exportCSV(){
  const rows=[['date','type','amount','category','account','to_account','comment']];
  [...state.transactions].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t=>rows.push([t.date,t.type,t.amount,category(t.categoryId)?.name||'',account(t.accountId)?.name||'',account(t.toAccountId)?.name||'',t.note||'']));
  const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`money-operations-${todayISO()}.csv`);showToast('CSV создан');
}
async function clearAllData(){
  if(!confirm('Удалить все счета, операции, планы и настройки? Это действие нельзя отменить без резервной копии.'))return;
  state=defaultState();await persist();activeTab='overview';render();showToast('Данные удалены');
}

async function handleImport(file){
  try{const text=await file.text();const parsed=JSON.parse(text);if(!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions))throw new Error('bad');if(!confirm('Заменить текущие данные содержимым резервной копии?'))return;state=normalizeState(parsed);await persist();render();showToast('Резервная копия восстановлена')}catch(e){showToast('Не удалось прочитать файл резервной копии')}
}

function bindShell(){
  $$('.nav-item').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;render()});
  $('#fab').onclick=()=>openTransactionSheet();
  $('#sheetBackdrop').onclick=closeSheet;
  $('#privacyToggle').onclick=async()=>{state.settings.privacy=!state.settings.privacy;$('#privacyIcon').textContent=state.settings.privacy?'◌':'◉';await persist();render()};
  $('#importInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)handleImport(f);e.target.value=''})
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
  document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
  let lastTouchEnd=0;
  document.addEventListener('touchend',e=>{
    const now=Date.now();
    if(now-lastTouchEnd<320){ e.preventDefault(); }
    lastTouchEnd=now;
  },{passive:false});
  ['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,e=>e.preventDefault(),{passive:false}));
}

async function init(){
  const saved=await dbGet().catch(()=>null); state=normalizeState(saved||defaultState()); if(!saved)await persist();
  const now=new Date(); $('#todayLabel').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(now);
  $('#privacyIcon').textContent=state.settings.privacy?'◌':'◉'; bindShell(); render();
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
}

init();
