'use strict';

const DB_NAME = 'money-pwa-db';
const DB_VERSION = 1;
const STORE = 'app';
const STATE_KEY = 'state';
const COLORS = ['#7c9cff','#5dd7a9','#ffcc66','#ff7b8a','#b58cff','#6ed6ff','#ff9f68','#9ad37d','#d990ff','#78cbbf'];
const APP_VERSION = '4.9.0';
let undoAction = null;
let previousTab = 'overview';
let pageTransitionTimer = null;
let displaySnapshot = new Map();
let numberObserver = null;

const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function fmtMajor(n, signed=false){
  const val=Number(n)||0;
  if(state?.settings?.privacy) return '•••• €';
  const digits=state?.settings?.showCentsDashboard?2:0;
  const abs=new Intl.NumberFormat('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Math.abs(val));
  const sign=signed?(val>0?'+':val<0?'−':''):(val<0?'−':'');
  return `${sign}${abs} €`;
}
function uiIcon(name, cls=''){
  const paths={
    card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9.2h18M7 15h4"/>',
    bank:'<path d="M3 9 12 4l9 5M5 10.5h14M6.5 10.5V18M10.2 10.5V18M13.8 10.5V18M17.5 10.5V18M4 20h16"/>',
    cash:'<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.7"/><path d="M6 9h.01M18 15h.01"/>',
    safe:'<rect x="4" y="3.5" width="16" height="17" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8v2.1l1.7 1.2M7 7h.01"/>',
    wallet:'<path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h11v3.5"/><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z"/>',
    transfer:'<path d="M7 5v13m0 0-3-3m3 3 3-3M17 19V6m0 0-3 3m3-3 3 3"/>',
    tag:'<path d="M4 4h7l9 9-7 7-9-9Z"/><circle cx="8" cy="8" r="1.2"/>',
    shield:'<path d="M12 3 19 6v5.2c0 4.5-2.8 7.5-7 9.8-4.2-2.3-7-5.3-7-9.8V6Z"/><path d="m9 12 2 2 4-4"/>',
    upload:'<path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/>',
    download:'<path d="M12 4v12m0 0-4-4m4 4 4-4M5 18v2h14v-2"/>',
    file:'<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h5"/>',
    search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    chart:'<path d="M4 19V11M10 19V5M16 19V9M22 19H2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    eye:'<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
    eyeoff:'<path d="m4 4 16 16M9.9 6.3A9.7 9.7 0 0 1 12 6c6 0 9.5 6 9.5 6a15.5 15.5 0 0 1-2.7 3.4M6.1 7.1A15 15 0 0 0 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    goal:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M18 6 21 3M18 3h3v3"/>',
    sparkles:'<path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2ZM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8ZM5.5 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z"/>'
  };
  return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.info}</svg>`;
}
function accountGlyph(type){
  const key=type==='cash'?'cash':type==='bank'?'bank':type==='savings'?'safe':type==='credit'?'card':'card';
  return uiIcon(key);
}

const defaultState = () => ({
  version: 4,
  settings: { currency:'EUR', reserve:0, privacy:false, lastAccountByType:{}, lastCategoryByType:{}, lastBackupAt:null, animationSpeed:'smooth', interfaceDensity:'standard', accent:'blue', dashboardMode:'standard', adaptiveHome:true, showCentsDashboard:false, showGestureHints:true, upcomingCount:5, advanced:false },
  accounts: [
    { id:'acc-main', name:'Основная карта', type:'card', openingBalance:0, icon:'💳', protected:false },
    { id:'acc-cash', name:'Наличные', type:'cash', openingBalance:0, icon:'💶', protected:false }
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
  planCompletions: [],
  budgets: [],
  goals: []
});

let state = defaultState();
let activeTab = 'overview';
let txFilter = 'all';
let txSearch = '';
let statsRange = 6;
let planForecastRange = 12;
let planScenario = { extraIncome:0, extraExpense:0, oneTimeExpense:0, oneTimeMonth:3 };
let toastTimer = null;
const chartRegistry = new Map();
const UI_STORAGE_KEY = 'money-ui-v4';
let uiMemory = { scroll:{}, planExplain:false };
let forecastRefreshTimer = null;
let searchRefreshTimer = null;

function loadUIState(){
  try{
    const raw=localStorage.getItem(UI_STORAGE_KEY);
    if(raw) uiMemory={...uiMemory,...JSON.parse(raw)};
  }catch(_){}
}
function saveUIState(){
  try{localStorage.setItem(UI_STORAGE_KEY,JSON.stringify(uiMemory))}catch(_){}
}
function rememberViewState(){
  uiMemory.scroll={...(uiMemory.scroll||{}),[activeTab]:window.scrollY||0};
  uiMemory.txFilter=txFilter;uiMemory.statsRange=statsRange;uiMemory.planForecastRange=planForecastRange;
  saveUIState();
}
function restoreViewState(tab=activeTab){
  const y=Number(uiMemory.scroll?.[tab])||0;
  requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'instant'}));
}
function motionProfile(){
  const key=state?.settings?.animationSpeed||'smooth';
  return ({slow:{factor:1.55,label:'Очень плавно'},smooth:{factor:1.25,label:'Плавно'},normal:{factor:1,label:'Стандарт'},fast:{factor:.72,label:'Быстро'},minimal:{factor:.05,label:'Минимум'}})[key]||{factor:1.25,label:'Плавно'};
}
function motionMs(base){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return 1;
  return Math.max(1,Math.round(base*motionProfile().factor));
}
function applyUISettings(){
  const root=document.documentElement;
  const factor=motionProfile().factor;
  root.dataset.motion=state.settings.animationSpeed||'smooth';
  root.dataset.density=state.settings.interfaceDensity||'standard';
  root.dataset.accent=state.settings.accent||'blue';
  root.dataset.dashboard=state.settings.dashboardMode||'standard';
  root.style.setProperty('--motion-factor',String(factor));
  root.style.setProperty('--motion-instant',`${Math.max(1,Math.round(90*factor))}ms`);
  root.style.setProperty('--motion-fast',`${Math.max(1,Math.round(145*factor))}ms`);
  root.style.setProperty('--motion-base',`${Math.max(1,Math.round(210*factor))}ms`);
  root.style.setProperty('--motion-slow',`${Math.max(1,Math.round(330*factor))}ms`);
  root.style.setProperty('--tab-duration',`${Math.max(1,Math.round(330*factor))}ms`);
  root.style.setProperty('--sheet-duration',`${Math.max(1,Math.round(360*factor))}ms`);
}


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
    version:4,
    settings:{
      ...d.settings,
      ...(s.settings||{}),
      lastAccountByType:{...(d.settings.lastAccountByType||{}),...((s.settings||{}).lastAccountByType||{})},
      lastCategoryByType:{...(d.settings.lastCategoryByType||{}),...((s.settings||{}).lastCategoryByType||{})}
    },
    accounts:(Array.isArray(s.accounts)?s.accounts:d.accounts).map(a=>({...a,protected:Boolean(a.protected)})),
    categories:Array.isArray(s.categories)?s.categories:d.categories,
    transactions:Array.isArray(s.transactions)?s.transactions:[],
    plans:Array.isArray(s.plans)?s.plans.map(p=>({
      ...p,
      frequency:p.frequency==='monthly'?'monthly':'once',
      endDate:p.endDate||'',
      required:p.type==='expense' ? (p.required!==false) : false
    })):[],
    planCompletions:Array.isArray(s.planCompletions)?s.planCompletions:[],
    budgets:Array.isArray(s.budgets)?s.budgets:[],
    goals:Array.isArray(s.goals)?s.goals.map(g=>({...g,targetDate:g.targetDate||''})):[]
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
function protectedBalance(){ return state.accounts.filter(a=>a.protected).reduce((s,a)=>s+Math.max(0,accountBalance(a.id)),0); }
function explicitReserve(){ return Math.max(0,Number(state.settings.reserve)||0); }
function reservedBalance(){ return protectedBalance()+explicitReserve(); }
function occurrenceKey(planId,date){ return `${planId}|${typeof date==='string'?date:toISODate(date)}`; }
function isOccurrenceCompleted(planId,date){
  const key=occurrenceKey(planId,date);
  return state.planCompletions.some(x=>occurrenceKey(x.planId,x.date)===key);
}
function completionFor(planId,date){
  const key=occurrenceKey(planId,date);
  return state.planCompletions.find(x=>occurrenceKey(x.planId,x.date)===key)||null;
}

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
    .filter(p=>p.type===type && p.frequency==='monthly')
    .map(p=>({p,date:occurrenceInMonth(p,monthDate)}))
    .filter(x=>x.date && !isOccurrenceCompleted(x.p.id,x.date))
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}

function hasRecurringPlan(type){
  return state.plans.some(p=>p.type===type && p.frequency==='monthly');
}

function oncePlansForMonth(type, monthDate){
  return state.plans
    .filter(p=>p.type===type && p.frequency==='once')
    .map(p=>({p,date:occurrenceInMonth(p,monthDate)}))
    .filter(x=>x.date && !isOccurrenceCompleted(x.p.id,x.date))
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}

function planItemsForMonth(monthDate){
  const items=[];
  for(const p of state.plans){
    const date=occurrenceInMonth(p,monthDate);
    if(!date || isOccurrenceCompleted(p.id,date)) continue;
    items.push({p,date});
  }
  return items.sort((a,b)=>a.date-b.date);
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
    const events=planItemsForMonth(d).map(({p,date})=>({
      id:p.id,
      date:toISODate(date),
      title:p.title||planCategory(p)?.name||'План',
      category:planCategory(p)?.name||'Без категории',
      account:account(p.accountId)?.name||'',
      type:p.type,
      amount:Number(p.amount)||0,
      required:Boolean(p.required)
    }));
    if(simulatedOnce>0) events.push({id:'scenario',date:'',title:'Сценарий: разовая трата',type:'expense',amount:simulatedOnce,required:false});
    balance+=income-expense;
    totalIncome+=income; totalExpense+=expense;
    series.push({
      label:monthLabel(d),
      tooltipLabel:new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(d),
      value:balance,income,expense,events
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


function forecastRowBreakdown(row){
  const events=Array.isArray(row?.events)?row.events:[];
  const expenseEvents=events.filter(e=>e.type==='expense');
  const incomeEvents=events.filter(e=>e.type==='income');
  const sumExp=expenseEvents.reduce((s,e)=>s+Number(e.amount||0),0);
  const sumInc=incomeEvents.reduce((s,e)=>s+Number(e.amount||0),0);
  const group=(rows)=>{
    const m=new Map();
    rows.forEach(e=>{
      const key=e.title||e.category||'Без названия';
      const prev=m.get(key)||{title:key,category:e.category||'',amount:0,required:false};
      prev.amount+=Number(e.amount||0);
      prev.required=prev.required||Boolean(e.required);
      m.set(key,prev);
    });
    return [...m.values()].sort((a,b)=>b.amount-a.amount);
  };
  return {
    expenses:group(expenseEvents),
    incomes:group(incomeEvents),
    unassignedExpense:Math.max(0,(Number(row?.expense)||0)-sumExp),
    unassignedIncome:Math.max(0,(Number(row?.income)||0)-sumInc)
  };
}
function planAlgorithmAnalysis(forecast, health){
  const rows=forecast.series.slice(1);
  const deficits=rows.filter(r=>(Number(r.expense)||0)>(Number(r.income)||0)+.005);
  const messages=[];
  if(deficits.length){
    const worst=health.cashflow.worstDeficit;
    messages.push({
      level:'priority',
      title:`Закрыть базовый разрыв ${fmtMajor(health.cashflow.required)} / мес.`,
      text:`Это минимальная прибавка к доходу или такое же сокращение расходов, чтобы даже самый дефицитный месяц (${esc(worst?.tooltipLabel||worst?.label||'')}) перестал быть отрицательным.`
    });
    const optional=[];
    let requiredTotal=0, expenseTotal=0;
    deficits.forEach(r=>{
      const b=forecastRowBreakdown(r);
      b.expenses.forEach(e=>{
        expenseTotal+=e.amount;
        if(e.required) requiredTotal+=e.amount;
        else optional.push({...e,month:r.tooltipLabel||r.label});
      });
      expenseTotal+=b.unassignedExpense;
    });
    optional.sort((a,b)=>b.amount-a.amount);
    if(optional.length){
      const top=optional[0];
      messages.push({
        level:'action',
        title:`Проверить необязательные траты`,
        text:`Самая крупная гибкая плановая трата в дефицитных месяцах — ${esc(top.title)} ${fmtMajor(top.amount)} (${esc(top.month)}). Её перенос или уменьшение сразу сокращает дефицит.`
      });
    }
    if(expenseTotal>0 && requiredTotal/expenseTotal>=.7){
      messages.push({
        level:'info',
        title:'Основная нагрузка — обязательные расходы',
        text:`Около ${Math.round(requiredTotal/expenseTotal*100)}% явно размеченных расходов в дефицитных месяцах обязательные. В такой структуре безопаснее в первую очередь увеличивать регулярный доход, а не пытаться урезать небольшие переменные категории.`
      });
    }
    if(deficits.length>=Math.ceil(rows.length*.6)){
      messages.push({
        level:'info',
        title:'Дефицит носит системный характер',
        text:`Отрицательный результат есть в ${deficits.length} из ${rows.length} месяцев. Это уже не единичная крупная покупка: стоит менять ежемесячный баланс доходов и расходов.`
      });
    }else if(deficits.length===1){
      messages.push({
        level:'info',
        title:'Проблема локальная',
        text:'Дефицит возникает только в одном месяце. Сначала проверьте разовые покупки и возможность перенести их, прежде чем менять постоянный ежемесячный бюджет.'
      });
    }
  }else{
    const avgNet=rows.length?rows.reduce((s,r)=>s+(Number(r.income)||0)-(Number(r.expense)||0),0)/rows.length:0;
    messages.push({
      level:'good',
      title:'План сбалансирован',
      text:`Во всех выбранных месяцах доходы покрывают расходы. Средний расчётный результат месяца: ${fmtMajor(avgNet,true)}.`
    });
    if(avgNet>0){
      messages.push({
        level:'info',
        title:'Есть пространство для цели или резерва',
        text:`Если этот запас устойчив, часть среднего профицита ${fmtMajor(avgNet)} можно направлять в защищённые накопления или финансовую цель.`
      });
    }
  }
  const final=forecast.series.at(-1)?.value??totalBalance();
  if(final<0){
    messages.push({level:'priority',title:'Капитал уходит ниже нуля',text:`К концу выбранного периода расчётный капитал составляет ${fmtMajor(final)}. Одного исправления отдельного месяца недостаточно — нужен более крупный пересмотр плана.`});
  }
  return messages.slice(0,5);
}
function planMonthDetailHTML(row){
  const b=forecastRowBreakdown(row);
  const expenseLines=b.expenses.map(e=>`<li><span>${e.required?'<b class="required-dot">обяз.</b> ':''}${esc(e.title)}</span><strong>−${fmtMajor(e.amount)}</strong></li>`).join('');
  const incomeLines=b.incomes.map(e=>`<li><span>${esc(e.title)}</span><strong class="positive">+${fmtMajor(e.amount)}</strong></li>`).join('');
  const otherExp=b.unassignedExpense>.005?`<li><span>Средние/неразмеченные расходы</span><strong>−${fmtMajor(b.unassignedExpense)}</strong></li>`:'';
  const otherInc=b.unassignedIncome>.005?`<li><span>Средний/неразмеченный доход</span><strong class="positive">+${fmtMajor(b.unassignedIncome)}</strong></li>`:'';
  return `<div class="deficit-month-card">
    <div class="deficit-month-head"><div><small>${esc(row.tooltipLabel||row.label||'')}</small><strong class="negative">${fmtMajor(row.net,true)}</strong></div><div class="deficit-flow"><span>+${fmtMajor(row.income)}</span><span>−${fmtMajor(row.expense)}</span></div></div>
    ${(incomeLines||otherInc)?`<div class="breakdown-group"><b>Приходит</b><ul>${incomeLines}${otherInc}</ul></div>`:''}
    <div class="breakdown-group"><b>Уходит</b><ul>${expenseLines}${otherExp||'<li><span>Расходы по расчёту месяца</span><strong>−'+fmtMajor(row.expense)+'</strong></li>'}</ul></div>
  </div>`;
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
  if(plan.frequency==='once') return start>=f && (!end || start<=end) && !isOccurrenceCompleted(plan.id,start) ? start : null;
  for(let i=0;i<=72;i++){
    const md=addMonths(f,i);
    const occ=occurrenceInMonth(plan,md);
    if(occ && occ>=f && !isOccurrenceCompleted(plan.id,occ)) return occ;
    if(end && new Date(md.getFullYear(),md.getMonth(),1,12)>end) break;
  }
  return null;
}

function planOccurrencesBetween(start,end,{includeCompleted=false}={}){
  const out=[];
  for(const p of state.plans){
    if(p.frequency==='once'){
      const d=planStart(p);
      if(d>=start && d<=end && (includeCompleted || !isOccurrenceCompleted(p.id,d))) out.push({p,date:d,completed:isOccurrenceCompleted(p.id,d)});
      continue;
    }
    let cursor=new Date(start.getFullYear(),start.getMonth(),1,12);
    const stop=new Date(end.getFullYear(),end.getMonth(),1,12);
    while(cursor<=stop){
      const d=occurrenceInMonth(p,cursor);
      if(d && d>=start && d<=end && (includeCompleted || !isOccurrenceCompleted(p.id,d))) out.push({p,date:d,completed:isOccurrenceCompleted(p.id,d)});
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

function primaryUpcomingPlans(){
  const now=new Date(); now.setHours(0,0,0,0);
  // До 20-го числа — только остаток текущего месяца.
  // С 20-го — остаток текущего + весь следующий месяц.
  const end=now.getDate()>=20 ? endOfMonth(addMonths(now,1)) : endOfMonth(now);
  return planOccurrencesBetween(now,end);
}
function allUpcoming30Days(){
  return upcomingPlans(30);
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

function upcomingExpenses(days=30,{requiredOnly=false}={}){
  return upcomingPlans(days)
    .filter(x=>x.p.type==='expense' && (!requiredOnly || x.p.required))
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}
function mandatoryExpenses(days=30){ return upcomingExpenses(days,{requiredOnly:true}); }
function mandatoryFreeImpact(days=30){
  return upcomingPlans(days)
    .filter(x=>x.p.type==='expense' && x.p.required && !account(x.p.accountId)?.protected)
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}
function freeBalance(){ return totalBalance()-reservedBalance()-mandatoryFreeImpact(30); }

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

function budgetSnapshot(key=monthKey()){
  const spentMap={};
  state.transactions.filter(t=>t.type==='expense' && (t.date||'').slice(0,7)===key).forEach(t=>{
    spentMap[t.categoryId]=(spentMap[t.categoryId]||0)+Number(t.amount||0);
  });
  return state.budgets.map(b=>{
    const spent=spentMap[b.categoryId]||0;
    const limit=Math.max(0,Number(b.limit)||0);
    return {...b,spent,limit,remaining:limit-spent,ratio:limit?spent/limit:0,category:category(b.categoryId)};
  }).sort((a,b)=>b.ratio-a.ratio);
}

function monthsUntil(dateISO){
  if(!dateISO)return null;
  const d=parseISO(dateISO), now=new Date();
  const months=(d.getFullYear()-now.getFullYear())*12+(d.getMonth()-now.getMonth());
  return Math.max(1,months+(d.getDate()>=now.getDate()?0:0));
}
function goalMonthlyNeed(goal){
  const remain=Math.max(0,Number(goal.target||0)-Number(goal.saved||0));
  const months=monthsUntil(goal.targetDate);
  return months?remain/months:null;
}
function savingsRateSeries(count=6){
  return monthlySeries(count).map(x=>({label:x.label,value:x.income?((x.income-x.expense)/x.income*100):0,income:x.income,expense:x.expense}));
}
function previousMonthKey(){ return monthKey(addMonths(new Date(),-1)); }
function monthComparison(){
  const cur=monthTotals(), prev=monthTotals(previousMonthKey());
  return {
    current:cur,previous:prev,
    expenseDelta:prev.expense?((cur.expense-prev.expense)/prev.expense*100):null,
    incomeDelta:prev.income?((cur.income-prev.income)/prev.income*100):null
  };
}
function financialRunway(){
  const avg=actualAverage('expense');
  return avg>0?Math.max(0,(totalBalance()-reservedBalance())/avg):null;
}


function lastTransactionDate(){
  const dates=state.transactions.map(t=>t.date).filter(Boolean).sort();
  return dates.length?parseISO(dates.at(-1)):null;
}
function daysSince(date){
  if(!date)return null;
  const a=new Date();a.setHours(0,0,0,0);const b=new Date(date);b.setHours(0,0,0,0);
  return Math.max(0,Math.floor((a-b)/86400000));
}
function nextIncomeOccurrence(){
  return upcomingPlans(90).find(x=>x.p.type==='income')||null;
}
function safeDailySpend(){
  const next=nextIncomeOccurrence();
  const free=Math.max(0,freeBalance());
  if(!next)return null;
  const today=new Date();today.setHours(0,0,0,0);
  const days=Math.max(1,Math.ceil((next.date-today)/86400000));
  return {amount:free/days,days,date:next.date,title:next.p.title||planCategory(next.p)?.name||'Следующий доход'};
}
function attentionItems(){
  const items=[];
  const now=new Date();now.setHours(0,0,0,0);
  const overdue=[];
  for(const p of state.plans){
    if(p.frequency==='once'){
      const d=planStart(p);
      if(d<now&&!isOccurrenceCompleted(p.id,d))overdue.push({p,date:d});
    }
  }
  if(overdue.length)items.push({id:'overdue',level:'warn',icon:'calendar',title:`Просрочено планов: ${overdue.length}`,sub:'Проведите, перенесите или удалите событие.',action:'open-overdue'});
  const over=budgetSnapshot().filter(b=>b.ratio>1);
  if(over.length)items.push({id:'budgets',level:'warn',icon:'chart',title:`Перерасход бюджетов: ${over.length}`,sub:`Самый большой — ${over[0].category?.name||'категория'}.`,action:'open-budgets'});
  if(freeBalance()<0)items.push({id:'free',level:'danger',icon:'info',title:'Свободные деньги ниже нуля',sub:'Обязательства ближайших 30 дней превышают доступный остаток.',action:'explain-free'});
  const health=monthlyCashflowHealth(forecastSeries(3).series);
  if(health.hasDeficit)items.push({id:'cashflow',level:'warn',icon:'chart',title:`Дефицит до ${fmtMajor(health.required)} / мес.`,sub:'В одном из ближайших месяцев расходы выше доходов.',action:'explain-cashflow'});
  const age=daysSince(lastTransactionDate());
  if(age!==null&&age>=10)items.push({id:'stale',level:'info',icon:'info',title:`Данные не обновлялись ${age} дн.`,sub:'Прогноз может быть менее точным.',action:'open-quick'});
  const backupAge=state.settings.lastBackupAt?Math.floor((Date.now()-state.settings.lastBackupAt)/86400000):null;
  if(state.transactions.length&&(backupAge===null||backupAge>=14))items.push({id:'backup',level:'info',icon:'upload',title:'Пора сделать резервную копию',sub:backupAge===null?'Копия ещё не создавалась.':`Последняя копия была ${backupAge} дн. назад.`,action:'export-json'});
  const review=state.transactions.filter(t=>t.needsReview).length;
  if(review)items.unshift({id:'review',level:'info',icon:'tag',title:`Нужно уточнить операций: ${review}`,sub:'Быстрые записи без точной категории.',action:'open-review'});
  return items;
}
function explanationData(key){
  const total=totalBalance(), reserved=reservedBalance(), mandatory=mandatoryFreeImpact(30), free=freeBalance();
  const m=monthTotals();const runway=financialRunway();
  const forecast=forecastSeries(3);const health=monthlyCashflowHealth(forecast.series);
  const map={
    capital:{title:'Общий капитал',lead:fmtMajor(total),body:`Это сумма остатков всех счетов и наличных. Переводы между своими счетами капитал не меняют.`},
    free:{title:'Свободные деньги',lead:fmtMajor(free),body:`Расчёт: капитал ${fmtMajor(total)} − резерв ${fmtMajor(reserved)} − обязательные платежи ближайших 30 дней ${fmtMajor(mandatory)}. Это ориентир, а не банковский лимит.`},
    reserve:{title:'Зарезервировано',lead:fmtMajor(reserved),body:`Сюда входят защищённые счета (${fmtMajor(protectedBalance())}) и дополнительный резерв (${fmtMajor(explicitReserve())}). Эти деньги остаются частью капитала.`},
    month:{title:'Прогноз конца месяца',lead:fmtMajor(monthRemainingSummary().projected),body:`Текущий капитал ${fmtMajor(total)} + оставшиеся плановые доходы ${fmtMajor(monthRemainingSummary().income)} − оставшиеся плановые расходы ${fmtMajor(monthRemainingSummary().expense)}.`},
    savings:{title:'Savings rate',lead:m.income?`${Math.round(m.net/m.income*100)}%`:'—',body:'Доля дохода текущего месяца, которая осталась после расходов. Формула: (доходы − расходы) ÷ доходы.'},
    runway:{title:'Финансовый запас',lead:runway===null?'—':`${runway.toFixed(1)} мес.`,body:'Сколько месяцев можно покрывать средние расходы последних 90 дней доступным капиталом после резерва.'},
    cashflow:{title:'Месячный дефицит',lead:health.hasDeficit?`${fmtMajor(health.required)} / мес.`:'Дефицита нет',body:health.hasDeficit?'Берётся самый дефицитный месяц ближайших трёх: его расходы минус доходы. Это не означает, что весь капитал станет отрицательным.':'Во всех ближайших трёх месяцах расчётные доходы не ниже расходов.'}
  };
  return map[key]||map.capital;
}
function openExplanation(key){
  const x=explanationData(key);
  openSheet(`<div class="sheet-head"><h3>${esc(x.title)}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="explain-card"><div class="explain-lead">${esc(x.lead)}</div><p>${esc(x.body)}</p></div><button class="primary-btn sheet-close" type="button">Понятно</button>`);
}
function openInbox(){
  const items=attentionItems();
  openSheet(`<div class="sheet-head"><h3>Требует внимания</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>${items.length?`<div class="inbox-list">${items.map(x=>`<button class="inbox-item ${x.level}" data-inbox-action="${x.action}"><span>${uiIcon(x.icon)}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.sub)}</small></div>${uiIcon('chevron')}</button>`).join('')}</div>`:`<div class="empty-inline"><strong>Всё в порядке</strong><span>Сейчас нет ничего, что требует решения.</span></div>`}`);
  $$('[data-inbox-action]').forEach(b=>b.onclick=()=>handleInboxAction(b.dataset.inboxAction));
}
function handleInboxAction(action){
  if(action==='export-json'){closeSheet();exportJSON();return}
  if(action==='open-quick'){openQuickCapture();return}
  if(action==='open-review'){closeSheet();activeTab='transactions';txSearch='review:';render({motion:'none'});return}
  if(action==='open-budgets'){closeSheet();activeTab='plan';render({motion:'none'});setTimeout(()=>document.querySelector('[data-action="add-budget"]')?.scrollIntoView({behavior:'smooth',block:'center'}),100);return}
  if(action==='open-overdue'){closeSheet();activeTab='plan';render({motion:'none'});return}
  if(action==='explain-free')return openExplanation('free');
  if(action==='explain-cashflow')return openExplanation('cashflow');
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
  let rawMin=Math.min(...vals), rawMax=Math.max(...vals);
  const rawRange=Math.max(1, rawMax-rawMin);
  let min=rawMin-rawRange*0.12, max=rawMax+rawRange*0.12;
  const approxStep=Math.max(1,(max-min)/2);
  const mag=10**Math.floor(Math.log10(Math.abs(approxStep)||1));
  const norm=approxStep/mag;
  const niceNorm=norm<=1?1:norm<=2?2:norm<=5?5:10;
  const step=niceNorm*mag;
  min=Math.floor(min/step)*step;
  max=Math.ceil(max/step)*step;
  if(max===min){max+=step;min-=step}
  const range=max-min;
  const xFor=i=>pl+(i*(w-pl-pr)/(Math.max(1,data.length-1)));
  const yFor=v=>pt+(max-v)/range*(h-pt-pb);
  const pts=data.map((d,i)=>({x:xFor(i),y:yFor(Number(d.value)||0),...d}));
  const path=pts.map((q,i)=>`${i?'L':'M'} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
  const area=`${path} L ${pts.at(-1).x.toFixed(1)} ${h-pb} L ${pts[0].x.toFixed(1)} ${h-pb} Z`;
  const yTicks=[max,max-step,max-2*step].filter((v,i,a)=>i===a.findIndex(x=>x===v));
  const grid=yTicks.map(v=>`<g><line class="chart-grid" x1="${pl}" y1="${yFor(v)}" x2="${w-pr}" y2="${yFor(v)}"/><text class="chart-y-label" x="${pl-8}" y="${yFor(v)+3}" text-anchor="end">${esc(compactMoney(v))}</text></g>`).join('');
  const stride=Math.max(1,Math.ceil((data.length-1)/5));
  const labels=pts.map((q,i)=>((i===0||i===pts.length-1||i%stride===0)&&q.label)?`<text class="chart-label" x="${q.x}" y="${h-8}" text-anchor="middle">${esc(q.label)}</text>`:'').join('');
  const zero=min<0&&max>0?`<line class="chart-zero" x1="${pl}" y1="${yFor(0)}" x2="${w-pr}" y2="${yFor(0)}"/>`:'';
  const dots=pts.map(q=>`<circle class="${q.events?.length?'chart-dot chart-event-dot':'chart-dot'}" cx="${q.x}" cy="${q.y}" r="${q.events?.length?4.2:2.8}"></circle>`).join('');
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
  const charts=$$('.interactive-chart');
  const hideAll=()=>{
    charts.forEach(el=>{
      const cursor=$('.chart-cursor',el), dot=$('.chart-cursor-dot',el), tip=$('.chart-tooltip',el);
      if(cursor)cursor.classList.add('hidden');
      if(dot)dot.classList.add('hidden');
      if(tip)tip.classList.add('hidden');
    });
  };
  charts.forEach(el=>{
    const data=chartRegistry.get(el.dataset.chartId); if(!data?.length)return;
    const svg=$('svg',el), cursor=$('.chart-cursor',el), dot=$('.chart-cursor-dot',el), tip=$('.chart-tooltip',el);
    let activePointer=null,lastIdx=-1,pendingX=null,moveRAF=0;
    const vb=svg.viewBox.baseVal, pl=56, pr=18, pt=16, pb=34;
    const values=data.map(x=>Number(x.value)||0);
    let rawMin=Math.min(...values), rawMax=Math.max(...values);
    const rawRange=Math.max(1,rawMax-rawMin);
    let scaleMin=rawMin-rawRange*0.12, scaleMax=rawMax+rawRange*0.12;
    const approxStep=Math.max(1,(scaleMax-scaleMin)/2);
    const mag=10**Math.floor(Math.log10(Math.abs(approxStep)||1));
    const norm=approxStep/mag, niceNorm=norm<=1?1:norm<=2?2:norm<=5?5:10, step=niceNorm*mag;
    scaleMin=Math.floor(scaleMin/step)*step;scaleMax=Math.ceil(scaleMax/step)*step;
    if(scaleMax===scaleMin){scaleMax+=step;scaleMin-=step}
    const hide=()=>{ lastIdx=-1;if(cursor)cursor.classList.add('hidden'); if(dot)dot.classList.add('hidden'); if(tip)tip.classList.add('hidden'); };
    const show=(clientX)=>{
      const rect=svg.getBoundingClientRect();
      const scaleX=vb.width/Math.max(1,rect.width);
      const svgX=(clientX-rect.left)*scaleX;
      const plotX=Math.max(pl,Math.min(vb.width-pr,svgX));
      const ratio=(plotX-pl)/Math.max(1,(vb.width-pl-pr));
      const idx=Math.max(0,Math.min(data.length-1,Math.round(ratio*(data.length-1))));
      if(idx===lastIdx)return;lastIdx=idx;
      const d=data[idx];
      const x=pl+(idx*(vb.width-pl-pr)/(Math.max(1,data.length-1)));
      const y=pt+(scaleMax-(Number(d.value)||0))/(scaleMax-scaleMin)*(vb.height-pt-pb);
      cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);dot.setAttribute('cx',x);dot.setAttribute('cy',y);
      cursor.classList.remove('hidden');dot.classList.remove('hidden');tip.classList.remove('hidden');
      const eventText=Array.isArray(d.events)&&d.events.length?`<div class="chart-event-list">${d.events.map(x=>`<div class="chart-event-row"><span>${esc(x.title)}${x.category&&x.category!==x.title?`<small>${esc(x.category)}</small>`:''}</span><b class="${x.type==='income'?'positive':'negative'}">${fmt(x.type==='income'?x.amount:-x.amount,true)}</b></div>`).join('')}</div>`:'';
      tip.innerHTML=`<small>${esc(d.tooltipLabel||d.label||'')}</small><strong>${fmt(d.value)}</strong>${Number.isFinite(d.income)&&Number.isFinite(d.expense)?`<span><b class="positive">+${fmt(d.income)}</b> · <b class="negative">−${fmt(d.expense)}</b> · <b class="${d.income-d.expense>=0?'positive':'negative'}">${fmt(d.income-d.expense,true)}</b></span>`:''}${eventText}`;
      const pct=x/vb.width*100;tip.style.left=`${Math.min(82,Math.max(18,pct))}%`;
    };
    const queueShow=clientX=>{pendingX=clientX;if(moveRAF)return;moveRAF=requestAnimationFrame(()=>{moveRAF=0;show(pendingX)})};
    el.addEventListener('pointerdown',e=>{
      hideAll();
      activePointer=e.pointerId;
      try{el.setPointerCapture(e.pointerId)}catch(_){}
      e.preventDefault();
      show(e.clientX);
    },{passive:false});
    el.addEventListener('pointermove',e=>{
      if(activePointer!==e.pointerId && e.pointerType!=='mouse')return;
      if(e.pointerType!=='mouse')e.preventDefault();
      if(e.pointerType==='mouse' && !e.buttons && activePointer===null)return;
      queueShow(e.clientX);
    },{passive:false});
    const finish=e=>{
      if(activePointer===null || activePointer===e.pointerId){
        if(activePointer===e.pointerId){ try{el.releasePointerCapture(e.pointerId)}catch(_){} }
        activePointer=null;if(moveRAF){cancelAnimationFrame(moveRAF);moveRAF=0}
        hide();
      }
    };
    el.addEventListener('pointerup',finish);
    el.addEventListener('pointercancel',finish);
    el.addEventListener('lostpointercapture',()=>{ activePointer=null;if(moveRAF){cancelAnimationFrame(moveRAF);moveRAF=0}hide(); });
    el.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse' && activePointer===null) hide(); });
  });
  document.addEventListener('pointerup', hideAll, {passive:true, once:true});
  document.addEventListener('touchend', hideAll, {passive:true, once:true});
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


function parseMoneyText(text=''){
  if(!text || text.includes('•') || !text.includes('€')) return null;
  const sign=text.includes('−')?-1:1;
  const cleaned=text
    .replace(/\s/g,'')
    .replace(/[^\d,.\-]/g,'')
    .replace(/\.(?=\d{3}(?:\D|$))/g,'')
    .replace(',','.');
  const n=Number(cleaned);
  return Number.isFinite(n)?sign*Math.abs(n):null;
}
function formatAnimatedMoney(value, original=''){
  const decimals=/,\d{2}/.test(original)?2:0;
  const explicitPlus=original.trim().startsWith('+');
  const explicitMinus=original.trim().startsWith('−') || value<0;
  const abs=new Intl.NumberFormat('de-DE',{
    minimumFractionDigits:decimals,
    maximumFractionDigits:decimals
  }).format(Math.abs(value));
  const sign=explicitPlus && value>0 ? '+' : (explicitMinus && value<0 ? '−' : '');
  return `${sign}${abs} €`;
}
function animateMoneyNode(el){
  if(!el || el.dataset.numberAnimated==='1') return;
  const original=el.dataset.finalMoneyText || el.textContent.trim();
  const target=parseMoneyText(original);
  if(target===null) return;

  el.dataset.numberAnimated='1';
  el.dataset.finalMoneyText=original;

  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){
    el.textContent=original;
    return;
  }

  const startValue=0;
  const delay=42;
  const startTime=performance.now()+delay;
  // Short, lively motion: quick climb, soft landing.
  const duration=Math.min(500,Math.max(285,motionMs(390)));

  el.textContent=formatAnimatedMoney(0,original);

  const frame=now=>{
    if(now<startTime){ requestAnimationFrame(frame); return; }
    const t=Math.min(1,(now-startTime)/duration);
    // Fast initial acceleration, soft landing.
    const eased=1-Math.pow(1-t,4);
    const value=startValue+(target-startValue)*eased;
    el.textContent=t>=1 ? original : formatAnimatedMoney(value,original);
    if(t<1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
function animateNumberElements(root=$('#main')){
  if(numberObserver){
    try{numberObserver.disconnect()}catch(_){}
    numberObserver=null;
  }
  if(!root) return;

  const nodes=$$('strong,.capital-value,.item-amount,.timeline-money,.month-outlook-main strong,.kpi strong,.stats-hero strong,.month-summary-line strong,.money-status strong,.mini-stat strong,.budget-top strong,.budget-bottom span,.goal-overview strong',root)
    .filter((el,index,arr)=>{
      if(parseMoneyText(el.textContent)===null) return false;
      // Animate only the most specific visible value, not a wrapper containing child values.
      if([...el.children].some(child=>parseMoneyText(child.textContent)!==null)) return false;
      return arr.indexOf(el)===index;
    });

  // Each render represents a newly opened view. Values animate again only when
  // they actually enter the viewport, not while still below the fold.
  nodes.forEach(el=>{
    delete el.dataset.numberAnimated;
    el.dataset.finalMoneyText=el.textContent.trim();
  });

  if(!('IntersectionObserver' in window)){
    requestAnimationFrame(()=>nodes.forEach(animateMoneyNode));
    return;
  }

  numberObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      animateMoneyNode(entry.target);
      numberObserver?.unobserve(entry.target);
    });
  },{
    root:null,
    threshold:0.12,
    rootMargin:'0px 0px -3% 0px'
  });

  nodes.forEach(el=>numberObserver.observe(el));
}

function pulseElement(el){
  if(!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate([{transform:'scale(.97)'},{transform:'scale(1.015)'},{transform:'scale(1)'}],{duration:motionMs(260),easing:'cubic-bezier(.2,.8,.2,1)'});
}
function tabIndex(tab){ return ['overview','transactions','plan','stats','more'].indexOf(tab); }

function animateMainSurface(mode='refresh',direction=0){
  const main=$('#main');
  if(!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if(main._motion){
    try{main._motion.cancel()}catch(_){}
    main._motion=null;
  }

  const isTab=mode==='tab';
  const distance=isTab ? Math.max(7,Math.min(12,window.innerWidth*.022)) : 4;
  const x=isTab ? direction*distance : 0;

  main._motion=main.animate(
    [
      {opacity:isTab?.72:.88, transform:`translate3d(${x}px,${isTab?0:3}px,0)`},
      {opacity:1, transform:'translate3d(0,0,0)'}
    ],
    {
      duration:motionMs(isTab?390:190),
      easing:'cubic-bezier(.16,.82,.22,1)',
      fill:'both'
    }
  );

  const motion=main._motion;
  motion.onfinish=()=>{
    if(main._motion===motion) main._motion=null;
    try{motion.cancel()}catch(_){}
    main.style.opacity='';
    main.style.transform='';
  };
}

function animateLocalSurface(el){
  if(!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(el._motion) try{el._motion.cancel()}catch(_){}
  el._motion=el.animate(
    [{opacity:.78,transform:'translate3d(0,3px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],
    {duration:motionMs(190),easing:'cubic-bezier(.18,.75,.22,1)'}
  );
}

function switchTab(next){
  if(!next || next===activeTab) return;

  rememberViewState();
  previousTab=activeTab;

  const oldIndex=tabIndex(activeTab);
  const newIndex=tabIndex(next);
  const direction=newIndex>=oldIndex?1:-1;

  // Navigation is intentionally untouched here. Only #main is replaced.
  activeTab=next;
  window.scrollTo(0,Number(uiMemory.scroll?.[next])||0);
  render({motion:'tab',direction});
}

function installPressFeedback(root=document){
  $$('button,[role="button"]',root).forEach(el=>{
    if(el.dataset.pressBound) return;
    el.dataset.pressBound='1';
    el.addEventListener('pointerdown',()=>el.classList.add('is-pressed'),{passive:true});
    ['pointerup','pointercancel','pointerleave'].forEach(n=>el.addEventListener(n,()=>el.classList.remove('is-pressed'),{passive:true}));
  });
}
function bindSwipeRows(){
  $$('.tx-item[data-tx]').forEach(row=>{
    if(row.dataset.swipeBound) return;
    row.dataset.swipeBound='1';
    let id=null,startX=0,startY=0,dx=0,dragging=false;
    row.addEventListener('pointerdown',e=>{id=e.pointerId;startX=e.clientX;startY=e.clientY;dx=0;dragging=false},{passive:true});
    row.addEventListener('pointermove',e=>{
      if(e.pointerId!==id)return;
      const x=e.clientX-startX,y=e.clientY-startY;
      if(!dragging && Math.abs(x)>10 && Math.abs(x)>Math.abs(y)*1.25) dragging=true;
      if(!dragging)return;
      dx=Math.max(-86,Math.min(74,x));
      row.style.transition='none';
      row.style.transform=`translateX(${dx}px)`;
      row.classList.toggle('swipe-left',dx<-18);
      row.classList.toggle('swipe-right',dx>18);
    },{passive:true});
    const end=e=>{
      if(e.pointerId!==id)return;
      id=null;
      row.style.transition=`transform ${motionMs(280)}ms cubic-bezier(.2,.8,.2,1)`;
      const tx=state.transactions.find(t=>t.id===row.dataset.tx);
      if(dx<-58 && tx){
        row.style.transform='translateX(-110%)';
        setTimeout(()=>deleteTransactionWithUndo(tx),motionMs(170));
      }else if(dx>54 && tx){
        row.style.transform='translateX(0)';
        setTimeout(()=>openTransactionSheet(null,tx.type,tx),motionMs(80));
      }else row.style.transform='translateX(0)';
      row.classList.remove('swipe-left','swipe-right');
      dx=0;dragging=false;
    };
    row.addEventListener('pointerup',end);row.addEventListener('pointercancel',end);
  });
}
async function deleteTransactionWithUndo(tx){
  if(!tx) return;
  const removed={...tx};
  state.transactions=state.transactions.filter(x=>x.id!==tx.id);
  await persist();render();
  showToast('Операция удалена','Отменить',async()=>{state.transactions.push(removed);await persist();render();showToast('Удаление отменено')});
}
function enhanceRenderedUI(){
  installPressFeedback($('#main'));
  animateNumberElements($('#main'));
  if(activeTab==='transactions') bindSwipeRows();
}

function showToast(msg,actionLabel=null,action=null){
  const el=$('#toast');
  undoAction=typeof action==='function'?action:null;
  el.innerHTML=`<span>${esc(msg)}</span>${actionLabel&&undoAction?`<button id="toastAction" type="button">${esc(actionLabel)}</button>`:''}`;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  const actionBtn=$('#toastAction');
  if(actionBtn) actionBtn.onclick=async()=>{const fn=undoAction;undoAction=null;el.classList.add('hidden');if(fn)await fn()};
  toastTimer=setTimeout(()=>{undoAction=null;el.classList.add('hidden')},3600);
}

function setPageTitle(title){ $('#pageTitle').textContent=title; }
function updateNavGlider(){
  const nav=$('.bottom-nav'), glider=$('.nav-glider'), active=$(`.nav-item[data-tab="${activeTab}"]`);
  if(!nav||!glider||!active)return;
  const slot=Number(active.dataset.navSlot);
  nav.style.setProperty('--nav-index',Number.isFinite(slot)?slot:0);
}

function render({motion='refresh',direction=0}={}){
  applyUISettings();
  chartRegistry.clear();
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  updateNavGlider();
  const title={overview:'Обзор',transactions:'Операции',plan:'План',stats:'Статистика',more:'Ещё'}[activeTab]; setPageTitle(title);
  if(activeTab==='overview') renderOverview();
  if(activeTab==='transactions') renderTransactions();
  if(activeTab==='plan') renderPlan();
  if(activeTab==='stats') renderStats();
  if(activeTab==='more') renderMore();
  requestAnimationFrame(()=>{enhanceRenderedUI();if(motion!=='none')animateMainSurface(motion,direction)});
}

function eventRow({p,date}){
  const c=planCategory(p), a=account(p.accountId), iso=toISODate(date);
  const day=new Intl.DateTimeFormat('ru-RU',{day:'2-digit'}).format(date);
  const mon=new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(date).replace('.','');
  const title=p.title||c?.name||'Плановая операция';
  const badge=p.type==='expense'&&p.required?'<span class="event-badge required">обяз.</span>':p.type==='income'?'<span class="event-badge income">доход</span>':'<span class="event-badge">план</span>';
  return `<div class="timeline-item" data-plan="${p.id}">
    <div class="timeline-date"><strong>${esc(day)}</strong><span>${esc(mon)}</span></div>
    <div class="timeline-main"><div class="timeline-title">${esc(title)} ${badge}</div><div class="timeline-sub">${esc(a?.name||'Без счёта')}${p.frequency==='monthly'?' · ежемесячно':''}</div></div>
    <div class="timeline-money ${p.type==='income'?'positive':'negative'}">${fmt(p.type==='income'?Number(p.amount):-Number(p.amount),true)}</div>
    <button class="event-done" data-complete-plan="${p.id}" data-complete-date="${iso}" aria-label="Провести операцию">${uiIcon("check")}</button>
  </div>`;
}

function budgetOverviewRow(b){
  const pct=Math.max(0,Math.min(140,b.ratio*100));
  const cls=b.ratio>=1?'over':b.ratio>=.8?'warn':'';
  return `<button class="budget-overview" data-budget="${b.id}" style="width:100%;color:inherit;text-align:left">
    <div class="budget-top"><span>${esc(b.category?.icon||'•')} ${esc(b.category?.name||'Категория')}</span><strong class="${cls==='over'?'negative':''}">${fmt(b.spent)} / ${fmt(b.limit)}</strong></div>
    <div class="budget-track"><i class="${cls}" style="width:${Math.min(100,pct)}%"></i></div>
    <div class="budget-bottom"><span>${b.remaining>=0?`Осталось ${fmt(b.remaining)}`:`Перерасход ${fmt(Math.abs(b.remaining))}`}</span><span>${Math.round(b.ratio*100)}%</span></div>
  </button>`;
}

function goalOverviewRow(g){
  const target=Math.max(0,Number(g.target)||0), saved=Math.max(0,Number(g.saved)||0), ratio=target?saved/target:0;
  const need=goalMonthlyNeed(g);
  return `<button class="goal-overview" data-goal="${g.id}" style="width:100%;color:inherit;text-align:left">
    <div class="goal-overview-top"><div><strong>${esc(g.title)}</strong><small>${g.targetDate?`до ${fmtDate(g.targetDate)}`:'без даты'}</small></div><span>${Math.round(Math.min(1,ratio)*100)}%</span></div>
    <div class="goal-progress"><i style="width:${Math.min(100,ratio*100)}%"></i></div>
    <div class="goal-overview-bottom"><span>${fmt(saved)} из ${fmt(target)}</span><span>${need!==null&&saved<target?`${fmt(need)} / мес.`:'цель достигнута'}</span></div>
  </button>`;
}

function renderOverview(){
  const m=monthTotals();
  const total=totalBalance();
  const reserved=reservedBalance();
  const mandatory=mandatoryExpenses(30);
  const free=freeBalance();
  const monthPlan=monthRemainingSummary();
  const monthEnd=monthPlan.projected;
  const timeline=primaryUpcomingPlans().slice(0,Math.max(3,Math.min(8,Number(state.settings.upcomingCount)||5)));
  const budgets=budgetSnapshot().slice(0,3);
  const goals=state.goals.slice(0,2);
  const forecast=forecastSeries(6);
  const runway=financialRunway();
  const comparison=monthComparison();
  const savingsRate=m.income?m.net/m.income*100:0;
  const noData=state.transactions.length===0 && state.accounts.every(a=>Number(a.openingBalance||0)===0);
  const attention=attentionItems();
  const daily=safeDailySpend();
  const focus=state.settings.dashboardMode==='focus';
  const adaptive=state.settings.adaptiveHome!==false;
  $('#main').innerHTML=`
    <section class="capital-hero">
      <div class="capital-label">Общий капитал <button class="inline-info" data-explain="capital" aria-label="Как считается капитал">${uiIcon('info')}</button></div>
      <div class="capital-value">${fmtMajor(total)}</div>
      <div class="capital-meta">
        <div><span>Свободно <button class="inline-info" data-explain="free" aria-label="Как считаются свободные деньги">${uiIcon('info')}</button></span><strong class="${free>=0?'positive':'negative'}">${fmtMajor(free)}</strong></div>
        <div><span>Зарезервировано <button class="inline-info" data-explain="reserve" aria-label="Как считается резерв">${uiIcon('info')}</button></span><strong>${fmtMajor(reserved)}</strong></div>
      </div>
      <div class="capital-footnote">${mandatory>0?`В ближайшие 30 дней обязательных платежей на ${fmtMajor(mandatory)}.`:'Обязательных платежей на ближайшие 30 дней нет.'}</div>
    </section>

    ${adaptive&&attention.length?`<button class="attention-card ${attention.some(x=>x.level==='danger')?'danger':''}" data-action="open-inbox"><span class="attention-icon">${uiIcon('info')}</span><div><small>Требует внимания</small><strong>${attention[0].title}</strong><span>${attention.length>1?`И ещё ${attention.length-1}`:attention[0].sub}</span></div><b>${attention.length}</b>${uiIcon('chevron')}</button>`:''}

    <section class="month-outlook clean-surface">
      <div class="month-outlook-main"><small>Прогноз конца месяца <button class="inline-info" data-explain="month" aria-label="Как считается прогноз">${uiIcon('info')}</button></small><strong class="${monthEnd>=total?'positive':'negative'}">${fmtMajor(monthEnd)}</strong></div>
      <div class="month-outlook-flow"><span class="positive">+${fmtMajor(monthPlan.income)}</span><span>−${fmtMajor(monthPlan.expense)}</span></div>
      <button data-tab-link="plan" class="circle-link" aria-label="Открыть план">${uiIcon('chevron')}</button>
    </section>

    ${daily?`<div class="daily-guide"><span>${uiIcon('calendar')}</span><div><small>До следующего дохода · ${daily.days} дн.</small><strong>Ориентир ${fmtMajor(daily.amount)} в день</strong></div><button data-explain="free" aria-label="Подробнее">${uiIcon('info')}</button></div>`:''}

    ${noData?`<section class="section"><div class="empty-inline">Добавьте остатки по счетам в <b>Ещё → Счета и кошельки</b>, чтобы расчёты стали реальными.</div></section>`:''}

    <div class="fast-entry compact-actions">
      <button data-action="quick-expense">${uiIcon('minus')}<span>Расход</span></button>
      <button data-action="quick-income">${uiIcon('plus')}<span>Доход</span></button>
      <button data-action="quick-transfer">${uiIcon('transfer')}<span>Перевод</span></button>
    </div>

    <section class="section">
      <div class="section-head"><h2>Ближайшие события</h2><button class="round-section-action" data-action="all-events" aria-label="Показать события на 30 дней">＋</button></div>
      ${timeline.length?`<div class="timeline list-surface">${timeline.map(eventRow).join('')}</div>`:`<div class="empty-inline"><strong>План пока пуст</strong><span>Добавьте зарплату, аренду или будущую покупку.</span></div>`}
    </section>

    ${!focus?`<section class="section">
      <div class="section-head"><h2>Мои деньги</h2><button data-action="manage-accounts">Управлять</button></div>
      <div class="account-list list-surface">${state.accounts.map(a=>`<button class="account-item" data-account="${a.id}" style="width:100%;color:inherit;text-align:left"><div class="account-icon system-glyph">${accountGlyph(a.type)}</div><div class="item-main"><div class="item-title">${esc(a.name)} ${a.protected?'<span class="protected-pill">резерв</span>':''}</div><div class="item-sub">${accountTypeName(a.type)}</div></div><div class="item-amount">${fmtMajor(accountBalance(a.id))}</div></button>`).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Этот месяц</h2><button data-action="month-close">Итоги</button></div>
      <div class="month-summary-line">
        <div><small>Доход</small><strong class="positive">${fmtMajor(m.income)}</strong></div>
        <div><small>Расход</small><strong>${fmtMajor(m.expense)}</strong></div>
        <div><small>Осталось</small><strong class="${m.net>=0?'positive':'negative'}">${fmtMajor(m.net)}</strong></div>
      </div>
      <p class="subtle-copy">${comparison.expenseDelta===null?'Сравнение появится после второго месяца данных.':`Расходы ${comparison.expenseDelta>0?'выше':'ниже'} прошлого месяца на ${Math.abs(Math.round(comparison.expenseDelta))}%. Savings rate: ${Math.round(savingsRate)}%.`}</p>
    </section>

    ${budgets.length?`<section class="section"><div class="section-head"><h2>Бюджеты</h2><button data-tab-link="plan">Все</button></div><div class="budget-overview-list">${budgets.map(budgetOverviewRow).join('')}</div></section>`:''}

    ${goals.length?`<section class="section"><div class="section-head"><h2>Цели</h2><button data-tab-link="plan">Все</button></div><div class="goal-overview-list">${goals.map(goalOverviewRow).join('')}</div></section>`:''}`:''}

    <section class="section">
      <div class="section-head"><h2>Прогноз капитала</h2><button data-tab-link="plan">Сценарии</button></div>
      <div class="chart-surface"><div class="chart">${svgLine(forecast.series,{interactive:true})}</div><div class="chart-footer"><span>Через 6 месяцев <b>${fmtMajor(forecast.series.at(-1).value)}</b></span><span>Запас <b>${runway===null?'—':`${runway.toFixed(1)} мес.`}</b> <button class="inline-info" data-explain="runway" aria-label="Как считается запас">${uiIcon('info')}</button></span></div></div>
    </section>`;
  bindCommonActions();
  bindInteractiveCharts();
}

function accountTypeName(type){ return ({card:'Банковская карта',bank:'Банковский счёт',cash:'Наличные',savings:'Накопительный счёт',credit:'Кредитная карта',other:'Другой счёт'})[type]||'Счёт'; }
function txRow(t){
  const a=account(t.accountId), c=category(t.categoryId), to=account(t.toAccountId);
  const icon=t.type==='transfer'?uiIcon('transfer'):(c?.icon||(t.type==='income'?'＋':'−'));
  const title=t.type==='transfer'?`${a?.name||'Счёт'} → ${to?.name||'Счёт'}`:(c?.name||'Без категории');
  const sub=[fmtDate(t.date),t.note,a?.name].filter(Boolean).join(' · ');
  const signed=t.type==='expense'?-Number(t.amount):t.type==='income'?Number(t.amount):0;
  return `<button class="tx-item" data-tx="${t.id}" style="width:100%;color:inherit;text-align:left"><div class="tx-icon ${t.type} ${t.type==='transfer'?'system-glyph':''}">${icon}</div><div class="item-main"><div class="item-title">${esc(title)}</div><div class="item-sub">${esc(sub)}</div></div><div class="item-amount ${t.type==='income'?'positive':t.type==='expense'?'expense-amount':''}">${t.type==='transfer'?fmt(t.amount):fmt(signed,true)}</div></button>`;
}


function txMatchesQuery(t,raw){
  const q=String(raw||'').trim().toLowerCase();
  if(!q)return true;
  if(q==='review:'||q==='review')return Boolean(t.needsReview);
  const gt=q.match(/^>\s*(\d+(?:[.,]\d+)?)$/);if(gt)return Number(t.amount)>Number(gt[1].replace(',','.'));
  const lt=q.match(/^<\s*(\d+(?:[.,]\d+)?)$/);if(lt)return Number(t.amount)<Number(lt[1].replace(',','.'));
  const months={январь:'01',янв:'01',февраль:'02',фев:'02',март:'03',апрель:'04',апр:'04',май:'05',июнь:'06',июн:'06',июль:'07',июл:'07',август:'08',авг:'08',сентябрь:'09',сен:'09',октябрь:'10',окт:'10',ноябрь:'11',ноя:'11',декабрь:'12',дек:'12'};
  const monthToken=Object.keys(months).find(k=>q.includes(k));
  if(monthToken && (t.date||'').slice(5,7)!==months[monthToken])return false;
  const cleaned=monthToken?q.replace(monthToken,'').trim():q;
  if(!cleaned)return true;
  const hay=[t.note,category(t.categoryId)?.name,account(t.accountId)?.name,account(t.toAccountId)?.name,String(t.amount||''),t.type==='expense'?'расход':t.type==='income'?'доход':'перевод'].filter(Boolean).join(' ').toLowerCase();
  return cleaned.split(/\s+/).every(part=>hay.includes(part));
}
function transactionGroups(txs){
  const groups=[];let current=null;
  txs.forEach(t=>{
    const key=t.date||'';
    if(!current||current.key!==key){current={key,label:fmtDate(key),items:[]};groups.push(current)}
    current.items.push(t);
  });
  return groups;
}
function openTransactionDetail(t){
  if(!t)return;
  const c=category(t.categoryId),a=account(t.accountId),to=account(t.toAccountId);
  const signed=t.type==='expense'?-Number(t.amount):t.type==='income'?Number(t.amount):0;
  openSheet(`<div class="sheet-head"><h3>Операция</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
    <div class="detail-hero"><small>${t.type==='expense'?'Расход':t.type==='income'?'Доход':'Перевод'}</small><strong class="${t.type==='income'?'positive':''}">${t.type==='transfer'?fmt(t.amount):fmt(signed,true)}</strong><span>${esc(fmtDate(t.date))}</span></div>
    <div class="detail-list">${t.type==='transfer'?`<div><span>Откуда</span><strong>${esc(a?.name||'—')}</strong></div><div><span>Куда</span><strong>${esc(to?.name||'—')}</strong></div>`:`<div><span>Категория</span><strong>${esc(c?.icon||'')} ${esc(c?.name||'Без категории')}</strong></div><div><span>Счёт</span><strong>${esc(a?.name||'—')}</strong></div>`}${t.note?`<div><span>Комментарий</span><strong>${esc(t.note)}</strong></div>`:''}${t.needsReview?'<div><span>Статус</span><strong class="warn-text">Нужно уточнить</strong></div>':''}</div>
    <div class="detail-actions"><button class="secondary-btn" id="detailRepeat">Повторить</button><button class="primary-btn" id="detailEdit">Изменить</button></div><button class="danger-btn" id="detailDelete">Удалить</button>`);
  $('#detailEdit').onclick=()=>openTransactionSheet(t,t.type);
  $('#detailRepeat').onclick=()=>openTransactionSheet(null,t.type,t);
  $('#detailDelete').onclick=()=>{closeSheet();deleteTransactionWithUndo(t)};
}
function openAccountDetail(a){
  if(!a)return;
  const bal=accountBalance(a.id);const txs=state.transactions.filter(t=>t.accountId===a.id||t.toAccountId===a.id);
  openSheet(`<div class="sheet-head"><h3>${esc(a.name)}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><span class="detail-glyph">${accountGlyph(a.type)}</span><strong>${fmtMajor(bal)}</strong><span>${esc(accountTypeName(a.type))}${a.protected?' · защищённый':''}</span></div><div class="detail-list"><div><span>Операций</span><strong>${txs.length}</strong></div><div><span>Начальный остаток</span><strong>${fmt(a.openingBalance||0)}</strong></div></div><div class="detail-actions"><button class="secondary-btn" id="accountReconcile">Сверить баланс</button><button class="primary-btn" id="accountEdit">Настроить</button></div>`);
  $('#accountEdit').onclick=()=>openAccountSheet(a);
  $('#accountReconcile').onclick=()=>openReconcileSheet(a);
}
function openReconcileSheet(a){
  const current=accountBalance(a.id);
  openSheet(`<div class="sheet-head"><h3>Сверить баланс</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><form id="reconcileForm"><div class="field"><label>В приложении</label><input value="${esc(current.toFixed(2))}" disabled></div><div class="field"><label>Реальный баланс</label><input id="realBalance" name="real" type="number" step="0.01" inputmode="decimal" value="${esc(current.toFixed(2))}" required></div><div class="reconcile-preview" id="reconcilePreview">Разницы нет.</div><button class="primary-btn" type="submit">Сверить</button></form>`);
  const input=$('#realBalance'),preview=$('#reconcilePreview');
  const update=()=>{const real=Number(input.value);const diff=real-current;preview.textContent=Math.abs(diff)<.005?'Разницы нет.':`Корректировка: ${fmt(diff,true)}`;preview.className=`reconcile-preview ${diff<0?'negative':diff>0?'positive':''}`};input.oninput=update;update();
  $('#reconcileForm').onsubmit=e=>{e.preventDefault();const real=Number(new FormData(e.currentTarget).get('real'));if(!Number.isFinite(real))return;const diff=real-current;if(Math.abs(diff)<.005){closeSheet();showToast('Баланс уже совпадает');return}const previous=structuredClone(state);state.transactions.push({id:uid(),type:diff>0?'income':'expense',amount:Math.abs(diff),date:todayISO(),accountId:a.id,toAccountId:null,categoryId:diff>0?(category('inc-other')?.id||state.categories.find(c=>c.type==='income')?.id):(category('exp-other')?.id||state.categories.find(c=>c.type==='expense')?.id),note:'Корректировка после сверки баланса',createdAt:Date.now()});closeSheet();render({motion:'refresh'});showToast(`Баланс скорректирован на ${fmt(diff,true)}`,'Отменить',async()=>{state=previous;await persist();render({motion:'refresh'})});persist().catch(()=>{state=previous;render({motion:'none'});showToast('Не удалось сохранить корректировку')})};
}
function openPlanDetail(p){
  if(!p)return;
  const c=planCategory(p),next=nextOccurrence(p,new Date());
  openSheet(`<div class="sheet-head"><h3>${esc(p.title||c?.name||'План')}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><small>${p.type==='income'?'Плановый доход':'Плановый расход'}</small><strong class="${p.type==='income'?'positive':''}">${fmt(p.type==='income'?Number(p.amount):-Number(p.amount),true)}</strong><span>${next?`Следующее: ${esc(fmtDate(toISODate(next)))}`:'Нет будущих событий'}</span></div><div class="detail-list"><div><span>Повтор</span><strong>${p.frequency==='monthly'?'Каждый месяц':'Один раз'}</strong></div><div><span>Счёт</span><strong>${esc(account(p.accountId)?.name||'—')}</strong></div>${p.type==='expense'?`<div><span>Обязательный</span><strong>${p.required?'Да':'Нет'}</strong></div>`:''}</div><button class="primary-btn" id="planEdit">Изменить план</button>`);
  $('#planEdit').onclick=()=>openPlanSheet(p);
}
function openBudgetDetail(b){
  if(!b)return;
  const snap=budgetSnapshot().find(x=>x.id===b.id),c=category(b.categoryId);const ratio=snap?.ratio||0;
  openSheet(`<div class="sheet-head"><h3>${esc(c?.name||'Бюджет')}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><small>Бюджет месяца</small><strong class="${ratio>1?'negative':''}">${Math.round(ratio*100)}%</strong><span>${fmt(snap?.spent||0)} из ${fmt(snap?.limit||0)}</span></div><div class="detail-list"><div><span>Осталось</span><strong>${(snap?.remaining||0)>=0?fmt(snap.remaining):`Перерасход ${fmt(Math.abs(snap.remaining))}`}</strong></div></div><button class="primary-btn" id="budgetEdit">Изменить бюджет</button>`);
  $('#budgetEdit').onclick=()=>openBudgetSheet(b);
}
function openGoalDetail(g){
  if(!g)return;
  const target=Number(g.target)||0,saved=Number(g.saved)||0,pct=target?Math.min(100,saved/target*100):0,need=goalMonthlyNeed(g);
  openSheet(`<div class="sheet-head"><h3>${esc(g.title)}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><small>Финансовая цель</small><strong>${Math.round(pct)}%</strong><span>${fmt(saved)} из ${fmt(target)}</span></div><div class="detail-list">${g.targetDate?`<div><span>Желаемая дата</span><strong>${esc(fmtDate(g.targetDate))}</strong></div>`:''}${need!==null&&saved<target?`<div><span>Нужно откладывать</span><strong>${fmt(need)} / мес.</strong></div>`:''}<div><span>Осталось</span><strong>${fmt(Math.max(0,target-saved))}</strong></div></div><button class="primary-btn" id="goalEdit">Изменить цель</button>`);
  $('#goalEdit').onclick=()=>openGoalSheet(g);
}
function openQuickCapture(){
  const acc=state.settings.lastAccountByType?.expense||state.accounts[0]?.id;
  const cat=state.settings.lastCategoryByType?.expense||state.categories.find(c=>c.type==='expense')?.id;
  openSheet(`<div class="sheet-head"><h3>Быстрая запись</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><form id="quickCaptureForm"><div class="quick-amount"><input id="quickCaptureAmount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required><span>€</span></div><p class="section-note">Сохраним как расход сегодня. Категорию и счёт можно уточнить позже.</p><button class="primary-btn" type="submit">Записать сейчас</button></form>`);
  $('#quickCaptureForm').onsubmit=e=>{
    e.preventDefault();const amount=Number(new FormData(e.currentTarget).get('amount'));if(!(amount>0))return;
    const prev=structuredClone(state);
    state.transactions.push({id:uid(),type:'expense',amount,date:todayISO(),accountId:acc,toAccountId:null,categoryId:cat,note:'',needsReview:true,createdAt:Date.now()});
    closeSheet();render({motion:'refresh'});showToast('Записано · уточнить можно позже');
    persist().catch(()=>{state=prev;render({motion:'none'});showToast('Не удалось сохранить')});
  };
  setTimeout(()=>$('#quickCaptureAmount')?.focus(),motionMs(160));
}

function renderTransactions(){
  let txs=[...state.transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  if(txFilter!=='all') txs=txs.filter(t=>t.type===txFilter);
  if(txSearch.trim()) txs=txs.filter(t=>txMatchesQuery(t,txSearch));
  $('#main').innerHTML=`
    <div class="tx-search"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg><input id="txSearchInput" type="search" placeholder="Поиск: REWE, продукты, карта…" value="${esc(txSearch)}"></div>
    <div class="filter-row">
      ${[['all','Все'],['expense','Расходы'],['income','Доходы'],['transfer','Переводы']].map(([k,n])=>`<button class="filter-chip ${txFilter===k?'active':''}" data-filter="${k}">${n}</button>`).join('')}
    </div>
    ${txs.length&&state.settings.showGestureHints!==false?'<div class="gesture-hint">Свайп вправо — повторить · влево — удалить</div>':''}
    <section class="section">
      ${txs.length?transactionGroups(txs).map(g=>`<div class="tx-group"><div class="tx-date-header">${esc(g.label)}</div><div class="tx-list list-surface">${g.items.map(txRow).join('')}</div></div>`).join(''):`<div class="empty-inline"><strong>${txSearch?'Ничего не найдено':'Операций пока нет'}</strong><span>${txSearch?'Попробуйте REWE, август, >100 или review:.':'Нажмите + и добавьте первый доход или расход.'}</span></div>`}
    </section>`;
  $$('[data-filter]').forEach(b=>b.onclick=()=>{txFilter=b.dataset.filter;uiMemory.txFilter=txFilter;saveUIState();renderTransactions()});
  const search=$('#txSearchInput'); if(search)search.oninput=e=>{txSearch=e.target.value;clearTimeout(searchRefreshTimer);searchRefreshTimer=setTimeout(()=>{renderTransactions();const next=$('#txSearchInput');if(next){next.focus();next.setSelectionRange(next.value.length,next.value.length)}},70)};
  $$('[data-tx]').forEach(b=>b.onclick=()=>openTransactionDetail(state.transactions.find(t=>t.id===b.dataset.tx)));
}

function planRow(p,date=null){
  const c=planCategory(p), a=account(p.accountId); const d=date||nextOccurrence(p,new Date());
  const repeat=p.frequency==='monthly'?(p.endDate?`каждый месяц · до ${fmtDate(p.endDate)}`:'каждый месяц · без окончания'):'один раз';
  const onceDone=p.frequency==='once'&&isOccurrenceCompleted(p.id,planStart(p));
  const when=onceDone?'проведено':d?fmtDate(toISODate(d)):(p.frequency==='monthly'&&p.endDate?'завершено':fmtDate(p.date));
  const req=p.type==='expense'&&p.required?' · обязательный':'';
  return `<button class="plan-item" data-plan="${p.id}" style="width:100%;color:inherit;text-align:left"><div class="plan-icon">${esc(c?.icon||(p.type==='income'?'＋':'−'))}</div><div class="item-main"><div class="item-title">${esc(p.title||c?.name||'План')}</div><div class="item-sub">${esc(when)} · ${esc(repeat)}${req}${a?` · ${esc(a.name)}`:''}</div></div><div class="item-amount ${p.type==='income'?'positive':'negative'}">${fmt(p.type==='income'?Number(p.amount):-Number(p.amount),true)}</div></button>`;
}
function toISODate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function planForecastHTML(){
  planForecastRange=Math.min(18,Math.max(3,planForecastRange));
  planScenario.oneTimeMonth=Math.min(planForecastRange,Math.max(1,Number(planScenario.oneTimeMonth)||1));
  const forecast=forecastSeries(planForecastRange,planScenario);
  const final=forecast.series.at(-1).value;
  const health=forecastHealth(forecast.series);
  const start=totalBalance();
  const change=final-start;
  const deficitRows=forecast.series.slice(1).map((r,index)=>({...r,index:index+1,net:(Number(r.income)||0)-(Number(r.expense)||0),shortfall:Math.max(0,(Number(r.expense)||0)-(Number(r.income)||0))})).filter(r=>r.shortfall>.005);
  const analysis=planAlgorithmAnalysis(forecast,health);
  return `<div class="chart plan-chart">${svgLine(forecast.series,{interactive:true,height:'large'})}</div>
    <div class="grid-3 plan-kpis">
      <div class="kpi"><small>Через ${planForecastRange} мес.</small><strong class="${final>=start?'positive':'negative'}">${fmtMajor(final)}</strong></div>
      <div class="kpi"><small>Минимум</small><strong class="${health.min>=0?'positive':'negative'}">${fmtMajor(health.min)}</strong></div>
      <div class="kpi"><small>Изменение</small><strong class="${change>=0?'positive':'negative'}">${fmtMajor(change,true)}</strong></div>
    </div>
    ${health.cashflow.required>0?`<div class="plan-advice warning ${uiMemory.planExplain?'open':''}">
      <div class="plan-advice-head">
        <div><small>В выбранном периоде есть дефицитные месяцы</small><strong>Нужно ещё ${fmtMajor(health.cashflow.required)} / месяц</strong></div>
        <button class="plan-explain-toggle" type="button" aria-expanded="${uiMemory.planExplain?'true':'false'}" aria-label="${uiMemory.planExplain?'Скрыть объяснение':'Показать объяснение'}"><span></span><span></span></button>
      </div>
      <div class="plan-advice-details"><div>
        <p><b>Что означает эта сумма?</b></p>
        <p>${fmtMajor(health.cashflow.required)} — это минимальная прибавка к ежемесячному доходу <b>или</b> такое же сокращение расходов, которое закрывает самый большой дефицит выбранного периода. Это не означает, что весь накопленный капитал уже заканчивается.</p>
        <p class="plan-advice-meta">Дефицитных месяцев: ${deficitRows.length} из ${planForecastRange}. Ниже показан каждый из них.</p>
        <div class="deficit-months">${deficitRows.map(planMonthDetailHTML).join('')}</div>
        <div class="algorithm-analysis"><div class="analysis-title"><span>${uiIcon('sparkles')}</span><div><b>Алгоритмический анализ плана</b><small>Без ИИ — только правила и ваши числа</small></div></div>
          ${analysis.map(a=>`<div class="analysis-row ${a.level}"><strong>${a.title}</strong><p>${a.text}</p></div>`).join('')}
        </div>
      </div></div>
    </div>`:`<div class="plan-advice good ${uiMemory.planExplain?'open':''}">
      <div class="plan-advice-head">
        <div><small>Месячный план сбалансирован</small><strong>Во всех месяцах доходы покрывают расходы</strong></div>
        <button class="plan-explain-toggle" type="button" aria-expanded="${uiMemory.planExplain?'true':'false'}"><span></span><span></span></button>
      </div>
      <div class="plan-advice-details"><div>
        <p>Минимальный расчётный капитал: <b>${fmtMajor(health.min)}</b>.</p>
        <div class="algorithm-analysis">${analysis.map(a=>`<div class="analysis-row ${a.level}"><strong>${a.title}</strong><p>${a.text}</p></div>`).join('')}</div>
      </div></div>
    </div>`}`;
}
function bindPlanAdvice(root=document){
  $$('.plan-explain-toggle',root).forEach(btn=>{
    if(btn.dataset.bound)return;btn.dataset.bound='1';
    btn.onclick=()=>{
      const card=btn.closest('.plan-advice');
      const open=!card.classList.contains('open');
      card.classList.toggle('open',open);
      uiMemory.planExplain=open;saveUIState();
      btn.setAttribute('aria-expanded',String(open));
      btn.setAttribute('aria-label',open?'Скрыть объяснение':'Показать объяснение');
    };
  });
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
  bindPlanAdvice(box);
  installPressFeedback(box);
  animateLocalSurface(box);
}

function scheduleForecastRefresh(){clearTimeout(forecastRefreshTimer);forecastRefreshTimer=setTimeout(refreshPlanForecast,90)}
function renderPlan(){
  chartRegistry.clear();
  const nextMonth=addMonths(new Date(),1);
  const recurringIncome=hasRecurringPlan('income')?recurringPlanMonthly('income',nextMonth):actualAverage('income');
  const recurringExpense=hasRecurringPlan('expense')?recurringPlanMonthly('expense',nextMonth):actualAverage('expense');
  const due=monthRemainingSummary();
  const timeline=primaryUpcomingPlans();
  const budgets=budgetSnapshot();
  $('#main').innerHTML=`
    <section class="forecast-panel">
      <div class="section-head"><h2>Прогноз капитала</h2><span class="badge" id="forecastRangeLabel">${planForecastRange} мес.</span></div>
      <div class="forecast-range-tabs">${[3,6,12,18].map(n=>`<button data-forecast-range="${n}" class="${planForecastRange===n?'active':''}">${n} мес.</button>`).join('')}</div>
      <div id="forecastDynamic">${planForecastHTML()}</div>
      <div class="forecast-method"><span>Доходы: <b>${hasRecurringPlan('income')?'по плану':'средний факт'}</b></span><span>Расходы: <b>${hasRecurringPlan('expense')?'по плану':'средний факт'}</b></span></div>
      <div class="chart-hint">Зажми линию и веди пальцем по месяцам. Маркеры показывают месяцы с запланированными событиями.</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Ближайшие события</h2><button class="round-section-action" data-action="all-events" aria-label="Показать события на 30 дней">＋</button></div>
      ${timeline.length?`<div class="timeline list-surface">${timeline.map(eventRow).join('')}</div>`:`<div class="empty-inline"><strong>Нет событий в основном окне</strong><span>${new Date().getDate()>=20?'Показывается остаток текущего и весь следующий месяц.':'Показывается остаток текущего месяца.'}</span></div>`}<p class="subtle-copy event-window-note">${new Date().getDate()>=20?'С 20-го числа здесь показывается остаток текущего месяца и весь следующий.':'Здесь показываются события до конца текущего месяца.'} Нажмите +, чтобы увидеть ближайшие 30 дней.</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>Что если?</h2><button id="resetScenario">Сбросить</button></div>
      <div class="simulator-panel">
        <p class="section-note">Песочница не меняет реальный план.</p>
        <div class="scenario-grid">
          <label><span>Доход + / месяц</span><input id="simIncome" type="number" min="0" step="25" inputmode="decimal" value="${planScenario.extraIncome||''}" placeholder="0 €"></label>
          <label><span>Расход + / месяц</span><input id="simExpense" type="number" min="0" step="25" inputmode="decimal" value="${planScenario.extraExpense||''}" placeholder="0 €"></label>
          <label><span>Разовая покупка</span><input id="simOnce" type="number" min="0" step="50" inputmode="decimal" value="${planScenario.oneTimeExpense||''}" placeholder="0 €"></label>
          <label class="scenario-range"><span id="simOnceMonthLabel">через ${planScenario.oneTimeMonth} мес.</span><input id="simOnceMonth" type="range" min="1" max="${planForecastRange}" step="1" value="${Math.min(planForecastRange,planScenario.oneTimeMonth)}"></label>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>До конца месяца</h2><span class="badge">${due.rows.length} событий</span></div>
      <div class="month-summary-line">
        <div><small>Придёт</small><strong class="positive">${fmtMajor(due.income)}</strong></div>
        <div><small>Уйдёт</small><strong>${fmtMajor(due.expense)}</strong></div>
        <div><small>Капитал</small><strong class="${due.projected>=0?'positive':'negative'}">${fmtMajor(due.projected)}</strong></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Правила плана</h2><button data-action="add-plan">Добавить</button></div>
      ${state.plans.length?`<div class="plan-list list-surface">${[...state.plans].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(p=>planRow(p)).join('')}</div>`:`<div class="empty-inline"><strong>План пуст</strong><span>Добавьте зарплату, аренду, подписки и будущие покупки.</span></div>`}
      <p class="subtle-copy">Следующий месяц: ${fmtMajor(recurringIncome)} доходов · ${fmtMajor(recurringExpense)} расходов.</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>Бюджеты категорий</h2><button data-action="add-budget">Добавить</button></div>
      ${budgets.length?`<div class="budget-overview-list">${budgets.map(budgetOverviewRow).join('')}</div>`:`<div class="empty-inline"><strong>Лимитов пока нет</strong><span>Например: продукты ≤ 350 € в месяц.</span></div>`}
    </section>

    <section class="section">
      <div class="section-head"><h2>Финансовые цели</h2><button data-action="add-goal">Добавить</button></div>
      ${state.goals.length?`<div class="goal-list list-surface">${state.goals.map(g=>goalRow(g)).join('')}</div>`:`<div class="empty-inline"><strong>Целей пока нет</strong><span>Укажите сумму и дату — приложение рассчитает темп накоплений.</span></div>`}
    </section>`;
  bindCommonActions();
  bindInteractiveCharts();
  bindPlanAdvice($('#main'));
  $$('[data-plan]').forEach(b=>b.onclick=()=>openPlanDetail(state.plans.find(p=>p.id===b.dataset.plan)));
  $$('[data-forecast-range]').forEach(b=>b.onclick=()=>{planForecastRange=Math.min(18,Number(b.dataset.forecastRange));uiMemory.planForecastRange=planForecastRange;saveUIState();planScenario.oneTimeMonth=Math.min(planForecastRange,planScenario.oneTimeMonth);refreshPlanForecast()});
  const simIncome=$('#simIncome'); if(simIncome)simIncome.oninput=e=>{planScenario.extraIncome=Math.max(0,Number(e.target.value)||0);scheduleForecastRefresh()};
  const simExpense=$('#simExpense'); if(simExpense)simExpense.oninput=e=>{planScenario.extraExpense=Math.max(0,Number(e.target.value)||0);scheduleForecastRefresh()};
  const simOnce=$('#simOnce'); if(simOnce)simOnce.oninput=e=>{planScenario.oneTimeExpense=Math.max(0,Number(e.target.value)||0);scheduleForecastRefresh()};
  const simMonth=$('#simOnceMonth'); if(simMonth)simMonth.oninput=e=>{planScenario.oneTimeMonth=Math.min(planForecastRange,Number(e.target.value));scheduleForecastRefresh()};
  const reset=$('#resetScenario'); if(reset)reset.onclick=()=>{planScenario={extraIncome:0,extraExpense:0,oneTimeExpense:0,oneTimeMonth:Math.min(3,planForecastRange)};['simIncome','simExpense','simOnce'].forEach(id=>{const el=$('#'+id);if(el)el.value=''});const sm=$('#simOnceMonth');if(sm)sm.value=String(planScenario.oneTimeMonth);refreshPlanForecast()};
}

function budgetRow(b){
  const c=category(b.categoryId); const spent=expenseByCategory().find(x=>x.id===b.categoryId)?.value||0; const limit=Number(b.limit)||0; const pct=limit?spent/limit*100:0;
  return `<button class="budget-item" data-budget="${b.id}" style="width:100%;color:inherit;text-align:left"><div class="item-main"><div class="item-title">${esc(c?.icon||'•')} ${esc(c?.name||'Категория')}</div><div class="item-sub">${fmt(spent)} из ${fmt(limit)}</div><div class="progress ${pct>100?'danger':''}"><i style="width:${Math.min(100,pct)}%"></i></div></div><div class="item-amount ${pct>100?'negative':''}">${Math.round(pct)}%</div></button>`;
}
function goalRow(g){
  const target=Number(g.target)||0,saved=Number(g.saved)||0,pct=target?saved/target*100:0, need=goalMonthlyNeed(g);
  const sub=[`${fmt(saved)} из ${fmt(target)}`,g.targetDate?`до ${fmtDate(g.targetDate)}`:'',need!==null&&saved<target?`${fmt(need)} / мес.`:''].filter(Boolean).join(' · ');
  return `<button class="goal-item" data-goal="${g.id}" style="width:100%;color:inherit;text-align:left"><div class="item-main"><div class="item-title">🎯 ${esc(g.title)}</div><div class="item-sub">${sub}</div><div class="progress"><i style="width:${Math.min(100,pct)}%"></i></div></div><div class="item-amount">${Math.round(pct)}%</div></button>`;
}

function renderStats(){
  chartRegistry.clear();
  const m=monthTotals();
  const cats=expenseByCategory();
  const monthly=monthlySeries(statsRange);
  const capital=capitalMonthlySeries(statsRange);
  const comparison=monthComparison();
  const savingsRate=m.income?m.net/m.income*100:0;
  const avgExpense=actualAverage('expense');
  const avgIncome=actualAverage('income');
  const topCat=cats[0];
  const budgets=budgetSnapshot();
  const overBudgets=budgets.filter(b=>b.ratio>1);
  const runway=financialRunway();
  $('#main').innerHTML=`
    <div class="pill-tabs stats-period">${[3,6,9,12].map(n=>`<button data-range="${n}" class="${statsRange===n?'active':''}">${n} мес.</button>`).join('')}</div>

    <section class="stats-hero">
      <div><small>Расходы месяца</small><strong>${fmtMajor(m.expense)}</strong><span>${comparison.expenseDelta===null?'нет сравнения':`${comparison.expenseDelta>0?'+':''}${Math.round(comparison.expenseDelta)}% к прошлому`}</span></div>
      <div><small>Savings rate <button class="inline-info" data-explain="savings" aria-label="Как считается savings rate">${uiIcon('info')}</button></small><strong class="${savingsRate>=0?'positive':'negative'}">${Math.round(savingsRate)}%</strong><span>${fmtMajor(m.net,true)} за месяц</span></div>
    </section>

    <section class="section"><div class="section-head"><h2>Доходы и расходы</h2><span class="badge">cash flow</span></div><div class="chart-surface"><div class="chart">${svgBars(monthly)}</div><div class="chart-legend"><span><i class="legend-income"></i>Доходы</span><span><i class="legend-expense"></i>Расходы</span></div></div></section>
    <section class="section"><div class="section-head"><h2>Капитал</h2><span class="badge">динамика</span></div><div class="chart-surface"><div class="chart">${svgLine(capital,{interactive:true})}</div></div></section>
    <section class="section"><div class="section-head"><h2>Куда уходят деньги</h2><span class="badge">месяц</span></div><div class="donut-surface">${donutHTML(cats)}</div></section>

    <section class="section"><div class="section-head"><h2>Показатели</h2></div><div class="insight-list list-surface">
      <div class="insight-row"><span>Средний расход · 90 дней</span><strong>${fmtMajor(avgExpense)}</strong></div>
      <div class="insight-row"><span>Средний доход · 90 дней</span><strong>${fmtMajor(avgIncome)}</strong></div>
      <div class="insight-row"><span>Финансовый запас</span><strong>${runway===null?'—':`${runway.toFixed(1)} мес.`}</strong></div>
      <div class="insight-row"><span>Крупнейшая категория</span><strong>${topCat?`${esc(topCat.icon)} ${esc(topCat.name)} · ${fmtMajor(topCat.value)}`:'—'}</strong></div>
      <div class="insight-row"><span>Бюджеты с перерасходом</span><strong class="${overBudgets.length?'negative':'positive'}">${overBudgets.length}</strong></div>
    </div></section>

    ${budgets.length?`<section class="section"><div class="section-head"><h2>Бюджеты</h2><button data-tab-link="plan">Управлять</button></div><div class="budget-overview-list">${budgets.slice(0,4).map(budgetOverviewRow).join('')}</div></section>`:''}`;
  $$('[data-range]').forEach(b=>b.onclick=()=>{statsRange=Number(b.dataset.range);uiMemory.statsRange=statsRange;saveUIState();renderStats();requestAnimationFrame(()=>{enhanceRenderedUI();animateMainSurface('refresh',0)})});
  bindCommonActions();
  bindInteractiveCharts();
}


function openAppearanceSettings(){
  const s=state.settings;
  openSheet(`<div class="sheet-head"><h3>Интерфейс</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
    <form id="appearanceForm" class="settings-form">
      <div class="settings-block"><label>Скорость анимации</label><div class="option-grid" data-setting-group="animationSpeed">${[['slow','Очень плавно'],['smooth','Плавно'],['normal','Стандарт'],['fast','Быстро'],['minimal','Минимум']].map(([v,n])=>`<button type="button" data-setting="animationSpeed" data-value="${v}" class="${s.animationSpeed===v?'active':''}">${n}</button>`).join('')}</div><small>Меняет длительность переходов, sheets, чисел и микроанимаций. «Плавно» — рекомендуемый режим.</small></div>
      <div class="settings-block"><label>Плотность интерфейса</label><div class="option-grid two" data-setting-group="interfaceDensity">${[['standard','Стандарт'],['compact','Компактно']].map(([v,n])=>`<button type="button" data-setting="interfaceDensity" data-value="${v}" class="${s.interfaceDensity===v?'active':''}">${n}</button>`).join('')}</div></div>
      <div class="settings-block"><label>Главный экран</label><div class="option-grid two">${[['standard','Полный'],['focus','Фокус']].map(([v,n])=>`<button type="button" data-setting="dashboardMode" data-value="${v}" class="${s.dashboardMode===v?'active':''}">${n}</button>`).join('')}</div><small>«Фокус» оставляет капитал, ближайшие события и прогноз; подробности остаются в разделах.</small></div>
      <div class="settings-block"><label>Акцент</label><div class="accent-grid">${[['blue','Синий'],['violet','Фиолетовый'],['green','Зелёный'],['graphite','Графит']].map(([v,n])=>`<button type="button" class="accent-choice ${s.accent===v?'active':''}" data-setting="accent" data-value="${v}"><i class="accent-${v}"></i>${n}</button>`).join('')}</div></div>
      <label class="switch-row"><input type="checkbox" data-toggle-setting="adaptiveHome" ${s.adaptiveHome!==false?'checked':''}><span><strong>Адаптивный обзор</strong><small>Показывать важные события и проблемы выше обычных блоков.</small></span></label>
      <label class="switch-row"><input type="checkbox" data-toggle-setting="showCentsDashboard" ${s.showCentsDashboard?'checked':''}><span><strong>Показывать центы на главной</strong><small>В операциях центы показываются всегда.</small></span></label>
      <label class="switch-row"><input type="checkbox" data-toggle-setting="showGestureHints" ${s.showGestureHints!==false?'checked':''}><span><strong>Подсказки жестов</strong><small>Например, подсказка про свайпы в истории.</small></span></label>
      <div class="settings-block"><label>Ближайших событий на обзоре</label><div class="option-grid three">${[3,5,8].map(v=>`<button type="button" data-setting="upcomingCount" data-value="${v}" class="${Number(s.upcomingCount||5)===v?'active':''}">${v}</button>`).join('')}</div></div>
    </form>`);
  const update=async(key,value)=>{
    state.settings[key]=value;applyUISettings();
    $$(`[data-setting="${key}"]`).forEach(b=>b.classList.toggle('active',String(b.dataset.value)===String(value)));
    await persist();render({motion:'refresh'});
  };
  $$('[data-setting]').forEach(b=>b.onclick=()=>{const key=b.dataset.setting;const raw=b.dataset.value;update(key,key==='upcomingCount'?Number(raw):raw)});
  $$('[data-toggle-setting]').forEach(i=>i.onchange=()=>update(i.dataset.toggleSetting,i.checked));
}
function openAdvancedSettings(){
  openSheet(`<div class="sheet-head"><h3>Расширенные настройки</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
    <div class="definition-list list-surface"><div class="definition-row"><strong>Свободные деньги</strong><span>Учитывают обязательные платежи ближайших 30 дней. Формулу можно открыть по значку ⓘ на обзоре.</span></div><div class="definition-row"><strong>Прогноз</strong><span>Если есть регулярный план соответствующего типа — используется он; иначе средний факт последних 90 дней.</span></div><div class="definition-row"><strong>Плановые операции</strong><span>Никогда не становятся фактическими автоматически. Проведение всегда подтверждается вручную.</span></div></div>
    <button class="secondary-btn" id="advancedIntegrity">Проверить целостность данных</button>`);
  $('#advancedIntegrity').onclick=()=>runIntegrityCheck();
}
function runIntegrityCheck(){
  const issues=[];
  const accountIds=new Set(state.accounts.map(a=>a.id)),catIds=new Set(state.categories.map(c=>c.id));
  state.transactions.forEach(t=>{if(!(Number(t.amount)>0))issues.push('Операция с некорректной суммой');if(t.accountId&&!accountIds.has(t.accountId))issues.push('Операция с удалённым счётом');if(t.type!=='transfer'&&t.categoryId&&!catIds.has(t.categoryId))issues.push('Операция с удалённой категорией');if(t.type==='transfer'&&t.accountId===t.toAccountId)issues.push('Перевод на тот же счёт')});
  state.plans.forEach(p=>{if(!(Number(p.amount)>0))issues.push('План с некорректной суммой');if(p.endDate&&p.date&&p.endDate<p.date)issues.push('План с окончанием раньше начала')});
  showToast(issues.length?`Найдено проблем: ${new Set(issues).size}`:'Данные выглядят целостными');
}
function openMonthCloseSheet(){
  const m=monthTotals(),cmp=monthComparison(),cats=expenseByCategory(),sr=m.income?m.net/m.income*100:0;
  const title=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date());
  openSheet(`<div class="sheet-head"><h3>Итоги месяца</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="month-close"><div class="month-close-title">${esc(title)}</div><div class="month-close-grid"><div><small>Доходы</small><strong class="positive">${fmtMajor(m.income)}</strong></div><div><small>Расходы</small><strong>${fmtMajor(m.expense)}</strong></div><div><small>Результат</small><strong class="${m.net>=0?'positive':'negative'}">${fmtMajor(m.net,true)}</strong></div><div><small>Норма накопления</small><strong>${Math.round(sr)}%</strong></div></div>${cats[0]?`<p>Больше всего расходов: <b>${esc(cats[0].icon)} ${esc(cats[0].name)} · ${fmtMajor(cats[0].value)}</b>.</p>`:''}${cmp.expenseDelta!==null?`<p>Расходы ${cmp.expenseDelta>0?'выше':'ниже'} прошлого месяца на <b>${Math.abs(Math.round(cmp.expenseDelta))}%</b>.</p>`:''}</div><button class="primary-btn sheet-close">Готово</button>`);
}

function renderMore(){
  const protectedCount=state.accounts.filter(a=>a.protected).length;
  const backupText=state.settings.lastBackupAt?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(state.settings.lastBackupAt)):'ещё не создавалась';
  const rows=(items)=>`<div class="settings-list list-surface">${items.join('')}</div>`;
  const row=(icon,title,sub,action,badge='')=>`<button class="list-button" data-action="${action}"><span class="settings-icon">${uiIcon(icon)}</span><div class="lb-main"><strong>${title}</strong><small>${sub}</small></div>${badge?`<span class="settings-badge">${badge}</span>`:''}<span class="arrow">${uiIcon('chevron')}</span></button>`;
  const att=attentionItems();
  $('#main').innerHTML=`
    <section class="app-version-card">
      <div class="app-version-icon">${uiIcon('sparkles')}</div>
      <div>
        <small>Money App</small>
        <strong>V${APP_VERSION}</strong>
        <span>Текущая установленная версия</span>
      </div>
    </section>
    <section class="section first-section"><div class="section-head"><h2>Основные</h2></div>${rows([
      row('wallet','Счета и кошельки',`${state.accounts.length} счетов · ${protectedCount} защищённых`,'manage-accounts'),
      row('tag','Категории','Доходы и расходы','manage-categories'),
      row('shield','Дополнительный резерв',`${fmtMajor(explicitReserve())} сверх защищённых счетов`,'reserve'),
      row('info','Требует внимания',att.length?'Есть пункты для проверки':'Всё в порядке','open-inbox',att.length?String(att.length):'')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Интерфейс</h2></div>${rows([
      row('chart','Внешний вид и плавность',`${motionProfile().label} · ${state.settings.interfaceDensity==='compact'?'компактно':'стандартно'}`,'appearance'),
      row('calendar','Итоги текущего месяца','Короткая сводка без лишних графиков','month-close')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Данные</h2></div>${rows([
      row('upload','Резервная копия',`Последняя: ${backupText}`,'export-json'),
      row('download','Восстановить копию','Импорт JSON','import-json'),
      row('file','Экспорт операций','CSV для Excel / Numbers','export-csv')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Расширенные</h2></div>${rows([
      row('info','Логика расчётов','Прогноз, свободные деньги и проверка данных','advanced-settings')
    ])}</section>

    <details class="tech-details section"><summary>Диагностика</summary><div class="diagnostics list-surface">
      <div><span>Версия приложения</span><strong>${APP_VERSION}</strong></div>
      <div><span>Версия данных</span><strong>${state.version||4}</strong></div>
      <div><span>Операций</span><strong>${state.transactions.length}</strong></div>
      <div><span>Планов</span><strong>${state.plans.length}</strong></div>
      <div><span>Хранение</span><strong>IndexedDB · локально</strong></div>
    </div></details>

    <section class="section"><button class="danger-btn" data-action="clear-data">Удалить все мои данные</button></section>`;
  bindCommonActions();
}

async function completePlannedOccurrence(planId,dateISO){
  const p=state.plans.find(x=>x.id===planId);
  if(!p || isOccurrenceCompleted(planId,dateISO))return;
  const previous=structuredClone(state);
  const transactionId=uid();
  state.transactions.push({id:transactionId,type:p.type,amount:Number(p.amount)||0,date:dateISO||todayISO(),accountId:p.accountId||state.accounts[0]?.id,toAccountId:null,categoryId:p.categoryId||null,note:`По плану: ${p.title||planCategory(p)?.name||'операция'}`,createdAt:Date.now()});
  state.planCompletions.push({planId,date:dateISO,transactionId,completedAt:Date.now()});
  state.settings.lastAccountByType={...(state.settings.lastAccountByType||{}),[p.type]:p.accountId||state.accounts[0]?.id};
  if(p.categoryId)state.settings.lastCategoryByType={...(state.settings.lastCategoryByType||{}),[p.type]:p.categoryId};
  render({motion:'refresh'});showToast('Плановая операция проведена','Отменить',async()=>{state=previous;await persist();render({motion:'refresh'})});
  try{await persist()}catch(_){state=previous;render({motion:'none'});showToast('Не удалось сохранить · операция отменена')}
}

function openUpcomingEventsSheet(){
  const rows=allUpcoming30Days();
  openSheet(`<div class="sheet-head"><div><h3>Ближайшие 30 дней</h3><p class="sheet-subtitle">Все непроведённые плановые события от сегодняшнего дня.</p></div><button class="sheet-close">×</button></div>
    ${rows.length?`<div class="timeline list-surface all-events-sheet">${rows.map(eventRow).join('')}</div>`:`<div class="empty-inline"><strong>Нет событий</strong><span>В ближайшие 30 дней ничего не запланировано.</span></div>`}
    <button class="secondary-btn" type="button" id="addPlanFromEvents">Добавить событие</button>`);
  $$('.timeline-item[data-plan]', $('#sheet')).forEach(b=>b.onclick=e=>{if(e.target.closest('[data-complete-plan]'))return;const plan=state.plans.find(p=>p.id===b.dataset.plan);if(plan)openPlanDetail(plan)});
  $$('[data-complete-plan]', $('#sheet')).forEach(b=>b.onclick=e=>{e.stopPropagation();completePlannedOccurrence(b.dataset.completePlan,b.dataset.completeDate)});
  const add=$('#addPlanFromEvents');if(add)add.onclick=()=>openPlanSheet();
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
  $$('[data-tab-link]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tabLink));
  $$('[data-account]').forEach(b=>b.onclick=()=>openAccountDetail(account(b.dataset.account)));
  $$('[data-plan]').forEach(b=>b.onclick=()=>openPlanDetail(state.plans.find(p=>p.id===b.dataset.plan)));
  $$('[data-complete-plan]').forEach(b=>b.onclick=e=>{e.stopPropagation();completePlannedOccurrence(b.dataset.completePlan,b.dataset.completeDate)});
  $$('[data-budget]').forEach(b=>b.onclick=()=>openBudgetDetail(state.budgets.find(x=>x.id===b.dataset.budget)));
  $$('[data-goal]').forEach(b=>b.onclick=()=>openGoalDetail(state.goals.find(x=>x.id===b.dataset.goal)));
  $$('[data-explain]').forEach(b=>b.onclick=e=>{e.stopPropagation();openExplanation(b.dataset.explain)});
  $$('[data-action="open-inbox"]').forEach(b=>b.onclick=openInbox);
  $$('[data-action="appearance"]').forEach(b=>b.onclick=openAppearanceSettings);
  $$('[data-action="advanced-settings"]').forEach(b=>b.onclick=openAdvancedSettings);
  $$('[data-action="month-close"]').forEach(b=>b.onclick=openMonthCloseSheet);
  $$('[data-action="all-events"]').forEach(b=>b.onclick=openUpcomingEventsSheet);
  const reserve=$('[data-action="reserve"]'); if(reserve)reserve.onclick=openReserveSheet;
  const exj=$('[data-action="export-json"]'); if(exj)exj.onclick=exportJSON;
  const imj=$('[data-action="import-json"]'); if(imj)imj.onclick=()=>$('#importInput').click();
  const exc=$('[data-action="export-csv"]'); if(exc)exc.onclick=exportCSV;
  const clear=$('[data-action="clear-data"]'); if(clear)clear.onclick=clearAllData;
}

function openSheet(html){
  const sheet=$('#sheet'), backdrop=$('#sheetBackdrop');
  const previousFocus=document.activeElement;
  sheet._previousFocus=previousFocus;
  sheet.innerHTML=`<div class="sheet-handle" aria-hidden="true"></div>${html}`;
  sheet.classList.remove('hidden'); backdrop.classList.remove('hidden');
  document.body.classList.add('sheet-open');
  requestAnimationFrame(()=>{sheet.classList.add('sheet-visible');backdrop.classList.add('sheet-visible');installPressFeedback(sheet)});
  $$('.sheet-close').forEach(b=>b.onclick=closeSheet);
  const handle=$('.sheet-handle',sheet);
  let pointerId=null,startY=0,lastY=0,startT=0,lastT=0;
  const reset=()=>{sheet.style.transition=`transform ${motionMs(340)}ms cubic-bezier(.18,.86,.24,1)`;sheet.style.transform='translateX(-50%) translateY(0)';backdrop.style.opacity='1';setTimeout(()=>sheet.style.transition='',motionMs(350))};
  if(handle){
    handle.addEventListener('pointerdown',e=>{pointerId=e.pointerId;startY=lastY=e.clientY;startT=lastT=performance.now();try{handle.setPointerCapture(e.pointerId)}catch(_){};sheet.style.transition='none'}, {passive:true});
    handle.addEventListener('pointermove',e=>{if(pointerId!==e.pointerId)return;lastY=e.clientY;lastT=performance.now();const dy=Math.max(0,lastY-startY);const resisted=dy<180?dy:180+(dy-180)*.55;sheet.style.transform=`translateX(-50%) translateY(${resisted}px)`;backdrop.style.opacity=String(Math.max(.18,1-dy/390))}, {passive:true});
    const end=e=>{if(pointerId!==e.pointerId)return;const dy=Math.max(0,lastY-startY);const velocity=dy/Math.max(1,lastT-startT);pointerId=null;if(dy>88||velocity>.75)closeSheet();else reset()};
    handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  }
  setTimeout(()=>{
    const auto=sheet.querySelector('.quick-amount input, input[autofocus]');
    if(auto && !window.matchMedia('(pointer: fine)').matches) auto.focus({preventScroll:true});
  },motionMs(230));
}
function closeSheet(){
  const sheet=$('#sheet'), backdrop=$('#sheetBackdrop');
  if(sheet.classList.contains('hidden')) return;
  const previousFocus=sheet._previousFocus;
  sheet.classList.remove('sheet-visible');backdrop.classList.remove('sheet-visible');
  sheet.style.transform='translateX(-50%) translateY(105%)';backdrop.style.opacity='0';
  document.body.classList.remove('sheet-open');
  setTimeout(()=>{
    sheet.classList.add('hidden');backdrop.classList.add('hidden');sheet.style.transform='';backdrop.style.opacity='';
    if(previousFocus && previousFocus.focus) try{previousFocus.focus({preventScroll:true})}catch(_){}
  },motionMs(300));
}

function categoryOptions(type,selected=''){
  return state.categories.filter(c=>c.type===type).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
}
function accountOptions(selected='',exclude=''){
  return state.accounts.filter(a=>a.id!==exclude).map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('');
}

function setFormError(form,msg=''){
  const box=form?.querySelector('.form-error');if(!box)return;
  box.textContent=msg;box.classList.toggle('hidden',!msg);
  if(msg)box.animate([{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'translateY(0)'}],{duration:motionMs(180),easing:'ease-out'});
}
function openTransactionSheet(existing=null,initialType='expense',template=null){
  if(!state.accounts.length){showToast('Сначала добавьте хотя бы один счёт');openAccountsManager();return}
  let type=existing?.type||template?.type||initialType;
  const build=()=>{
    const recent=[...state.transactions].filter(x=>x.type===type).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    const t=existing||template||{};
    const isTransfer=type==='transfer';
    const defaultAccount=t.accountId||state.settings.lastAccountByType?.[type]||recent?.accountId||state.accounts[0]?.id;
    const defaultCategory=t.categoryId||state.settings.lastCategoryByType?.[type]||recent?.categoryId||state.categories.find(c=>c.type===type)?.id;
    const defaultTo=t.toAccountId||recent?.toAccountId||state.accounts.find(a=>a.id!==defaultAccount)?.id||state.accounts[0]?.id;
    const cats=state.categories.filter(c=>c.type===type);
    const quickCats=[category(defaultCategory),...cats.filter(c=>c.id!==defaultCategory)].filter(Boolean).slice(0,6);
    const quickAccounts=[account(defaultAccount),...state.accounts.filter(a=>a.id!==defaultAccount)].filter(Boolean).slice(0,4);
    openSheet(`<div class="sheet-head quick-sheet-head"><h3>${existing?'Изменить операцию':template?'Повторить операцию':type==='expense'?'Новый расход':type==='income'?'Новый доход':'Перевод'}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
      <div class="segmented tx-segmented"><button data-type="expense" class="${type==='expense'?'active':''}">Расход</button><button data-type="income" class="${type==='income'?'active':''}">Доход</button><button data-type="transfer" class="${type==='transfer'?'active':''}">Перевод</button></div>
      <form id="txForm" class="quick-tx-form">
        <div class="quick-amount"><input id="txAmount" class="amount-input" name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" required value="${esc(t.amount||'')}"><span>€</span></div>
        ${!isTransfer?`
          <input type="hidden" name="categoryId" id="categoryHidden" value="${esc(defaultCategory||'')}">
          <input type="hidden" name="accountId" id="accountHidden" value="${esc(defaultAccount||'')}">
          <div class="quick-picker"><label>Категория</label><div class="choice-scroller">${quickCats.map(c=>`<button type="button" class="choice-chip ${c.id===defaultCategory?'active':''}" data-quick-category="${c.id}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}</div></div>
          <div class="quick-picker"><label>Оплата</label><div class="choice-scroller">${quickAccounts.map(a=>`<button type="button" class="choice-chip account-choice ${a.id===defaultAccount?'active':''}" data-quick-account="${a.id}">${accountGlyph(a.type)}<span>${esc(a.name)}</span></button>`).join('')}</div></div>
          <details class="advanced-details" ${existing?'open':''}><summary>Дата, комментарий и другие варианты</summary><div class="advanced-body">
            <div class="field"><label>Все категории</label><select id="categorySelectFull">${categoryOptions(type,defaultCategory)}</select></div>
            <div class="field"><label>Все счета</label><select id="accountSelectFull">${accountOptions(defaultAccount)}</select></div>
            <div class="field"><label>Дата</label><input name="date" type="date" required value="${esc(existing?t.date:todayISO())}"></div>
            <div class="field"><label>Комментарий</label><input name="note" maxlength="100" placeholder="Например: REWE" value="${esc(t.note||'')}"></div>
          </div></details>`:`
          <div class="transfer-grid"><div class="field"><label>Откуда</label><select name="accountId">${accountOptions(defaultAccount)}</select></div><div class="transfer-arrow">${uiIcon('transfer')}</div><div class="field"><label>Куда</label><select name="toAccountId">${accountOptions(defaultTo,defaultAccount)}</select></div></div>
          <details class="advanced-details" ${existing?'open':''}><summary>Дата и комментарий</summary><div class="advanced-body"><div class="field"><label>Дата</label><input name="date" type="date" required value="${esc(existing?t.date:todayISO())}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="100" value="${esc(t.note||'')}"></div></div></details>`}
        <div class="form-error hidden" role="alert"></div>
        <button class="primary-btn quick-save" type="submit">${existing?'Сохранить':type==='expense'?'Добавить расход':type==='income'?'Добавить доход':'Перевести'}</button>
        ${existing?'<button class="secondary-btn" type="button" id="repeatTx">Повторить</button><button class="danger-btn" type="button" id="deleteTx">Удалить</button>':''}
      </form>`);
    $$('[data-type]').forEach(b=>b.onclick=()=>{type=b.dataset.type;build()});
    $$('[data-quick-category]').forEach(b=>b.onclick=()=>{const id=b.dataset.quickCategory;$('#categoryHidden').value=id;$$('[data-quick-category]').forEach(x=>x.classList.toggle('active',x===b));const sel=$('#categorySelectFull');if(sel)sel.value=id});
    $$('[data-quick-account]').forEach(b=>b.onclick=()=>{const id=b.dataset.quickAccount;$('#accountHidden').value=id;$$('[data-quick-account]').forEach(x=>x.classList.toggle('active',x===b));const sel=$('#accountSelectFull');if(sel)sel.value=id});
    const catSel=$('#categorySelectFull');if(catSel)catSel.onchange=e=>{$('#categoryHidden').value=e.target.value;$$('[data-quick-category]').forEach(x=>x.classList.toggle('active',x.dataset.quickCategory===e.target.value))};
    const accSel=$('#accountSelectFull');if(accSel)accSel.onchange=e=>{$('#accountHidden').value=e.target.value;$$('[data-quick-account]').forEach(x=>x.classList.toggle('active',x.dataset.quickAccount===e.target.value))};
    $('#txForm').onsubmit=e=>{
      e.preventDefault(); const form=e.currentTarget; const fd=new FormData(form); const amount=Number(fd.get('amount'));
      setFormError(form,'');
      if(!amount||amount<=0){setFormError(form,'Введите сумму больше нуля.');$('#txAmount')?.focus();return}
      const obj={id:existing?.id||uid(),type,amount,date:fd.get('date')||todayISO(),accountId:fd.get('accountId'),toAccountId:type==='transfer'?fd.get('toAccountId'):null,categoryId:type==='transfer'?null:fd.get('categoryId'),note:String(fd.get('note')||'').trim(),needsReview:false,createdAt:existing?.createdAt||Date.now()};
      if(type==='transfer' && obj.accountId===obj.toAccountId){setFormError(form,'Для перевода выберите два разных счёта.');return}
      const previous=structuredClone(state);
      if(existing) state.transactions=state.transactions.map(x=>x.id===existing.id?obj:x); else state.transactions.push(obj);
      state.settings.lastAccountByType={...(state.settings.lastAccountByType||{}),[type]:obj.accountId};
      if(type!=='transfer')state.settings.lastCategoryByType={...(state.settings.lastCategoryByType||{}),[type]:obj.categoryId};
      closeSheet();render({motion:'refresh'});showToast(existing?'Операция обновлена':'Операция добавлена');
      persist().catch(()=>{state=previous;render({motion:'none'});showToast('Не удалось сохранить · изменение отменено')});
    };
    const repeat=$('#repeatTx'); if(repeat)repeat.onclick=()=>openTransactionSheet(null,existing.type,existing);
    const del=$('#deleteTx'); if(del)del.onclick=async()=>{
      const removed={...existing}; const removedCompletions=state.planCompletions.filter(x=>x.transactionId===existing.id);
      state.transactions=state.transactions.filter(x=>x.id!==existing.id);state.planCompletions=state.planCompletions.filter(x=>x.transactionId!==existing.id);
      await persist();closeSheet();render();showToast('Операция удалена','Отменить',async()=>{state.transactions.push(removed);state.planCompletions.push(...removedCompletions);await persist();render();showToast('Удаление отменено')});
    };
    if(!existing&&!template) setTimeout(()=>$('#txAmount')?.focus(),motionMs(180));
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
        ${type==='expense'?`<label class="switch-row full"><input name="required" type="checkbox" ${p.required!==false?'checked':''}><span><strong>Обязательный платёж</strong><small>Учитывать при расчёте реально свободных денег</small></span></label>`:''}
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
      const obj={id:existing?.id||uid(),type,title:String(fd.get('title')).trim(),amount:Number(fd.get('amount')),categoryId:fd.get('categoryId'),frequency,date,endDate,accountId:fd.get('accountId'),required:type==='expense'?fd.get('required')==='on':false};
      if(existing)state.plans=state.plans.map(x=>x.id===existing.id?obj:x);else state.plans.push(obj);
      await persist();closeSheet();render();showToast('План сохранён');
    };
    const del=$('#deletePlan');if(del)del.onclick=async()=>{
      const removed={...existing};
      state.plans=state.plans.filter(x=>x.id!==existing.id);
      await persist();closeSheet();render();
      showToast('План удалён','Отменить',async()=>{state.plans.push(removed);await persist();render();showToast('Удаление отменено')});
    };
  };build();
}

function openAccountsManager(){
  openSheet(`<div class="sheet-head"><h3>Счета и кошельки</h3><button class="sheet-close">×</button></div><div class="account-list">${state.accounts.map(a=>`<button class="account-item" data-edit-account="${a.id}" style="width:100%;color:inherit;text-align:left"><div class="account-icon system-glyph">${accountGlyph(a.type)}</div><div class="item-main"><div class="item-title">${esc(a.name)} ${a.protected?'<span class="protected-pill">защищён</span>':''}</div><div class="item-sub">${accountTypeName(a.type)}</div></div><div class="item-amount">${fmt(accountBalance(a.id))}</div><span class="chevron">›</span></button>`).join('')}</div><button class="primary-btn" id="newAccount" style="margin-top:14px">Добавить счёт</button>`);
  $$('[data-edit-account]').forEach(b=>b.onclick=()=>openAccountSheet(account(b.dataset.editAccount)));
  $('#newAccount').onclick=()=>openAccountSheet();
}

function openAccountSheet(existing=null){
  const a=existing||{};
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить счёт':'Новый счёт'}</h3><button class="sheet-close">×</button></div><form id="accountForm"><div class="form-grid">
    <div class="field full"><label>Тип</label><select name="type">${[['card','Карта'],['bank','Банковский счёт'],['cash','Наличные'],['savings','Накопительный'],['credit','Кредитная карта'],['other','Другой']].map(([v,n])=>`<option value="${v}" ${v===(a.type||'card')?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="field full"><label>Название</label><input name="name" required maxlength="40" placeholder="Например: Revolut" value="${esc(a.name||'')}"></div>
    <div class="field full"><label>Начальный остаток</label><input name="openingBalance" type="number" step="0.01" inputmode="decimal" value="${esc(a.openingBalance??0)}"></div>
    <label class="switch-row full"><input name="protected" type="checkbox" ${a.protected?'checked':''}><span><strong>Защищённые накопления</strong><small>Баланс этого счёта остаётся в капитале, но не считается свободными деньгами.</small></span></label>
  </div><div class="notice">Иконка счёта теперь определяется автоматически по типу, чтобы интерфейс оставался единым.</div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button class="danger-btn" type="button" id="deleteAccount">Удалить счёт</button>':''}</form>`);
  $('#accountForm').onsubmit=async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const obj={id:existing?.id||uid(),name:String(fd.get('name')).trim(),type:fd.get('type'),icon:existing?.icon||'💳',openingBalance:Number(fd.get('openingBalance')||0),protected:fd.get('protected')==='on'};
    if(existing)state.accounts=state.accounts.map(x=>x.id===existing.id?obj:x);else state.accounts.push(obj);
    await persist();closeSheet();render();showToast('Счёт сохранён')
  };
  const del=$('#deleteAccount');if(del)del.onclick=async()=>{
    const used=state.transactions.some(t=>t.accountId===existing.id||t.toAccountId===existing.id)||state.plans.some(p=>p.accountId===existing.id);
    if(used){showToast('Счёт используется в операциях или планах');return}
    if(state.accounts.length<=1){showToast('Нужен хотя бы один счёт');return}
    if(confirm('Удалить этот счёт?')){state.accounts=state.accounts.filter(x=>x.id!==existing.id);await persist();closeSheet();render()}
  };
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
  openSheet(`<div class="sheet-head"><h3>${existing?'Изменить цель':'Новая цель'}</h3><button class="sheet-close">×</button></div><form id="goalForm"><div class="field"><label>Название</label><input name="title" required maxlength="50" placeholder="Например: отпуск" value="${esc(g.title||'')}"></div><div class="form-grid"><div class="field"><label>Цель</label><input name="target" type="number" step="0.01" min="0" required value="${esc(g.target||'')}"></div><div class="field"><label>Уже отложено</label><input name="saved" type="number" step="0.01" min="0" value="${esc(g.saved||0)}"></div><div class="field full"><label>Желаемая дата <span class="field-hint">необязательно</span></label><input name="targetDate" type="date" value="${esc(g.targetDate||'')}"><small class="field-help">Если указать дату, приложение рассчитает необходимую сумму накоплений в месяц.</small></div></div><button class="primary-btn" type="submit">Сохранить</button>${existing?'<button type="button" class="danger-btn" id="deleteGoal">Удалить цель</button>':''}</form>`);
  $('#goalForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),title:String(fd.get('title')).trim(),target:Number(fd.get('target')),saved:Number(fd.get('saved')||0),targetDate:String(fd.get('targetDate')||'')};if(obj.targetDate&&obj.targetDate<todayISO()){showToast('Дата цели должна быть в будущем');return}if(existing)state.goals=state.goals.map(x=>x.id===existing.id?obj:x);else state.goals.push(obj);await persist();closeSheet();render()};
  const del=$('#deleteGoal');if(del)del.onclick=async()=>{state.goals=state.goals.filter(x=>x.id!==existing.id);await persist();closeSheet();render()};
}

function openReserveSheet(){
  openSheet(`<div class="sheet-head"><h3>Дополнительный резерв</h3><button class="sheet-close">×</button></div><form id="reserveForm"><div class="field"><label>Сумма резерва</label><input name="reserve" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(state.settings.reserve||0)}"></div><div class="notice">Эта сумма вычитается из «Свободно» дополнительно к счетам, помеченным как защищённые накопления. Реальный капитал не меняется.</div><button class="primary-btn" type="submit">Сохранить</button></form>`);
  $('#reserveForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);state.settings.reserve=Number(fd.get('reserve')||0);await persist();closeSheet();render()};
}

function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportJSON(){
  state.settings.lastBackupAt=Date.now();
  await persist();
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

function openQuickAddMenu(){
  openSheet(`<div class="sheet-head"><h3>Добавить</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
    <div class="quick-add-grid">
      <button type="button" data-add-kind="expense"><span>${uiIcon('minus')}</span><strong>Расход</strong><small>Покупка или платёж</small></button>
      <button type="button" data-add-kind="income"><span>${uiIcon('plus')}</span><strong>Доход</strong><small>Зарплата или поступление</small></button>
      <button type="button" data-add-kind="transfer"><span>${uiIcon('transfer')}</span><strong>Перевод</strong><small>Между своими счетами</small></button>
      <button type="button" data-add-kind="plan"><span>${uiIcon('calendar')}</span><strong>План</strong><small>Будущая операция</small></button>
      <button type="button" data-add-kind="capture"><span>${uiIcon('file')}</span><strong>Записать быстро</strong><small>Только сумма, уточнить позже</small></button>
    </div>`);
  $$('[data-add-kind]').forEach(b=>b.onclick=()=>{
    const kind=b.dataset.addKind;
    if(kind==='plan') openPlanSheet();
    else if(kind==='capture') openQuickCapture();
    else openTransactionSheet(null,kind);
  });
}


function isEditableTarget(target){
  return target instanceof Element && Boolean(target.closest('input,textarea,[contenteditable="true"]'));
}
document.addEventListener('contextmenu',e=>{if(!isEditableTarget(e.target))e.preventDefault()});
document.addEventListener('selectstart',e=>{if(!isEditableTarget(e.target))e.preventDefault()});

function bindShell(){
  $$('.nav-item').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  const fab=$('#fab');
  if(fab){
    let holdTimer=null,held=false,startX=0,startY=0,pointerId=null;
    const cancelHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}};
    fab.addEventListener('contextmenu',e=>e.preventDefault());
    fab.addEventListener('pointerdown',e=>{
      e.preventDefault();held=false;pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;
      try{fab.setPointerCapture(e.pointerId)}catch(_){}
      holdTimer=setTimeout(()=>{held=true;holdTimer=null;pulseElement(fab);openQuickAddMenu()},430);
    },{passive:false});
    fab.addEventListener('pointermove',e=>{if(pointerId!==e.pointerId)return;if(Math.hypot(e.clientX-startX,e.clientY-startY)>10)cancelHold()},{passive:true});
    fab.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;cancelHold();if(held)return;if(activeTab==='plan')openPlanSheet();else if(activeTab==='more')openQuickAddMenu();else openTransactionSheet(null,'expense')});
    fab.addEventListener('pointercancel',()=>{pointerId=null;cancelHold()});
  }
  $('#sheetBackdrop').onclick=closeSheet;
  $('#privacyToggle').onclick=async()=>{state.settings.privacy=!state.settings.privacy;$('#privacyIcon').innerHTML=uiIcon(state.settings.privacy?'eyeoff':'eye');await persist();render()};
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
  window.addEventListener('pagehide',rememberViewState,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberViewState()},{passive:true});
}

async function init(){
  loadUIState();
  const saved=await dbGet().catch(()=>null); state=normalizeState(saved||defaultState()); if(!saved)await persist();
  txFilter=uiMemory.txFilter||'all';statsRange=Number(uiMemory.statsRange)||6;planForecastRange=Number(uiMemory.planForecastRange)||12;
  planForecastRange=Math.min(18,Math.max(3,planForecastRange));applyUISettings();
  const now=new Date(); $('#todayLabel').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(now);
  $('#privacyIcon').innerHTML=uiIcon(state.settings.privacy?'eyeoff':'eye'); bindShell(); document.body.classList.add('app-loading'); render(); requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.remove('app-loading')));
  if('serviceWorker' in navigator){window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./service-worker.js');await reg.update();if(reg.waiting)showToast('Доступна новая версия','Обновить',()=>{reg.waiting.postMessage({type:'SKIP_WAITING'});location.reload()});reg.addEventListener('updatefound',()=>{const w=reg.installing;if(w)w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)showToast('Доступна новая версия','Обновить',()=>location.reload())})})}catch(_){}});}
}

init();
