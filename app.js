'use strict';

const DB_NAME = 'money-pwa-db';
const DB_VERSION = 1;
const STORE = 'app';
const STATE_KEY = 'state';
const COLORS = ['#7c9cff','#5dd7a9','#ffcc66','#ff7b8a','#b58cff','#6ed6ff','#ff9f68','#9ad37d','#d990ff','#78cbbf'];
const APP_VERSION = '9.0.0';
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
  version: 11,
  settings: { currency:'EUR', reserve:0, safetyHorizonDays:90, privacy:false, lastAccountByType:{}, lastCategoryByType:{}, lastBackupAt:null, animationSpeed:'smooth', interfaceDensity:'standard', accent:'blue', dashboardMode:'standard', adaptiveHome:true, showCentsDashboard:false, showGestureHints:true, upcomingCount:5, advanced:false },
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
  goals: [],
  scenarios: [],
  workspace:'personal',
  business:{
    settings:{name:'Бизнес',cardOpening:0,cashOpening:0,vatPeriod:'quarterly',taxationMode:'ist',defaultVatRate:19,ordersMigrated:false},
    orders:[],
    customerPayments:[],
    factoryPayments:[],
    inputVat:[],
    vatPayments:[],
    vatCorrections:[],
    adjustments:[]
  }
});

let state = defaultState();
let activeTab = 'overview';
let txFilter = 'all';
let txSearch = '';
let statsRange = 6;
let planForecastRange = 12;
let planScenario = { extraIncome:0, extraExpense:0, oneTimeExpense:0, oneTimeMonth:3 };
let calendarCursor = new Date(new Date().getFullYear(),new Date().getMonth(),1,12);
let toastTimer = null;
let sheetCloseTimer = null;
let sheetMotionCleanup = null;
let dbPromise = null;
let swReloading = false;
const chartRegistry = new Map();
let chartEntranceObserver = null;
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
  // V7.1 deliberately gives the eye more time to follow movement. The press
  // response stays quick, while navigation, sheets and spring returns settle
  // over a longer iOS-like curve instead of snapping into place.
  return ({slow:{factor:1.28,label:'Очень плавно'},smooth:{factor:1.00,label:'Плавно'},normal:{factor:.84,label:'Стандарт'},fast:{factor:.68,label:'Быстро'},minimal:{factor:.05,label:'Минимум'}})[key]||{factor:1.00,label:'Плавно'};
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
  root.style.setProperty('--motion-instant',`${Math.max(1,Math.round(86*factor))}ms`);
  root.style.setProperty('--motion-fast',`${Math.max(1,Math.round(178*factor))}ms`);
  root.style.setProperty('--motion-base',`${Math.max(1,Math.round(305*factor))}ms`);
  root.style.setProperty('--motion-slow',`${Math.max(1,Math.round(490*factor))}ms`);
  root.style.setProperty('--tab-duration',`${Math.max(1,Math.round(555*factor))}ms`);
  root.style.setProperty('--sheet-duration',`${Math.max(1,Math.round(610*factor))}ms`);
}


function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db=req.result;
      db.onversionchange=()=>{try{db.close()}catch(_){};dbPromise=null};
      resolve(db);
    };
    req.onerror = () => {dbPromise=null;reject(req.error)};
    req.onblocked = () => {dbPromise=null};
  });
  return dbPromise;
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
    version:11,
    settings:{
      ...d.settings,
      ...(s.settings||{}),
      lastAccountByType:{...(d.settings.lastAccountByType||{}),...((s.settings||{}).lastAccountByType||{})},
      lastCategoryByType:{...(d.settings.lastCategoryByType||{}),...((s.settings||{}).lastCategoryByType||{})}
    },
    accounts:(Array.isArray(s.accounts)?s.accounts:d.accounts).map(a=>({...a,protected:Boolean(a.protected),lastReconciledAt:a.lastReconciledAt||null})),
    categories:Array.isArray(s.categories)?s.categories:d.categories,
    transactions:Array.isArray(s.transactions)?s.transactions.map(t=>({...t,isAdjustment:Boolean(t.isAdjustment)||t.note==='Корректировка после сверки баланса'})):[],
    plans:Array.isArray(s.plans)?s.plans.map(p=>({
      ...p,
      frequency:['once','weekly','biweekly','monthly','quarterly','yearly'].includes(p.frequency)?p.frequency:'once',
      endDate:p.endDate||'',
      required:p.type==='expense' ? (p.required!==false) : false
    })):[],
    planCompletions:Array.isArray(s.planCompletions)?s.planCompletions:[],
    budgets:Array.isArray(s.budgets)?s.budgets:[],
    goals:Array.isArray(s.goals)?s.goals.map(g=>({...g,targetDate:g.targetDate||''})):[],
    scenarios:Array.isArray(s.scenarios)?s.scenarios.map(x=>({...x,scenario:{extraIncome:0,extraExpense:0,oneTimeExpense:0,oneTimeMonth:3,...(x.scenario||{})}})):[],
    workspace:s.workspace==='business'?'business':'personal',
    business:(()=>{
      const oldBusiness=s.business||{};
      const oldSales=Array.isArray(oldBusiness.sales)?oldBusiness.sales:[];
      let orders=Array.isArray(oldBusiness.orders)?oldBusiness.orders.map(x=>({...x})):[];
      let customerPayments=Array.isArray(oldBusiness.customerPayments)?oldBusiness.customerPayments.map(x=>({...x})):[];
      const settings={...d.business.settings,...(oldBusiness.settings||{})};
      if(!settings.ordersMigrated && oldSales.length){
        const knownOrders=new Set(orders.map(x=>x.id));
        const knownPayments=new Set(customerPayments.map(x=>x.id));
        for(const x of oldSales){
          const orderId=`legacy-order-${x.id}`;
          const paymentId=`legacy-payment-${x.id}`;
          if(!knownOrders.has(orderId))orders.push({id:orderId,title:x.note||'Продажа',totalAmount:Math.max(0,Number(x.amount)||0),factoryCost:Math.max(0,Number(x.factoryCost)||0),taxable:false,vatRate:19,vatIncluded:true,deliveryDate:x.date||'',createdAt:x.createdAt||Date.now(),updatedAt:x.updatedAt||x.createdAt||Date.now(),legacy:true});
          if(!knownPayments.has(paymentId))customerPayments.push({id:paymentId,orderId,amount:Math.max(0,Number(x.amount)||0),method:x.method==='cash'?'cash':'card',date:x.date||todayISO(),note:'Перенесено из старой продажи',createdAt:x.createdAt||Date.now(),legacy:true});
        }
        settings.ordersMigrated=true;
      }
      return {
        settings,
        orders,
        customerPayments,
        factoryPayments:Array.isArray(oldBusiness.factoryPayments)?oldBusiness.factoryPayments:[],
        inputVat:Array.isArray(oldBusiness.inputVat)?oldBusiness.inputVat:[],
        vatPayments:Array.isArray(oldBusiness.vatPayments)?oldBusiness.vatPayments:[],
        vatCorrections:Array.isArray(oldBusiness.vatCorrections)?oldBusiness.vatCorrections:[],
        adjustments:Array.isArray(oldBusiness.adjustments)?oldBusiness.adjustments:[]
      };
    })()
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
function calendarDayDiff(a,b){
  const x=new Date(a),y=new Date(b);
  const ux=Date.UTC(x.getFullYear(),x.getMonth(),x.getDate());
  const uy=Date.UTC(y.getFullYear(),y.getMonth(),y.getDate());
  return Math.round((uy-ux)/86400000);
}

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
      // A malformed transfer must never silently reduce total capital as if it
      // were an expense. Ignore invalid transfers in balances and let the data
      // integrity check surface them for correction.
      const fromValid=Boolean(account(t.accountId)),toValid=Boolean(account(t.toAccountId));
      if(fromValid&&toValid&&t.accountId!==t.toAccountId){
        if (t.accountId===id) bal -= amt;
        if (t.toAccountId===id) bal += amt;
      }
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

function isAnalyticalTransaction(t){
  return Boolean(t) && !t.isAdjustment;
}
function monthTotals(key=monthKey()){
  let income=0, expense=0;
  for (const t of state.transactions){
    if (!isAnalyticalTransaction(t) || (t.date||'').slice(0,7)!==key) continue;
    if (t.type==='income') income += Number(t.amount)||0;
    if (t.type==='expense') expense += Number(t.amount)||0;
  }
  return {income,expense,net:income-expense};
}
function totalsBetween(start,end){
  const a=new Date(start);a.setHours(0,0,0,0);
  const b=new Date(end);b.setHours(23,59,59,999);
  let income=0,expense=0;
  state.transactions.forEach(t=>{
    if(!isAnalyticalTransaction(t)||!t.date)return;
    const d=parseISO(t.date);if(d<a||d>b)return;
    if(t.type==='income')income+=Number(t.amount)||0;
    if(t.type==='expense')expense+=Number(t.amount)||0;
  });
  return {income,expense,net:income-expense};
}

function actualAverageInfo(type,days=90){
  const maxDays=Math.max(30,Number(days)||90);
  const now=new Date();now.setHours(23,59,59,999);
  const hardStart=new Date(now);hardStart.setDate(hardStart.getDate()-maxDays+1);hardStart.setHours(0,0,0,0);
  const rows=state.transactions
    .filter(t=>isAnalyticalTransaction(t)&&t.type===type&&t.date)
    .map(t=>({...t,_date:parseISO(t.date)}))
    .filter(t=>t._date>=hardStart&&t._date<=now)
    .sort((a,b)=>a._date-b._date);
  if(!rows.length)return {monthly:0,total:0,observedDays:0,denominatorDays:0};
  const first=rows[0]._date;
  const observedDays=Math.max(1,calendarDayDiff(first,now)+1);
  // With less than a month of data we deliberately do not extrapolate a few
  // unusual days into an extreme monthly number. Once 30+ days exist, use the
  // actual covered window up to the requested maximum.
  const denominatorDays=Math.min(maxDays,Math.max(30,observedDays));
  const total=rows.reduce((sum,t)=>sum+Number(t.amount||0),0);
  return {monthly:total/denominatorDays*30.4375,total,observedDays,denominatorDays};
}
function actualAverage(type,days=90){ return actualAverageInfo(type,days).monthly; }

function planStart(plan){ return parseISO(plan.date||todayISO()); }
function planEnd(plan){ return plan.endDate ? parseISO(plan.endDate) : null; }
function lastDayOfMonth(year,month){ return new Date(year,month+1,0).getDate(); }
function sameMonth(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth(); }

function frequencyLabel(freq){
  return ({once:'один раз',weekly:'каждую неделю',biweekly:'каждые 2 недели',monthly:'каждый месяц',quarterly:'каждые 3 месяца',yearly:'каждый год'})[freq]||'один раз';
}
function anchoredMonthDate(start,monthOffset){
  const target=new Date(start.getFullYear(),start.getMonth()+monthOffset,1,12);
  const day=Math.min(start.getDate(),lastDayOfMonth(target.getFullYear(),target.getMonth()));
  return new Date(target.getFullYear(),target.getMonth(),day,12);
}
function occurrencesForPlanBetween(plan,start,end){
  if(!plan?.date)return [];
  const first=planStart(plan), stop=planEnd(plan);
  const rangeStart=new Date(start);rangeStart.setHours(0,0,0,0);
  const rangeEnd=new Date(end);rangeEnd.setHours(23,59,59,999);
  const effectiveEnd=stop&&stop<rangeEnd?stop:rangeEnd;
  if(first>effectiveEnd)return [];
  const out=[];
  const push=d=>{if(d>=rangeStart&&d<=effectiveEnd)out.push(new Date(d))};
  if(plan.frequency==='once'){push(first);return out}
  if(plan.frequency==='weekly'||plan.frequency==='biweekly'){
    const step=plan.frequency==='weekly'?7:14;
    let d=new Date(first);
    if(d<rangeStart){
      const diff=Math.floor((rangeStart-d)/86400000);
      const jumps=Math.max(0,Math.floor(diff/step));
      d.setDate(d.getDate()+jumps*step);
      while(d<rangeStart)d.setDate(d.getDate()+step);
    }
    while(d<=effectiveEnd){push(d);d=new Date(d);d.setDate(d.getDate()+step)}
    return out;
  }
  const monthStep=plan.frequency==='quarterly'?3:plan.frequency==='yearly'?12:1;
  let i=0,d=new Date(first);
  if(d<rangeStart){
    const months=(rangeStart.getFullYear()-first.getFullYear())*12+(rangeStart.getMonth()-first.getMonth());
    i=Math.max(0,Math.floor(months/monthStep)-1);
    d=anchoredMonthDate(first,i*monthStep);
    while(d<rangeStart){i++;d=anchoredMonthDate(first,i*monthStep)}
  }
  while(d<=effectiveEnd){push(d);i++;d=anchoredMonthDate(first,i*monthStep)}
  return out;
}
function occurrenceInMonth(plan,monthDate){
  const a=new Date(monthDate.getFullYear(),monthDate.getMonth(),1,0);
  const b=endOfMonth(monthDate);
  return occurrencesForPlanBetween(plan,a,b)[0]||null;
}
function recurringPlanMonthly(type, monthDate=new Date()){
  const start=new Date(monthDate.getFullYear(),monthDate.getMonth(),1,0),end=endOfMonth(monthDate);
  return state.plans.filter(p=>p.type===type&&p.frequency!=='once').reduce((sum,p)=>sum+occurrencesForPlanBetween(p,start,end).filter(d=>!isOccurrenceCompleted(p.id,d)).length*Number(p.amount||0),0);
}
function hasRecurringPlan(type){return state.plans.some(p=>p.type===type&&p.frequency!=='once')}
function oncePlansForMonth(type,monthDate){
  const start=new Date(monthDate.getFullYear(),monthDate.getMonth(),1,0),end=endOfMonth(monthDate);
  return state.plans.filter(p=>p.type===type&&p.frequency==='once').reduce((sum,p)=>sum+occurrencesForPlanBetween(p,start,end).filter(d=>!isOccurrenceCompleted(p.id,d)).length*Number(p.amount||0),0);
}
function planItemsForMonth(monthDate){
  const start=new Date(monthDate.getFullYear(),monthDate.getMonth(),1,0),end=endOfMonth(monthDate);
  const items=[];
  state.plans.forEach(p=>occurrencesForPlanBetween(p,start,end).forEach(date=>{if(!isOccurrenceCompleted(p.id,date))items.push({p,date})}));
  return items.sort((a,b)=>a.date-b.date);
}

function forecastBaseForMonth(type,monthDate){
  const planned=recurringPlanMonthly(type,monthDate);
  const average=actualAverage(type);
  if(type==='expense'){
    // A recurring plan usually contains fixed obligations only. Variable
    // spending (food, transport, etc.) must not disappear merely because one
    // recurring expense exists. Use the larger of observed spending and the
    // explicit recurring plan as a conservative baseline.
    const amount=Math.max(planned,average);
    return {amount,planned,average,mode:planned>0&&average>planned?'План + обычные траты':planned>0?'План':'Средний факт'};
  }
  // For income, never assume unplanned historical income will certainly repeat
  // when an explicit recurring income exists. This keeps the forecast cautious.
  const amount=planned>0?planned:average;
  return {amount,planned,average,mode:planned>0?'План':'Средний факт'};
}
function forecastSeries(months=12, scenario={}){
  const horizon=Math.max(1,Math.min(60,Number(months)||12));
  let balance=totalBalance();
  const extraIncome=Math.max(0,Number(scenario.extraIncome)||0);
  const extraExpense=Math.max(0,Number(scenario.extraExpense)||0);
  const oneTimeExpense=Math.max(0,Number(scenario.oneTimeExpense)||0);
  const oneTimeMonth=Math.max(1,Math.round(Number(scenario.oneTimeMonth)||1));
  const now=new Date();
  const series=[{label:'Сейчас',tooltipLabel:'Сейчас',value:balance,income:0,expense:0}];
  let totalIncome=0,totalExpense=0;
  let firstIncomeBase=null,firstExpenseBase=null;
  for(let i=1;i<=horizon;i++){
    const d=addMonths(now,i);
    const incomeBase=forecastBaseForMonth('income',d);
    const expenseBase=forecastBaseForMonth('expense',d);
    if(i===1){firstIncomeBase=incomeBase;firstExpenseBase=expenseBase}
    const onceIncome=oncePlansForMonth('income',d);
    const onceExpense=oncePlansForMonth('expense',d);
    const simulatedOnce=i===oneTimeMonth?oneTimeExpense:0;
    const income=incomeBase.amount+onceIncome+extraIncome;
    const expense=expenseBase.amount+onceExpense+extraExpense+simulatedOnce;
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
    incomeBase:firstIncomeBase?.amount||0,
    expenseBase:firstExpenseBase?.amount||0,
    modeIncome:firstIncomeBase?.mode||'Средний факт',
    modeExpense:firstExpenseBase?.mode||'Средний факт',
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
  const f=new Date(from);f.setHours(0,0,0,0);
  const horizon=new Date(f);horizon.setFullYear(horizon.getFullYear()+6);
  return occurrencesForPlanBetween(plan,f,horizon).find(d=>!isOccurrenceCompleted(plan.id,d))||null;
}
function planOccurrencesBetween(start,end,{includeCompleted=false}={}){
  const out=[];
  for(const p of state.plans){
    occurrencesForPlanBetween(p,start,end).forEach(date=>{
      const completed=isOccurrenceCompleted(p.id,date);
      if(includeCompleted||!completed)out.push({p,date,completed});
    });
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
  const now=new Date();now.setHours(0,0,0,0);
  // Unpaid events from earlier in the current month are still obligations.
  // Starting at today made an overdue rent/payment silently disappear from the
  // month-end outlook.
  const start=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
  return planOccurrencesBetween(start,endOfMonth(now));
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
function outstandingRequiredPlans(days=30,overdueDays=31){
  const now=new Date();now.setHours(0,0,0,0);
  const start=new Date(now);start.setDate(start.getDate()-Math.max(0,Number(overdueDays)||0));
  const end=new Date(now);end.setDate(end.getDate()+Math.max(0,Number(days)||0));end.setHours(23,59,59,999);
  return planOccurrencesBetween(start,end).filter(x=>x.p.type==='expense'&&x.p.required);
}
function mandatoryExpenses(days=30){
  return outstandingRequiredPlans(days).reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}
function mandatoryFreeImpact(days=30){
  return outstandingRequiredPlans(days)
    .filter(x=>!account(x.p.accountId)?.protected)
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}
function mandatoryImpactBetween(start,end){
  return planOccurrencesBetween(start,end)
    .filter(x=>x.p.type==='expense'&&x.p.required&&!account(x.p.accountId)?.protected)
    .reduce((sum,x)=>sum+Number(x.p.amount||0),0);
}

// V8.4: "Безопасно доступно" is a cash-flow safety calculation, not
// "capital minus the next 30 days". We simulate the explicit plan over a
// rolling horizon and ask how much could be spent today without the projected
// spendable balance falling below the user's reserve at any point.
function safetyHorizonDays(){
  return Math.max(30,Math.min(365,Math.round(Number(state.settings.safetyHorizonDays)||90)));
}
function safeCashflowForecast(days=safetyHorizonDays()){
  const horizon=Math.max(30,Math.min(365,Math.round(Number(days)||90)));
  const today=new Date();today.setHours(0,0,0,0);
  const end=new Date(today);end.setDate(end.getDate()+horizon);end.setHours(23,59,59,999);
  const overdueStart=new Date(today);overdueStart.setDate(overdueStart.getDate()-31);

  // Project every account separately so money held in a protected account does
  // not become spendable merely because future income is planned there. If a
  // protected account itself goes below zero, that deficit does reduce the
  // spendable pool because another account would ultimately have to cover it.
  const balances=new Map(state.accounts.map(a=>[a.id,Number(accountBalance(a.id))||0]));
  let unassignedDelta=0;
  const spendableBalance=()=>{
    let total=unassignedDelta,protectedPositive=0;
    state.accounts.forEach(a=>{
      const bal=Number(balances.get(a.id))||0;
      total+=bal;
      if(a.protected&&bal>0)protectedPositive+=bal;
    });
    return total-protectedPositive;
  };

  const byDay=new Map();
  planOccurrencesBetween(overdueStart,end).forEach(({p,date})=>{
    const d=new Date(date);d.setHours(0,0,0,0);
    const isPast=d<today;
    // A missed past income is not money we can rely on today. A missed required
    // expense is still an obligation and is treated as due immediately.
    if(isPast && !(p.type==='expense'&&p.required))return;
    if(p.type!=='income'&&p.type!=='expense')return;
    const target=isPast?new Date(today):d;
    // An income without a valid destination account is too uncertain to use in
    // a safety calculation. An expense without an account is still counted.
    const acc=account(p.accountId);
    if(p.type==='income'&&!acc)return;
    const key=toISODate(target);
    const row=byDay.get(key)||{date:target,events:[],income:0,expense:0,requiredExpense:0};
    const amount=Math.max(0,Number(p.amount)||0);
    if(!amount)return;
    row.events.push({p,amount,accountId:acc?.id||'',type:p.type});
    if(p.type==='income')row.income+=amount;
    else{
      row.expense+=amount;
      if(p.required)row.requiredExpense+=amount;
    }
    byDay.set(key,row);
  });

  const rows=[...byDay.values()].sort((a,b)=>a.date-b.date);
  const reserve=explicitReserve();
  const currentSpendable=spendableBalance();
  let minSpendable=currentSpendable,lowestDate=new Date(today);
  let plannedIncome=0,plannedExpense=0,requiredExpense=0;

  rows.forEach(row=>{
    row.events.forEach(event=>{
      const amount=event.amount;
      if(event.accountId&&balances.has(event.accountId)){
        balances.set(event.accountId,(Number(balances.get(event.accountId))||0)+(event.type==='income'?amount:-amount));
      }else if(event.type==='expense'){
        unassignedDelta-=amount;
      }
    });
    plannedIncome+=row.income;
    plannedExpense+=row.expense;
    requiredExpense+=row.requiredExpense;
    row.balance=spendableBalance();
    if(row.balance<minSpendable){minSpendable=row.balance;lowestDate=new Date(row.date)}
  });

  const available=Math.max(0,minSpendable-reserve);
  const deficit=Math.max(0,reserve-minSpendable);
  return {
    days:horizon,
    total:totalBalance(),
    protected:protectedBalance(),
    reserve,
    currentSpendable,
    available,
    deficit,
    minSpendable,
    lowestDate,
    endSpendable:spendableBalance(),
    plannedIncome,
    plannedExpense,
    requiredExpense,
    rows
  };
}
function freeBalance(){ return safeCashflowForecast().available; }

function expenseByCategory(key=monthKey()){
  const map={};
  state.transactions.filter(t=>isAnalyticalTransaction(t)&&t.type==='expense' && (t.date||'').slice(0,7)===key).forEach(t=>map[t.categoryId]=(map[t.categoryId]||0)+Number(t.amount||0));
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
  state.transactions.filter(t=>isAnalyticalTransaction(t)&&t.type==='expense' && (t.date||'').slice(0,7)===key).forEach(t=>{
    spentMap[t.categoryId]=(spentMap[t.categoryId]||0)+Number(t.amount||0);
  });
  return state.budgets.map(b=>{
    const spent=spentMap[b.categoryId]||0;
    const limit=Math.max(0,Number(b.limit)||0);
    return {...b,spent,limit,remaining:limit-spent,ratio:limit?spent/limit:0,category:category(b.categoryId)};
  }).sort((a,b)=>b.ratio-a.ratio);
}

function budgetPaceSnapshot(key=monthKey()){
  const rows=budgetSnapshot(key).filter(b=>b.limit>0);
  if(!rows.length)return null;
  const now=new Date();
  const currentKey=monthKey(now);
  const inCurrent=key===currentKey;
  const base=inCurrent?now:parseISO(`${key}-01`);
  const daysInMonth=lastDayOfMonth(base.getFullYear(),base.getMonth());
  const elapsed=inCurrent?Math.max(1,Math.min(daysInMonth,now.getDate())):daysInMonth;
  const daysLeft=inCurrent?Math.max(1,daysInMonth-now.getDate()+1):0;
  const totalLimit=rows.reduce((s,b)=>s+b.limit,0);
  const totalSpent=rows.reduce((s,b)=>s+b.spent,0);
  const remaining=totalLimit-totalSpent;
  const expectedSpent=totalLimit*(elapsed/daysInMonth);
  const paceRatio=expectedSpent>0?totalSpent/expectedSpent:0;
  const projected=elapsed>0?totalSpent/elapsed*daysInMonth:totalSpent;
  return {rows,totalLimit,totalSpent,remaining,expectedSpent,paceRatio,projected,daysInMonth,elapsed,daysLeft,dailyRemaining:daysLeft?Math.max(0,remaining)/daysLeft:0};
}

function budgetSuggestions(months=3){
  const earliest=[...state.transactions].filter(t=>isAnalyticalTransaction(t)&&t.type==='expense'&&t.date).map(t=>t.date).sort()[0]||'';
  if(!earliest)return [];
  const now=new Date();
  const keys=[];
  for(let i=Math.max(1,Number(months)||3);i>=1;i--){
    const d=addMonths(now,-i);
    const key=monthKey(d);
    if(key>=earliest.slice(0,7))keys.push(key);
  }
  if(keys.length<2)return [];
  const existing=new Set(state.budgets.map(b=>b.categoryId));
  const out=[];
  state.categories.filter(c=>c.type==='expense'&&!existing.has(c.id)).forEach(c=>{
    const values=keys.map(key=>state.transactions.filter(t=>isAnalyticalTransaction(t)&&t.type==='expense'&&t.categoryId===c.id&&(t.date||'').slice(0,7)===key).reduce((s,t)=>s+Number(t.amount||0),0));
    const active=values.filter(v=>v>.005).length;
    if(active<2)return;
    const average=values.reduce((s,v)=>s+v,0)/values.length;
    if(average<5)return;
    const suggested=Math.ceil(average/5)*5;
    out.push({categoryId:c.id,category:c,average,suggested,months:keys.length});
  });
  return out.sort((a,b)=>b.average-a.average).slice(0,10);
}

function monthsUntil(dateISO){
  if(!dateISO)return null;
  const d=parseISO(dateISO),now=new Date();
  now.setHours(12,0,0,0);
  const days=Math.max(0,(d-now)/86400000);
  // Monthly goal pace should reflect the actual time left, not only the
  // difference between calendar month numbers (Aug 31 -> Dec 1 is ~3 months,
  // not four full months).
  return Math.max(1,days/30.4375);
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
  const now=new Date();now.setHours(23,59,59,999);
  const curStart=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
  const prevDate=addMonths(now,-1);
  const prevStart=new Date(prevDate.getFullYear(),prevDate.getMonth(),1,0,0,0,0);
  const compareDay=Math.min(now.getDate(),lastDayOfMonth(prevDate.getFullYear(),prevDate.getMonth()));
  const curEnd=new Date(now.getFullYear(),now.getMonth(),compareDay,23,59,59,999);
  const prevEnd=new Date(prevDate.getFullYear(),prevDate.getMonth(),compareDay,23,59,59,999);
  const cur=totalsBetween(curStart,curEnd),prev=totalsBetween(prevStart,prevEnd);
  return {
    current:cur,previous:prev,
    expenseDelta:prev.expense?((cur.expense-prev.expense)/prev.expense*100):null,
    incomeDelta:prev.income?((cur.income-prev.income)/prev.income*100):null,
    throughDay:compareDay,
    label:`за первые ${compareDay} дн. месяца`
  };
}

function financialRunway(){
  const nextMonth=addMonths(new Date(),1);
  const baseline=forecastBaseForMonth('expense',nextMonth).amount;
  return baseline>0?Math.max(0,(totalBalance()-reservedBalance())/baseline):null;
}


function lastTransactionDate(){
  const dates=state.transactions.map(t=>t.date).filter(Boolean).sort();
  return dates.length?parseISO(dates.at(-1)):null;
}
function daysSince(date){
  if(!date)return null;
  const a=new Date();a.setHours(0,0,0,0);const b=new Date(date);b.setHours(0,0,0,0);
  return Math.max(0,calendarDayDiff(b,a));
}
function nextIncomeOccurrence(){
  return upcomingPlans(90).find(x=>x.p.type==='income')||null;
}
function nextIncomeStatus(){
  const next=nextIncomeOccurrence();
  if(!next)return null;
  const today=new Date();today.setHours(0,0,0,0);
  const end=new Date(next.date);end.setHours(23,59,59,999);
  const days=Math.max(0,calendarDayDiff(today,next.date));
  const overdueStart=new Date(today);overdueStart.setDate(overdueStart.getDate()-31);
  const required=mandatoryImpactBetween(overdueStart,end);
  const liquid=Math.max(0,totalBalance()-reservedBalance());
  const afterRequired=liquid-required;
  return {
    days,date:next.date,
    title:next.p.title||planCategory(next.p)?.name||'Следующий доход',
    amount:Number(next.p.amount)||0,
    required,
    afterRequired,
    shortage:Math.max(0,-afterRequired)
  };
}
function duplicateCandidates(){
  const map=new Map();
  state.transactions.filter(t=>isAnalyticalTransaction(t)&&t.type!=='transfer').forEach(t=>{
    const key=[t.date,t.type,Number(t.amount||0).toFixed(2),t.accountId||'',t.categoryId||''].join('|');
    const arr=map.get(key)||[];arr.push(t);map.set(key,arr);
  });
  return [...map.values()].filter(g=>g.length>1);
}
function unusualExpense(){
  const vals=state.transactions.filter(t=>isAnalyticalTransaction(t)&&t.type==='expense').map(t=>Number(t.amount)||0).filter(v=>v>0).sort((a,b)=>a-b);
  if(vals.length<6)return null;
  const median=vals[Math.floor(vals.length/2)]||0;
  return [...state.transactions].filter(t=>isAnalyticalTransaction(t)&&t.type==='expense'&&Number(t.amount)>Math.max(150,median*3.5)).sort((a,b)=>Number(b.amount)-Number(a.amount))[0]||null;
}
function accountsNeedingReconcile(){
  const now=Date.now();
  return state.accounts.filter(a=>{
    const used=state.transactions.some(t=>t.accountId===a.id||t.toAccountId===a.id);
    if(!used)return false;
    if(!a.lastReconciledAt)return true;
    return (now-Number(a.lastReconciledAt))/86400000>=30;
  });
}
function financialInsights(){
  const now=new Date();
  // Trend detection uses three completed months. Comparing an unfinished
  // current month with full prior months creates false "growth"/"decline".
  const months=[3,2,1].map(i=>monthTotals(monthKey(addMonths(now,-i))));
  const rising=months[0].expense>0&&months[1].expense>months[0].expense&&months[2].expense>months[1].expense;
  const next=addMonths(now,1);
  const req=planItemsForMonth(next).filter(x=>x.p.type==='expense'&&x.p.required).reduce((sum,x)=>sum+Number(x.p.amount||0),0);
  const inc=forecastBaseForMonth('income',next).amount;
  const cats=expenseByCategory();
  const out=[];
  if(rising)out.push({title:'Расходы росли 3 полных месяца подряд',sub:`Последний завершённый месяц: ${fmtMajor(months[2].expense)}. Проверьте, это разовые траты или новый уровень расходов.`,tone:'warn'});
  if(inc>0&&req>0)out.push({title:`${Math.round(req/inc*100)}% расчётного дохода следующего месяца уже занято`,sub:`Обязательные платежи следующего месяца: ${fmtMajor(req)}.`,tone:req/inc>.7?'warn':'info'});
  if(cats[0])out.push({title:`Главная категория месяца — ${cats[0].name}`,sub:`На неё ушло ${fmtMajor(cats[0].value)}.`,tone:'info'});
  const h=monthlyCashflowHealth(forecastSeries(6).series);
  if(h.hasDeficit)out.push({title:'В прогнозе есть дефицитный месяц',sub:`Для закрытия худшего разрыва нужно около ${fmtMajor(h.required)} дополнительного дохода в месяц.`,tone:'warn'});
  else out.push({title:'Ближайшие 6 месяцев сбалансированы',sub:'В базовом прогнозе нет месяца, где расчётные расходы выше доходов.',tone:'good'});
  return out.slice(0,4);
}

function attentionItems(){
  const items=[];
  const now=new Date();now.setHours(0,0,0,0);
  const overdueStart=new Date(now);overdueStart.setDate(overdueStart.getDate()-31);
  const overdueEnd=new Date(now);overdueEnd.setDate(overdueEnd.getDate()-1);overdueEnd.setHours(23,59,59,999);
  const overdue=planOccurrencesBetween(overdueStart,overdueEnd);
  if(overdue.length)items.push({id:'overdue',level:'warn',icon:'calendar',title:`Просрочено планов: ${overdue.length}`,sub:'Проведите, перенесите или удалите событие.',action:'open-overdue'});
  const over=budgetSnapshot().filter(b=>b.ratio>1);
  if(over.length)items.push({id:'budgets',level:'warn',icon:'chart',title:`Перерасход бюджетов: ${over.length}`,sub:`Самый большой — ${over[0].category?.name||'категория'}.`,action:'open-budgets'});
  const pace=budgetPaceSnapshot();
  if(!over.length&&pace&&pace.daysLeft>=5&&pace.paceRatio>1.25)items.push({id:'budget-pace',level:'info',icon:'chart',title:'Расходы идут быстрее бюджетного темпа',sub:`По лимитам потрачено ${fmtMajor(pace.totalSpent)} из ${fmtMajor(pace.totalLimit)}.`,action:'open-budgets'});
  const safety=safeCashflowForecast();
  if(safety.deficit>0)items.push({id:'free',level:'danger',icon:'info',title:`По плану не хватает ${fmtMajor(safety.deficit)}`,sub:`К ${fmtDate(toISODate(safety.lowestDate))} доступный остаток опускается ниже финансовой подушки.`,action:'explain-free'});
  const health=monthlyCashflowHealth(forecastSeries(3).series);
  if(health.hasDeficit)items.push({id:'cashflow',level:'warn',icon:'chart',title:`Дефицит до ${fmtMajor(health.required)} / мес.`,sub:'В одном из ближайших месяцев расходы выше доходов.',action:'explain-cashflow'});
  const age=daysSince(lastTransactionDate());
  if(age!==null&&age>=10)items.push({id:'stale',level:'info',icon:'info',title:`Данные не обновлялись ${age} дн.`,sub:'Прогноз может быть менее точным.',action:'open-quick'});
  const backupAge=state.settings.lastBackupAt?Math.floor((Date.now()-state.settings.lastBackupAt)/86400000):null;
  if(state.transactions.length&&(backupAge===null||backupAge>=14))items.push({id:'backup',level:'info',icon:'upload',title:'Пора сделать резервную копию',sub:backupAge===null?'Копия ещё не создавалась.':`Последняя копия была ${backupAge} дн. назад.`,action:'export-json'});
  const duplicates=duplicateCandidates();
  if(duplicates.length)items.unshift({id:'duplicates',level:'warn',icon:'info',title:`Возможные дубликаты: ${duplicates.length}`,sub:'Одинаковые операции в один день. Проверьте, не записаны ли они дважды.',action:'open-duplicates'});
  const staleAccounts=accountsNeedingReconcile();
  if(staleAccounts.length)items.push({id:'reconcile',level:'info',icon:'wallet',title:`Сверьте счета: ${staleAccounts.length}`,sub:'Баланс этих счетов не сверялся более 30 дней или ещё не сверялся.',action:'open-reconcile'});
  const unusual=unusualExpense();
  if(unusual)items.push({id:'unusual',level:'info',icon:'chart',title:`Необычно крупная трата: ${fmtMajor(unusual.amount)}`,sub:`${category(unusual.categoryId)?.name||'Расход'} · ${fmtDate(unusual.date)}`,action:'open-unusual'});
  const review=state.transactions.filter(t=>t.needsReview).length;
  if(review)items.unshift({id:'review',level:'info',icon:'tag',title:`Нужно уточнить операций: ${review}`,sub:'Быстрые записи без точной категории.',action:'open-review'});
  return items;
}
function explanationData(key){
  const total=totalBalance(), reserved=reservedBalance(), safety=safeCashflowForecast(), free=safety.available;
  const m=monthTotals();const runway=financialRunway();
  const forecast=forecastSeries(3);const health=monthlyCashflowHealth(forecast.series);
  const map={
    capital:{title:'Общий капитал',lead:fmtMajor(total),body:`Это сумма остатков всех счетов и наличных. Переводы между своими счетами капитал не меняют.`},
    free:{title:'Безопасно доступно',lead:fmtMajor(free),body:`Приложение моделирует явные плановые доходы и расходы на ${safety.days} дней вперёд и находит самый низкий прогнозируемый доступный остаток (${fmtMajor(safety.minSpendable)}${safety.rows.length?` около ${fmtDate(toISODate(safety.lowestDate))}`:''}). Из него сохраняется финансовая подушка ${fmtMajor(safety.reserve)}. Защищённые счета не считаются деньгами для повседневных трат. Исторические средние доходы здесь специально не предполагаются. Незапланированные будущие покупки в расчёт не входят.`},
    reserve:{title:'Зарезервировано',lead:fmtMajor(reserved),body:`Сюда входят защищённые счета (${fmtMajor(protectedBalance())}) и финансовая подушка (${fmtMajor(explicitReserve())}). Подушка задаёт минимальный остаток, ниже которого расчёт «Безопасно доступно» не разрешает опускать прогноз.`},
    month:{title:'По плану к концу месяца',lead:fmtMajor(monthRemainingSummary().projected),body:`Текущий капитал ${fmtMajor(total)} + оставшиеся плановые доходы ${fmtMajor(monthRemainingSummary().income)} − оставшиеся плановые расходы ${fmtMajor(monthRemainingSummary().expense)}. Незапланированные будущие покупки сюда не добавляются.`},
    savings:{title:'Норма накопления',lead:m.income?`${Math.round(m.net/m.income*100)}%`:'—',body:'Доля дохода текущего месяца, которая осталась после расходов. Формула: (доходы − расходы) ÷ доходы.'},
    runway:{title:'Запас без новых доходов',lead:runway===null?'—':`${runway.toFixed(1)} мес.`,body:'Сколько месяцев доступный капитал после резерва покрывает текущий расчётный уровень расходов, если новые доходы полностью прекратятся.'},
    nextIncome:(()=>{const n=nextIncomeStatus();return n?{title:'До следующего дохода',lead:`${n.days} дн.`,body:`Следующий плановый доход: ${fmtMajor(n.amount)} · ${n.title}. До него обязательных платежей, уменьшающих свободные деньги: ${fmtMajor(n.required)}.${n.shortage>0?` Не хватает ${fmtMajor(n.shortage)} до этого дохода.`:''}`}:{title:'До следующего дохода',lead:'—',body:'В ближайшие 90 дней плановый доход не найден.'}})(),
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
  if(action==='open-reconcile'){openAccountsManager();return}
  if(action==='open-duplicates'){openDuplicateSheet();return}
  if(action==='open-unusual'){const t=unusualExpense();if(t)openTransactionDetail(t);return}
  if(action==='explain-free')return openExplanation('free');
  if(action==='explain-cashflow')return openExplanation('cashflow');
}

function openDuplicateSheet(){
  const groups=duplicateCandidates();
  openSheet(`<div class="sheet-head"><h3>Возможные дубликаты</h3><button class="sheet-close">×</button></div>${groups.length?`<div class="duplicate-list">${groups.map(g=>`<div class="duplicate-group"><strong>${fmtDate(g[0].date)} · ${fmtMajor(g[0].amount)}</strong><small>${esc(category(g[0].categoryId)?.name||'Без категории')} · ${g.length} одинаковых записей</small>${g.map(t=>`<button data-dup-tx="${t.id}">${esc(t.note||t.merchant||'Операция')}<span>${esc(account(t.accountId)?.name||'')}</span></button>`).join('')}</div>`).join('')}</div>`:`<div class="empty-inline"><strong>Дубликатов не найдено</strong><span>Проверка не нашла одинаковых операций.</span></div>`}`);
  $$('[data-dup-tx]').forEach(b=>b.onclick=()=>openTransactionDetail(state.transactions.find(t=>t.id===b.dataset.dupTx)));
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
  // V6.1: chart coordinate system matches the actual iPhone portrait aspect.
  // The old 680×230 canvas was stretched into a tall mobile container,
  // which distorted SVG text and pushed X labels into the KPI cards.
  const w=400,h=260,pl=46,pr=12,pt=16,pb=46;
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
  const grid=yTicks.map(v=>`<g><line class="chart-grid" x1="${pl}" y1="${yFor(v)}" x2="${w-pr}" y2="${yFor(v)}"/><text class="chart-y-label chart-axis-y" x="${pl-8}" y="${yFor(v)+3.5}" text-anchor="end" dominant-baseline="middle">${esc(compactMoney(v))}</text></g>`).join('');
  const stride=Math.max(1,Math.ceil((data.length-1)/5));
  const labels=pts.map((q,i)=>((i===0||i===pts.length-1||i%stride===0)&&q.label)?`<text class="chart-label chart-axis-x" x="${q.x}" y="${h-15}" text-anchor="middle" dominant-baseline="middle">${esc(q.label)}</text>`:'').join('');
  const zero=min<0&&max>0?`<line class="chart-zero" x1="${pl}" y1="${yFor(0)}" x2="${w-pr}" y2="${yFor(0)}"/>`:'';
  const dots=pts.map(q=>`<circle class="${q.events?.length?'chart-dot chart-event-dot':'chart-dot'}" cx="${q.x}" cy="${q.y}" r="${q.events?.length?4.2:2.8}"></circle>`).join('');
  return `<div class="chart-shell ${interactive?'interactive-chart':''} chart-${height}" data-chart-id="${id}" data-points="${data.length}">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="График">
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
    const vb=svg.viewBox.baseVal, pl=46, pr=12, pt=16, pb=46;
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
  const x=isTab ? direction*Math.max(8,Math.min(14,window.innerWidth*.028)) : 0;
  const y=isTab ? 1 : 4;

  main._motion=main.animate(
    [
      {opacity:isTab?.62:.84, transform:`translate3d(${x}px,${y}px,0) scale(.9975)`},
      {opacity:.94, offset:.56, transform:`translate3d(${x*.18}px,0,0) scale(.9994)`},
      {opacity:1, transform:'translate3d(0,0,0) scale(1)'}
    ],
    {
      duration:motionMs(isTab?520:335),
      easing:'cubic-bezier(.20,.68,.18,1)',
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

function animateContentStagger(root=$('#main')){
  if(!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const candidates=[
    ...root.querySelectorAll(':scope > section, :scope > .hero, :scope > .section, :scope > .clean-surface')
  ].filter((el,i,arr)=>arr.indexOf(el)===i).slice(0,10);

  candidates.forEach((el,index)=>{
    if(el.dataset.motionEntered==='1') return;
    el.dataset.motionEntered='1';
    const delay=Math.min(index*18,90);
    el.animate(
      [
        {opacity:.84,transform:'translate3d(0,7px,0) scale(.9988)'},
        {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
      ],
      {
        duration:motionMs(390),
        delay:motionMs(delay),
        easing:'cubic-bezier(.20,.70,.18,1)',
        fill:'backwards'
      }
    );
  });
}

function animateSheetContent(sheet){
  if(!sheet || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const content=$('.sheet-content',sheet);
  if(!content) return;
  if(content._enterMotion) try{content._enterMotion.cancel()}catch(_){}
  content._enterMotion=content.animate(
    [
      {opacity:.86,transform:'translate3d(0,9px,0) scale(.9985)'},
      {opacity:.97,offset:.58,transform:'translate3d(0,2px,0) scale(.9997)'},
      {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
    ],
    {
      duration:motionMs(430),
      delay:motionMs(72),
      easing:'cubic-bezier(.20,.68,.18,1)',
      fill:'backwards'
    }
  );
}

function animatePageChrome(){
  const title=$('#pageTitle');
  if(title && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    title.animate(
      [
        {opacity:.35,transform:'translate3d(0,4px,0)'},
        {opacity:1,transform:'translate3d(0,0,0)'}
      ],
      {duration:motionMs(410),easing:'cubic-bezier(.20,.70,.18,1)'}
    );
  }
}

function animateLocalSurface(el){
  if(!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(el._motion) try{el._motion.cancel()}catch(_){}
  el._motion=el.animate(
    [{opacity:.78,transform:'translate3d(0,3px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],
    {duration:motionMs(320),easing:'cubic-bezier(.20,.68,.18,1)'}
  );
}

function animateTabSwap(direction){
  const main=$('#main');
  if(!main || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // V7.1.1: never keep the previous page on screen. The destination page is
  // rendered immediately and only it receives a very small, fully opaque
  // settling motion. This preserves iOS-like continuity without a ghost/crossfade.
  const duration=motionMs(430);
  const travel=Math.max(5,Math.min(9,window.innerWidth*.018));
  const enterX=direction*travel;

  if(main._motion){try{main._motion.cancel()}catch(_){}main._motion=null}
  const incoming=main.animate([
    {opacity:1,transform:`translate3d(${enterX}px,2px,0) scale(.9988)`},
    {opacity:1,offset:.58,transform:`translate3d(${enterX*.20}px,.4px,0) scale(.9997)`},
    {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
  ],{
    duration,
    easing:'cubic-bezier(.18,.78,.20,1)',
    fill:'both'
  });
  main._motion=incoming;

  const finish=()=>{
    if(main._motion===incoming) main._motion=null;
    try{incoming.cancel()}catch(_){}
    main.style.opacity='';
    main.style.transform='';
  };
  incoming.onfinish=finish;
  incoming.oncancel=()=>{
    if(main._motion===incoming) main._motion=null;
    main.style.opacity='';
    main.style.transform='';
  };
}

function switchTab(next){
  if(!next || next===activeTab) return;

  rememberViewState();
  previousTab=activeTab;

  const oldIndex=tabIndex(activeTab);
  const newIndex=tabIndex(next);
  const direction=newIndex>=oldIndex?1:-1;

  activeTab=next;
  window.scrollTo(0,0);
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
  render({motion:'none',direction});
  animatePageChrome();
  requestAnimationFrame(()=>animateTabSwap(direction));
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
      row.style.transition=`transform ${motionMs(320)}ms cubic-bezier(.16,.86,.18,1)`;
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
  const previous=structuredClone(state);
  const removed={...tx};
  const removedCompletions=state.planCompletions.filter(x=>x.transactionId===tx.id);
  state.transactions=state.transactions.filter(x=>x.id!==tx.id);
  state.planCompletions=state.planCompletions.filter(x=>x.transactionId!==tx.id);
  try{
    await persist();
    render();
    showToast('Операция удалена','Отменить',async()=>{
      state.transactions.push(removed);
      state.planCompletions.push(...removedCompletions);
      await persist();render();showToast('Удаление отменено');
    });
  }catch(_){
    state=previous;render({motion:'none'});showToast('Не удалось удалить операцию');
  }
}

function animateChartsOnView(root=$('#main')){
  if(chartEntranceObserver){
    try{chartEntranceObserver.disconnect()}catch(_){}
    chartEntranceObserver=null;
  }
  if(!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const lineCharts=$$('.chart-shell',root);
  const barCharts=$$('.chart',root).filter(el=>el.querySelector(':scope > svg .bar-income, :scope > svg .bar-expense'));

  lineCharts.forEach(el=>el.classList.add('chart-await-rise'));
  barCharts.forEach(el=>el.classList.add('chart-bars-await'));

  const start=el=>{
    if(el.classList.contains('chart-await-rise')){
      el.classList.remove('chart-await-rise');
      el.classList.add('chart-rise');
    }
    if(el.classList.contains('chart-bars-await')){
      el.classList.remove('chart-bars-await');
      el.classList.add('chart-bars-rise');
    }
  };

  if(!('IntersectionObserver' in window)){
    requestAnimationFrame(()=>[...lineCharts,...barCharts].forEach(start));
    return;
  }

  chartEntranceObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting) return;
      start(entry.target);
      chartEntranceObserver?.unobserve(entry.target);
    });
  },{
    threshold:.16,
    rootMargin:'0px 0px -6% 0px'
  });

  [...lineCharts,...barCharts].forEach(el=>chartEntranceObserver.observe(el));
}

function enhanceRenderedUI(){
  installPressFeedback($('#main'));
  animateContentStagger($('#main'));
  animateNumberElements($('#main'));
  animateChartsOnView($('#main'));
  if(activeTab==='transactions') bindSwipeRows();
}

function showToast(msg,actionLabel=null,action=null){
  const el=$('#toast');
  undoAction=typeof action==='function'?action:null;
  el.innerHTML=`<span>${esc(msg)}</span>${actionLabel&&undoAction?`<button id="toastAction" type="button">${esc(actionLabel)}</button>`:''}`;
  el.classList.remove('hidden');
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    try{el._toastMotion?.cancel()}catch(_){}
    el._toastMotion=el.animate(
      [
        {opacity:0,transform:'translate3d(-50%,12px,0) scale(.965)'},
        {opacity:1,transform:'translate3d(-50%,-2px,0) scale(1.004)',offset:.72},
        {opacity:1,transform:'translate3d(-50%,0,0) scale(1)'}
      ],
      {duration:motionMs(440),easing:'cubic-bezier(.20,.70,.18,1)'}
    );
  }
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


function currentWorkspace(){return state.workspace==='business'?'business':'personal'}
function businessData(){
  if(!state.business)state.business=defaultState().business;
  const d=defaultState().business;
  state.business.settings={...d.settings,...(state.business.settings||{})};
  for(const key of ['orders','customerPayments','factoryPayments','inputVat','vatPayments','vatCorrections','adjustments'])if(!Array.isArray(state.business[key]))state.business[key]=[];
  return state.business;
}
function businessMoney(n,signed=false){return fmtMajor(Number(n)||0,signed)}
function businessOrder(id){return businessData().orders.find(x=>x.id===id)||null}
function businessOrderPayments(orderId){return businessData().customerPayments.filter(x=>x.orderId===orderId)}
function businessRate(order){const n=Number(order?.vatRate);return Number.isFinite(n)&&n>=0?n:Number(businessData().settings.defaultVatRate)||19}
function businessGrossFromBasis(amount,order){
  const a=Math.max(0,Number(amount)||0),r=businessRate(order);
  if(!order?.taxable||order?.vatIncluded!==false||r<=0)return a;
  return a*(1+r/100);
}
function businessVatFromGross(gross,rate){const g=Math.max(0,Number(gross)||0),r=Math.max(0,Number(rate)||0);return r>0?g*r/(100+r):0}
function businessPaymentGross(payment,order=businessOrder(payment?.orderId)){return businessGrossFromBasis(payment?.amount,order)}
function businessOrderGross(order){return businessGrossFromBasis(order?.totalAmount,order)}
function businessOrderReceivedBasis(orderId,excludePaymentId=''){return businessOrderPayments(orderId).filter(x=>x.id!==excludePaymentId).reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0)}
function businessOrderReceivedGross(orderId){const o=businessOrder(orderId);return businessOrderPayments(orderId).reduce((s,x)=>s+businessPaymentGross(x,o),0)}
function businessOrderRemainingBasis(orderId){const o=businessOrder(orderId);return Math.max(0,(Number(o?.totalAmount)||0)-businessOrderReceivedBasis(orderId))}
function businessPaidTotal(){return businessData().factoryPayments.reduce((s,x)=>s+Math.max(0,Number(x.amount)||0),0)}
function businessCostTotal(excludeOrderId=''){return businessData().orders.filter(x=>x.id!==excludeOrderId).reduce((s,x)=>s+Math.max(0,Number(x.factoryCost)||0),0)}
function businessPeriodMode(){return businessData().settings.vatPeriod==='monthly'?'monthly':'quarterly'}
function businessTaxationMode(){return businessData().settings.taxationMode==='soll'?'soll':'ist'}
function businessPeriodKey(dateISO,mode=businessPeriodMode()){
  const d=parseISO(dateISO||todayISO()),y=d.getFullYear(),m=d.getMonth()+1;
  return mode==='monthly'?`${y}-${String(m).padStart(2,'0')}`:`${y}-Q${Math.floor((m-1)/3)+1}`;
}
function businessPeriodBounds(key){
  let y,mStart,mEnd;
  if(/^[0-9]{4}-Q[1-4]$/.test(key)){y=Number(key.slice(0,4));const q=Number(key.slice(-1));mStart=(q-1)*3;mEnd=mStart+2}
  else{const parts=String(key).split('-');y=Number(parts[0]);mStart=Math.max(0,(Number(parts[1])||1)-1);mEnd=mStart}
  const start=new Date(y,mStart,1,12),end=new Date(y,mEnd+1,0,12),due=new Date(y,mEnd+1,10,12);
  return {start,end,due,startISO:toISODate(start),endISO:toISODate(end),dueISO:toISODate(due)};
}
function businessPeriodLabel(key){
  if(/Q[1-4]$/.test(key))return `${key.slice(-2)} ${key.slice(0,4)}`;
  const b=businessPeriodBounds(key);return new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(b.start);
}
function businessPeriodDueText(key){const b=businessPeriodBounds(key),d=b.due;const weekend=d.getDay()===0||d.getDay()===6;return `${fmtDate(b.dueISO)}${weekend?' · базовая дата приходится на выходной':''}`}
function businessClosedVatKeys(){return new Set(businessData().vatPayments.filter(x=>x.closed!==false).map(x=>x.periodKey))}
function businessVatEvents(){
  const b=businessData(),mode=businessTaxationMode(),events=[];
  for(const order of b.orders){
    if(!order.taxable||businessRate(order)<=0)continue;
    const rate=businessRate(order),payments=businessOrderPayments(order.id).slice().sort((a,z)=>(a.date||'').localeCompare(z.date||''));
    if(mode==='ist'){
      for(const p of payments){const gross=businessPaymentGross(p,order);events.push({id:`pay-${p.id}`,orderId:order.id,paymentId:p.id,date:p.date,amount:businessVatFromGross(gross,rate),gross,kind:'payment'})}
      continue;
    }
    const delivery=order.deliveryDate||'';
    let advanceGross=0;
    for(const p of payments){
      if(!delivery||p.date<delivery){const gross=businessPaymentGross(p,order);advanceGross+=gross;events.push({id:`advance-${p.id}`,orderId:order.id,paymentId:p.id,date:p.date,amount:businessVatFromGross(gross,rate),gross,kind:'advance'})}
    }
    if(delivery){const totalGross=businessOrderGross(order),remainingGross=Math.max(0,totalGross-advanceGross);if(remainingGross>.0001)events.push({id:`delivery-${order.id}`,orderId:order.id,date:delivery,amount:businessVatFromGross(remainingGross,rate),gross:remainingGross,kind:'delivery'})}
  }
  return events.filter(x=>x.date).sort((a,z)=>a.date.localeCompare(z.date));
}
function businessVatPeriodMap(){
  const b=businessData(),map=new Map(),closed=businessClosedVatKeys();
  const ensure=key=>{if(!map.has(key))map.set(key,{key,label:businessPeriodLabel(key),taxableGross:0,outputVat:0,inputVat:0,correction:0,safeReserve:0,net:0,expected:0,closed:closed.has(key),payment:null});return map.get(key)};
  for(const e of businessVatEvents()){if(e.date>todayISO())continue;const p=ensure(businessPeriodKey(e.date));p.taxableGross+=Math.max(0,Number(e.gross)||0);p.outputVat+=e.amount;p.safeReserve+=e.amount}
  for(const x of b.inputVat){if(x.confirmed===false||(x.date||'')>todayISO())continue;ensure(businessPeriodKey(x.date)).inputVat+=Math.max(0,Number(x.amount)||0)}
  for(const x of b.vatCorrections){if((x.date||'')>todayISO())continue;const p=ensure(x.periodKey||businessPeriodKey(x.date));p.correction+=Number(x.amount)||0;if(Number(x.amount)>0)p.safeReserve+=Number(x.amount)||0}
  for(const x of b.vatPayments){const p=ensure(x.periodKey);p.closed=true;p.payment=x}
  for(const p of map.values()){p.net=p.outputVat-p.inputVat+p.correction;p.expected=Math.max(0,p.net);if(p.closed)p.safeReserve=0}
  return map;
}
function businessVatPeriods(){return [...businessVatPeriodMap().values()].sort((a,z)=>z.key.localeCompare(a.key))}
function businessCurrentVatPeriod(){const key=businessPeriodKey(todayISO()),map=businessVatPeriodMap();return map.get(key)||{key,label:businessPeriodLabel(key),taxableGross:0,outputVat:0,inputVat:0,correction:0,safeReserve:0,net:0,expected:0,closed:false,payment:null}}
function businessVatSafeReserve(){return businessVatPeriods().reduce((s,p)=>s+(p.closed?0:Math.max(0,p.safeReserve)),0)}
function businessVatExpectedTotal(){return businessVatPeriods().reduce((s,p)=>s+(p.closed?0:Math.max(0,p.expected)),0)}
function businessMetrics(){
  const b=businessData();let card=Number(b.settings.cardOpening)||0,cash=Number(b.settings.cashOpening)||0,receivedGross=0,cardReceived=0,cashReceived=0;
  for(const p of b.customerPayments){const o=businessOrder(p.orderId);if(!o)continue;const a=businessPaymentGross(p,o);receivedGross+=a;if(p.method==='cash'){cash+=a;cashReceived+=a}else{card+=a;cardReceived+=a}}
  let paidFactory=0;for(const x of b.factoryPayments){const a=Math.max(0,Number(x.amount)||0);card-=a;paidFactory+=a}
  let paidVat=0;for(const x of b.vatPayments){const a=Math.max(0,Number(x.amount)||0);card-=a;paidVat+=a}
  for(const x of b.adjustments){const a=Number(x.amount)||0;if(x.account==='cash')cash+=a;else card+=a}
  const orderValue=b.orders.reduce((s,o)=>s+businessOrderGross(o),0),factoryCost=b.orders.reduce((s,o)=>s+Math.max(0,Number(o.factoryCost)||0),0),factoryDebt=Math.max(0,factoryCost-paidFactory),factoryCredit=Math.max(0,paidFactory-factoryCost);
  const vatReserve=businessVatSafeReserve(),vatExpected=businessVatExpectedTotal(),requiredCard=factoryDebt+vatReserve,freeCard=Math.max(0,card-requiredCard),cardShortage=Math.max(0,requiredCard-card),factoryAvailable=Math.max(0,Math.min(card,factoryDebt));
  const outstanding=Math.max(0,orderValue-receivedGross);
  return {card,cash,total:card+cash,receivedGross,cardReceived,cashReceived,orderValue,outstanding,factoryCost,paidFactory,factoryDebt,factoryCredit,vatReserve,vatExpected,paidVat,requiredCard,freeCard,cardShortage,factoryAvailable};
}
function businessOrderVatPeriods(orderId){return new Set(businessVatEvents().filter(e=>e.orderId===orderId).map(e=>businessPeriodKey(e.date)))}
function businessOrderCandidateVatPeriods(order,payments=businessOrderPayments(order?.id||'')){
  const keys=new Set();if(!order?.taxable||businessRate(order)<=0)return keys;
  if(businessTaxationMode()==='ist'){for(const p of payments)if(p.date)keys.add(businessPeriodKey(p.date));return keys}
  const delivery=order.deliveryDate||'';let advances=0;
  for(const p of payments){if(!delivery||p.date<delivery){if(p.date)keys.add(businessPeriodKey(p.date));advances+=businessPaymentGross(p,order)}}
  if(delivery&&businessOrderGross(order)-advances>.0001)keys.add(businessPeriodKey(delivery));
  return keys;
}
function businessOrderTouchesClosedVat(orderId){const closed=businessClosedVatKeys();return [...businessOrderVatPeriods(orderId)].some(k=>closed.has(k))}
function businessPaymentVatPeriods(payment,order=businessOrder(payment?.orderId)){
  const keys=new Set();if(!payment||!order||!order.taxable)return keys;
  if(businessTaxationMode()==='ist'){keys.add(businessPeriodKey(payment.date));return keys}
  if(!order.deliveryDate||payment.date<order.deliveryDate)keys.add(businessPeriodKey(payment.date));
  if(order.deliveryDate&&payment.date<order.deliveryDate)keys.add(businessPeriodKey(order.deliveryDate));
  return keys;
}
function businessPaymentTouchesClosedVat(payment,order=businessOrder(payment?.orderId)){const closed=businessClosedVatKeys();return [...businessPaymentVatPeriods(payment,order)].some(k=>closed.has(k))}
function updateWorkspaceChrome(){
  const business=currentWorkspace()==='business';
  const labels=business?{overview:'Обзор',transactions:'Заказы',plan:'Обязательства',stats:'Статистика',more:'Ещё'}:{overview:'Обзор',transactions:'Операции',plan:'План',stats:'Статистика',more:'Ещё'};
  $$('.nav-item').forEach(b=>{const t=b.dataset.tab;const sm=b.querySelector('small');if(sm&&labels[t])sm.textContent=labels[t]});
  const fab=$('#fab');if(fab)fab.setAttribute('aria-label',business?'Добавить заказ':'Добавить операцию');
  const wb=$('#workspaceSwitch');if(wb){wb.querySelector('strong').textContent=business?'Бизнес':'Личное';wb.classList.toggle('business',business)}
}
async function switchWorkspace(next){if(!['personal','business'].includes(next)||next===currentWorkspace())return;closeSheet();rememberViewState();state.workspace=next;activeTab='overview';window.scrollTo(0,0);await persist();updateWorkspaceChrome();render({motion:'none'});animatePageChrome();requestAnimationFrame(()=>animateTabSwap(next==='business'?1:-1))}
function openWorkspaceSheet(){const cur=currentWorkspace();openSheet(`<div class="sheet-head"><div><h3>Пространство</h3><p class="sheet-subtitle">Личные и бизнес-финансы хранятся отдельно.</p></div><button class="sheet-close">×</button></div><div class="workspace-list list-surface"><button data-workspace="personal" class="workspace-choice ${cur==='personal'?'selected':''}"><span class="workspace-symbol">⌂</span><span><strong>Личное</strong><small>Счета, операции, планы и бюджеты</small></span><b>${cur==='personal'?'✓':''}</b></button><button data-workspace="business" class="workspace-choice ${cur==='business'?'selected':''}"><span class="workspace-symbol">💼</span><span><strong>${esc(businessData().settings.name||'Бизнес')}</strong><small>Заказы, платежи, завод и НДС</small></span><b>${cur==='business'?'✓':''}</b></button></div>`);$$('[data-workspace]', $('#sheet')).forEach(b=>b.onclick=()=>switchWorkspace(b.dataset.workspace))}
function businessOrderRow(o){
  const received=businessOrderReceivedGross(o.id),total=businessOrderGross(o),remaining=Math.max(0,total-received),payments=businessOrderPayments(o.id).length;
  return `<button class="tx-item business-sale-row" data-business-order="${o.id}"><div class="tx-icon">${remaining>.01?'📦':'✓'}</div><div class="tx-main"><strong>${esc(o.title||'Заказ')}</strong><small>${payments} плат. · получено ${businessMoney(received)}${o.taxable?` · НДС ${businessRate(o)}%`:' · без НДС'}</small></div><div class="tx-amount ${remaining>.01?'':'positive'}">${remaining>.01?businessMoney(remaining):businessMoney(total)}</div></button>`
}
function businessVatPeriodRow(p){const due=businessPeriodDueText(p.key);return `<button class="list-button vat-period-row" data-vat-period="${p.key}"><span class="settings-icon">${p.closed?'✓':'%'}</span><div class="lb-main"><strong>${esc(p.label)}</strong><small>${p.closed?'Закрыт':`резерв ${businessMoney(p.safeReserve)} · к оплате ${businessMoney(p.expected)}`} · ${esc(due)}</small></div><span class="arrow">${uiIcon('chevron')}</span></button>`}
function renderBusinessOverview(){
  const m=businessMetrics(),b=businessData(),current=businessCurrentVatPeriod();
  $('#main').innerHTML=`<section class="business-hero ${m.cardShortage>0?'business-hero-warning':''}"><div class="business-kicker">${esc(b.settings.name||'Бизнес')} · свободно на карте</div><div class="business-free">${businessMoney(m.freeCard)}</div><div class="business-balance-grid"><div><span>На карте</span><strong>${businessMoney(m.card)}</strong></div><div><span>Наличные отдельно</span><strong>${businessMoney(m.cash)}</strong></div></div></section>
  <section class="factory-status ${m.cardShortage>0?'warning':''}"><div class="section-head"><h2>Что нельзя трогать на карте</h2></div><div class="factory-debt"><span>Всего обязательно сохранить</span><strong>${businessMoney(m.requiredCard)}</strong></div><div class="business-obligation-grid"><div><span>Заводу</span><b>${businessMoney(m.factoryDebt)}</b></div><div><span>Резерв НДС</span><b>${businessMoney(m.vatReserve)}</b></div></div>${m.cardShortage>0?`<p class="business-warning">На карте не хватает ${businessMoney(m.cardShortage)} для покрытия завода и безопасного резерва НДС. Наличные в этот расчёт не входят.</p>`:`<p class="business-ok">После всех обязательств на карте действительно свободно ${businessMoney(m.freeCard)}.</p>`}</section>
  <section class="section"><div class="section-head"><div><h2>НДС · ${esc(current.label)}</h2><p>${businessTaxationMode()==='ist'?'Istversteuerung':'Sollversteuerung'} · ${businessPeriodMode()==='monthly'?'ежемесячно':'поквартально'}</p></div><button data-business-vat>Открыть</button></div><div class="business-metrics list-surface"><div><span>Безопасный резерв</span><strong>${businessMoney(current.safeReserve)}</strong></div><div><span>Umsatzsteuer</span><strong>${businessMoney(current.outputVat)}</strong></div><div><span>Подтверждённая Vorsteuer</span><strong>${businessMoney(current.inputVat)}</strong></div><div><span>Ожидаемо Finanzamt</span><strong>${businessMoney(current.expected)}</strong></div></div></section>
  <section class="section"><div class="section-head"><h2>Последние заказы</h2><button data-business-all>Все</button></div>${b.orders.length?`<div class="tx-list list-surface">${[...b.orders].sort((a,z)=>(z.createdAt||0)-(a.createdAt||0)).slice(0,5).map(businessOrderRow).join('')}</div>`:'<div class="empty-inline"><strong>Заказов пока нет</strong><span>Нажмите + и создайте заказ. Платежи клиента можно добавлять частями.</span></div>'}</section>`;
  $('[data-business-vat]')?.addEventListener('click',()=>switchTab('plan'));$('[data-business-all]')?.addEventListener('click',()=>switchTab('transactions'));$$('[data-business-order]').forEach(el=>el.onclick=()=>openBusinessOrderDetail(el.dataset.businessOrder));
}
function renderBusinessOrders(){
  const b=businessData(),orders=[...b.orders].sort((a,z)=>(z.createdAt||0)-(a.createdAt||0));
  $('#main').innerHTML=`<section class="section first-section"><div class="section-head"><div><h2>Заказы</h2><p>${orders.length} · один заказ может иметь несколько платежей</p></div><button class="primary-mini" data-new-order>+ Заказ</button></div>${orders.length?`<div class="tx-list list-surface">${orders.map(businessOrderRow).join('')}</div>`:'<div class="empty-state"><strong>Здесь появятся заказы</strong><span>Создайте заказ, укажите стоимость завода и затем записывайте реальные платежи клиента.</span></div>'}</section>`;
  $('[data-new-order]')?.addEventListener('click',()=>openBusinessOrderSheet());$$('[data-business-order]').forEach(el=>el.onclick=()=>openBusinessOrderDetail(el.dataset.businessOrder));
}
function renderBusinessObligations(){
  const b=businessData(),m=businessMetrics(),periods=businessVatPeriods(),payments=[...b.factoryPayments].sort((a,z)=>(z.createdAt||0)-(a.createdAt||0));
  $('#main').innerHTML=`<section class="factory-status ${m.cardShortage>0?'warning':''} first-section"><div class="section-head"><h2>Завод</h2><button data-business-pay>Оплатить</button></div><div class="factory-debt"><span>Текущий долг</span><strong>${businessMoney(m.factoryDebt)}</strong></div><div class="factory-status-grid"><div><span>На карте</span><b>${businessMoney(m.card)}</b></div><div><span>Оплатить сейчас</span><b>${businessMoney(m.factoryAvailable)}</b></div></div></section>
  <section class="section"><div class="section-head"><div><h2>НДС</h2><p>Резерв не уменьшается от Vorsteuer до закрытия периода</p></div><button data-add-input-vat>+ Vorsteuer</button></div><div class="vat-summary-card ${m.cardShortage>0?'warning':''}"><div><span>Безопасный резерв НДС</span><strong>${businessMoney(m.vatReserve)}</strong></div><div><span>Ожидаемо к оплате</span><strong>${businessMoney(m.vatExpected)}</strong></div></div>${periods.length?`<div class="settings-list list-surface">${periods.map(businessVatPeriodRow).join('')}</div>`:'<div class="empty-inline"><strong>НДС пока не рассчитан</strong><span>Создайте налогооблагаемый заказ или внесите подтверждённую Vorsteuer.</span></div>'}</section>
  <section class="section"><div class="section-head"><h2>Оплаты заводу</h2></div>${payments.length?`<div class="settings-list list-surface">${payments.map(x=>`<button class="list-button" data-factory-payment="${x.id}"><span class="settings-icon">${uiIcon('transfer')}</span><div class="lb-main"><strong>${businessMoney(x.amount)}</strong><small>${fmtDate(x.date)}${x.note?' · '+esc(x.note):''}</small></div><span class="arrow">${uiIcon('chevron')}</span></button>`).join('')}</div>`:'<div class="empty-inline"><strong>Оплат ещё нет</strong><span>После перевода денег заводу запишите оплату здесь.</span></div>'}</section>`;
  $('[data-business-pay]')?.addEventListener('click',openFactoryPaymentSheet);$('[data-add-input-vat]')?.addEventListener('click',openInputVatSheet);$$('[data-vat-period]').forEach(el=>el.onclick=()=>openVatPeriodDetail(el.dataset.vatPeriod));$$('[data-factory-payment]').forEach(el=>el.onclick=()=>openFactoryPaymentDetail(el.dataset.factoryPayment));
}
function renderBusinessStats(){
  const m=businessMetrics(),b=businessData(),taxable=b.orders.filter(o=>o.taxable).length;
  $('#main').innerHTML=`<section class="section first-section"><div class="section-head"><h2>Статистика бизнеса</h2></div><div class="business-stat-hero"><span>Получено от клиентов</span><strong>${businessMoney(m.receivedGross)}</strong><small>Фактические Brutto-поступления по записанным платежам</small></div></section><section class="section"><div class="business-metrics list-surface"><div><span>На карту поступило</span><strong>${businessMoney(m.cardReceived)}</strong></div><div><span>Наличными поступило</span><strong>${businessMoney(m.cashReceived)}</strong></div><div><span>Стоимость заказов Brutto</span><strong>${businessMoney(m.orderValue)}</strong></div><div><span>Клиенты ещё должны</span><strong>${businessMoney(m.outstanding)}</strong></div><div><span>Закупочная стоимость завода</span><strong>${businessMoney(m.factoryCost)}</strong></div><div><span>Налогооблагаемых заказов</span><strong>${taxable}</strong></div><div><span>Резерв НДС</span><strong>${businessMoney(m.vatReserve)}</strong></div><div><span>Свободно на карте</span><strong>${businessMoney(m.freeCard)}</strong></div></div></section>`
}
function renderBusinessMore(){
  const b=businessData(),m=businessMetrics();
  $('#main').innerHTML=`<section class="app-version-card"><div class="app-version-main"><div class="app-version-icon">${uiIcon('sparkles')}</div><div><small>Money App · Business</small><strong>V${APP_VERSION}</strong><span>Заказы · завод · НДС</span></div></div></section><section class="section first-section"><div class="section-head"><h2>Бизнес</h2></div><div class="settings-list list-surface"><button class="list-button" data-business-settings><span class="settings-icon">${uiIcon('wallet')}</span><div class="lb-main"><strong>Настройки бизнеса и НДС</strong><small>${businessTaxationMode()==='ist'?'Ist':'Soll'} · ${businessPeriodMode()==='monthly'?'месяц':'квартал'} · ${businessRate({vatRate:b.settings.defaultVatRate})}%</small></div><span class="arrow">${uiIcon('chevron')}</span></button><button class="list-button" data-business-adjust><span class="settings-icon">${uiIcon('transfer')}</span><div class="lb-main"><strong>Корректировка остатка</strong><small>Сверка фактической карты или наличных</small></div><span class="arrow">${uiIcon('chevron')}</span></button></div></section><section class="section"><div class="business-metrics list-surface"><div><span>Карта</span><strong>${businessMoney(m.card)}</strong></div><div><span>Наличные</span><strong>${businessMoney(m.cash)}</strong></div><div><span>Заводу</span><strong>${businessMoney(m.factoryDebt)}</strong></div><div><span>Резерв НДС</span><strong>${businessMoney(m.vatReserve)}</strong></div><div><span>Свободно на карте</span><strong>${businessMoney(m.freeCard)}</strong></div></div></section><section class="section"><button class="secondary-btn" data-switch-personal>Перейти в личные финансы</button></section>`;
  $('[data-business-settings]')?.addEventListener('click',openBusinessSettings);$('[data-business-adjust]')?.addEventListener('click',openBusinessAdjustmentSheet);$('[data-switch-personal]')?.addEventListener('click',()=>switchWorkspace('personal'));
}
function renderBusiness(){if(activeTab==='overview')renderBusinessOverview();if(activeTab==='transactions')renderBusinessOrders();if(activeTab==='plan')renderBusinessObligations();if(activeTab==='stats')renderBusinessStats();if(activeTab==='more')renderBusinessMore()}
function openBusinessOrderSheet(existing=null){
  const b=businessData(),x=existing||{},locked=existing&&businessOrderTouchesClosedVat(existing.id),defaultRate=Number(x.vatRate??b.settings.defaultVatRate??19),taxable=existing?Boolean(x.taxable):true,vatIncluded=existing?x.vatIncluded!==false:true;
  if(locked){showToast('Этот заказ затрагивает закрытый период НДС · используйте корректировку');return}
  const firstPayment=existing?'':Math.max(0,Number(x.firstPayment)||0);
  openSheet(`<div class="sheet-head"><div><h3>${existing?'Заказ':'Новый заказ'}</h3><p class="sheet-subtitle">Заказ хранится отдельно от фактических платежей клиента.</p></div><button class="sheet-close">×</button></div><form id="businessOrderForm"><div class="field"><label>Название / клиент</label><input name="title" maxlength="80" required value="${esc(x.title||'')}" placeholder="Например: Сауна · Müller"></div><div class="field"><label>Стоимость заказа</label><input name="totalAmount" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${x.totalAmount??''}" placeholder="0,00"><small>Это ${vatIncluded?'Brutto':'Netto'}; фактический денежный поток считается по платежам.</small></div><div class="field"><label>Нужно отдать заводу</label><input name="factoryCost" type="number" inputmode="decimal" min="0" step="0.01" required value="${x.factoryCost??''}" placeholder="0,00"><small>Сумма увеличивает долг заводу независимо от способа оплаты клиента.</small></div><label class="toggle-row"><span><strong>Учитывать в НДС</strong><small>Способ оплаты выбирается отдельно</small></span><input type="checkbox" name="taxable" ${taxable?'checked':''}></label><div class="business-tax-fields"><div class="field"><label>Ставка НДС, %</label><input name="vatRate" type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${defaultRate}"></div><label class="toggle-row compact"><span><strong>Цена включает НДС</strong><small>Brutto: НДС = сумма × ставка / (100 + ставка)</small></span><input type="checkbox" name="vatIncluded" ${vatIncluded?'checked':''}></label></div><div class="field"><label>Дата выполнения / поставки</label><input name="deliveryDate" type="date" value="${x.deliveryDate||''}"><small>Особенно важна при Sollversteuerung. Можно заполнить позже.</small></div>${existing?'':`<div class="form-divider"><span>Первый платёж клиента · необязательно</span></div><div class="field"><label>Сумма первого платежа</label><input name="firstPayment" type="number" inputmode="decimal" min="0" step="0.01" value="${firstPayment||''}" placeholder="0,00"><small>Если цена Netto, здесь тоже вводится Netto; на карту/наличные приложение зачислит Brutto.</small></div><div class="segmented business-method"><label><input type="radio" name="method" value="card" checked><span>Карта</span></label><label><input type="radio" name="method" value="cash"><span>Наличные</span></label></div><div class="field"><label>Дата платежа</label><input name="paymentDate" type="date" max="${todayISO()}" value="${todayISO()}"></div>`}<div class="form-error hidden"></div><button class="primary-btn">${existing?'Сохранить заказ':'Создать заказ'}</button></form>`);
  $('#businessOrderForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),totalAmount=Number(f.get('totalAmount')),factoryCost=Number(f.get('factoryCost')),rate=Number(f.get('vatRate'));if(!(totalAmount>0)||factoryCost<0||rate<0||rate>100){setFormError(e.currentTarget,'Проверьте стоимость заказа, завода и ставку НДС');return}const deliveryDate=String(f.get('deliveryDate')||'');const currentPaid=existing?businessOrderReceivedBasis(x.id):0;if(existing&&totalAmount+0.001<currentPaid){setFormError(e.currentTarget,`Стоимость заказа не может быть меньше уже записанных платежей (${businessMoney(currentPaid)}).`);return}const futureCost=businessCostTotal(existing?x.id:'')+factoryCost;if(businessPaidTotal()>futureCost+.001){setFormError(e.currentTarget,'Нельзя уменьшить общий долг заводу ниже уже оплаченной суммы.');return}const item={id:x.id||uid(),title:String(f.get('title')||'').trim(),totalAmount,factoryCost,taxable:f.get('taxable')==='on',vatRate:Number.isFinite(rate)?rate:19,vatIncluded:f.get('vatIncluded')==='on',deliveryDate,createdAt:x.createdAt||Date.now(),updatedAt:Date.now()};const previewPayments=existing?businessOrderPayments(x.id):[];if([...businessOrderCandidateVatPeriods(item,previewPayments)].some(k=>businessClosedVatKeys().has(k))){setFormError(e.currentTarget,'Изменение затронет уже закрытый период НДС. Используйте корректировку.');return}if(existing){b.orders=b.orders.map(v=>v.id===x.id?item:v)}else{b.orders.push(item);const first=Number(f.get('firstPayment'))||0;if(first>0){if(first>totalAmount+.001){b.orders=b.orders.filter(v=>v.id!==item.id);setFormError(e.currentTarget,'Первый платёж больше стоимости заказа');return}const date=String(f.get('paymentDate')||todayISO());if(date>todayISO()){b.orders=b.orders.filter(v=>v.id!==item.id);setFormError(e.currentTarget,'Фактический платёж не может быть в будущем');return}const firstItem={id:uid(),orderId:item.id,amount:first,method:f.get('method')==='cash'?'cash':'card',date,note:'Первый платёж',createdAt:Date.now()};if([...businessOrderCandidateVatPeriods(item,[firstItem])].some(k=>businessClosedVatKeys().has(k))){b.orders=b.orders.filter(v=>v.id!==item.id);setFormError(e.currentTarget,'Первый платёж или дата исполнения затрагивают закрытый период НДС. Используйте корректировку.');return}b.customerPayments.push(firstItem)}}await persist();closeSheet();render({motion:'refresh'});showToast(existing?'Заказ обновлён':'Заказ создан')}
}
function openBusinessOrderDetail(id){
  const o=businessOrder(id);if(!o)return;const payments=businessOrderPayments(id).sort((a,z)=>(z.date||'').localeCompare(a.date||'')),received=businessOrderReceivedGross(id),total=businessOrderGross(o),remaining=Math.max(0,total-received),vatPeriods=[...businessOrderVatPeriods(id)].map(businessPeriodLabel);
  openSheet(`<div class="sheet-head"><div><h3>${esc(o.title||'Заказ')}</h3><p class="sheet-subtitle">${o.taxable?`НДС ${businessRate(o)}% · ${o.vatIncluded!==false?'Brutto':'Netto'}`:'Не учитывать в НДС'}</p></div><button class="sheet-close">×</button></div><div class="business-detail list-surface"><div><span>Стоимость заказа Brutto</span><strong>${businessMoney(total)}</strong></div><div><span>Получено</span><strong>${businessMoney(received)}</strong></div><div><span>Осталось получить</span><strong>${businessMoney(remaining)}</strong></div><div><span>Заводу</span><strong>${businessMoney(o.factoryCost)}</strong></div>${o.deliveryDate?`<div><span>Выполнение</span><strong>${fmtDate(o.deliveryDate)}</strong></div>`:''}${vatPeriods.length?`<div><span>Периоды НДС</span><strong>${esc(vatPeriods.join(', '))}</strong></div>`:''}</div><div class="section-mini-title">Платежи клиента</div>${payments.length?`<div class="settings-list list-surface">${payments.map(p=>`<button class="list-button" data-customer-payment="${p.id}"><span class="settings-icon">${p.method==='cash'?'💶':'💳'}</span><div class="lb-main"><strong>${businessMoney(businessPaymentGross(p,o))}</strong><small>${fmtDate(p.date)} · ${p.method==='cash'?'наличные':'карта'}${p.note?' · '+esc(p.note):''}</small></div><span class="arrow">${uiIcon('chevron')}</span></button>`).join('')}</div>`:'<div class="empty-inline"><strong>Платежей пока нет</strong><span>Баланс карты или наличных изменится только после записи платежа.</span></div>'}<button class="primary-btn" data-add-customer-payment ${businessOrderRemainingBasis(id)<=.001?'disabled':''}>+ Добавить платёж</button><button class="secondary-btn" data-edit-business-order>Изменить заказ</button><button class="danger-btn" data-delete-business-order>Удалить заказ</button>`);
  $('[data-add-customer-payment]')?.addEventListener('click',()=>openCustomerPaymentSheet(id));$('[data-edit-business-order]')?.addEventListener('click',()=>openBusinessOrderSheet(o));$$('[data-customer-payment]').forEach(el=>el.onclick=()=>openCustomerPaymentDetail(el.dataset.customerPayment));$('[data-delete-business-order]')?.addEventListener('click',async()=>{if(businessOrderTouchesClosedVat(id)){showToast('Нельзя удалить заказ из закрытого периода НДС · используйте корректировку');return}if(businessPaidTotal()>businessCostTotal(id)+.001){showToast('Сначала исправьте оплаты заводу · иначе возникнет переплата');return}if(!confirm('Удалить заказ и все его платежи?'))return;const b=businessData();b.orders=b.orders.filter(v=>v.id!==id);b.customerPayments=b.customerPayments.filter(v=>v.orderId!==id);await persist();closeSheet();render();showToast('Заказ удалён')})
}
function openCustomerPaymentSheet(orderId,existing=null){
  const b=businessData(),o=businessOrder(orderId);if(!o)return;const x=existing||{},remaining=businessOrderRemainingBasis(orderId)+(existing?Math.max(0,Number(existing.amount)||0):0);if(existing&&businessPaymentTouchesClosedVat(existing,o)){showToast('Этот платёж влияет на закрытый период НДС · используйте корректировку');return}
  openSheet(`<div class="sheet-head"><div><h3>${existing?'Платёж клиента':'Новый платёж'}</h3><p class="sheet-subtitle">${esc(o.title||'Заказ')} · осталось ${businessMoney(businessGrossFromBasis(remaining,o))}</p></div><button class="sheet-close">×</button></div><form id="customerPaymentForm"><div class="field"><label>${o.taxable&&o.vatIncluded===false?'Сумма Netto':'Сумма платежа'}</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="${remaining}" required value="${x.amount??''}" placeholder="0,00"></div><div class="segmented business-method"><label><input type="radio" name="method" value="card" ${x.method!=='cash'?'checked':''}><span>Карта</span></label><label><input type="radio" name="method" value="cash" ${x.method==='cash'?'checked':''}><span>Наличные</span></label></div><div class="field"><label>Дата получения</label><input name="date" type="date" max="${todayISO()}" required value="${x.date||todayISO()}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="80" value="${esc(x.note||'')}" placeholder="Предоплата / остаток"></div><div class="form-error hidden"></div><button class="primary-btn">${existing?'Сохранить':'Добавить платёж'}</button></form>`);
  $('#customerPaymentForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount')),date=String(f.get('date')||todayISO());if(!(amount>0)||amount>remaining+.001){setFormError(e.currentTarget,'Платёж должен быть больше нуля и не превышать остаток заказа');return}if(date>todayISO()){setFormError(e.currentTarget,'Фактический платёж не может быть в будущем');return}const candidate={id:x.id||uid(),orderId,amount,method:f.get('method')==='cash'?'cash':'card',date,note:String(f.get('note')||'').trim(),createdAt:x.createdAt||Date.now(),updatedAt:Date.now()};if([...businessPaymentVatPeriods(candidate,o)].some(k=>businessClosedVatKeys().has(k))){setFormError(e.currentTarget,'Этот платёж изменит закрытый период НДС. Используйте корректировку.');return}if(existing)b.customerPayments=b.customerPayments.map(v=>v.id===x.id?candidate:v);else b.customerPayments.push(candidate);await persist();closeSheet();render({motion:'refresh'});showToast(existing?'Платёж обновлён':'Платёж добавлен')}
}
function openCustomerPaymentDetail(id){const b=businessData(),p=b.customerPayments.find(x=>x.id===id),o=p?businessOrder(p.orderId):null;if(!p||!o)return;const vat=o.taxable?businessVatFromGross(businessPaymentGross(p,o),businessRate(o)):0;openSheet(`<div class="sheet-head"><h3>Платёж клиента</h3><button class="sheet-close">×</button></div><div class="business-detail list-surface"><div><span>Заказ</span><strong>${esc(o.title||'Заказ')}</strong></div><div><span>Получено Brutto</span><strong>${businessMoney(businessPaymentGross(p,o))}</strong></div>${o.taxable?`<div><span>НДС в платеже</span><strong>${businessMoney(vat)}</strong></div>`:''}<div><span>Способ</span><strong>${p.method==='cash'?'Наличные':'Карта'}</strong></div><div><span>Дата</span><strong>${fmtDate(p.date)}</strong></div></div><button class="secondary-btn" data-edit-customer-payment>Изменить</button><button class="danger-btn" data-delete-customer-payment>Удалить платёж</button>`);$('[data-edit-customer-payment]')?.addEventListener('click',()=>openCustomerPaymentSheet(o.id,p));$('[data-delete-customer-payment]')?.addEventListener('click',async()=>{if(businessPaymentTouchesClosedVat(p,o)){showToast('Нельзя удалить платёж из закрытого периода НДС · используйте корректировку');return}if(!confirm('Удалить этот платёж клиента?'))return;b.customerPayments=b.customerPayments.filter(v=>v.id!==id);await persist();closeSheet();render();showToast('Платёж удалён')})}
function openFactoryPaymentSheet(){const m=businessMetrics();openSheet(`<div class="sheet-head"><div><h3>Оплата заводу</h3><p class="sheet-subtitle">Оплата всегда списывается только с бизнес-карты.</p></div><button class="sheet-close">×</button></div><div class="business-payment-hint"><span>Долг ${businessMoney(m.factoryDebt)}</span><span>На карте ${businessMoney(m.card)}</span></div><form id="factoryPaymentForm"><div class="field"><label>Сумма</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="${Math.max(0,m.factoryDebt)}" required value="${m.factoryAvailable>0?m.factoryAvailable:''}" placeholder="0,00"></div><div class="field"><label>Дата</label><input name="date" type="date" max="${todayISO()}" required value="${todayISO()}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="80" placeholder="Например: перевод заводу"></div><div class="form-error hidden"></div><button class="primary-btn" ${m.factoryDebt<=0?'disabled':''}>Записать оплату</button></form>`);$('#factoryPaymentForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount')),now=businessMetrics();if(!(amount>0)){setFormError(e.currentTarget,'Введите сумму');return}const date=String(f.get('date')||todayISO());if(date>todayISO()){setFormError(e.currentTarget,'Фактическая оплата не может быть в будущем');return}if(amount>now.factoryDebt+.001){setFormError(e.currentTarget,'Сумма больше текущего долга заводу');return}if(amount>now.card+.001){setFormError(e.currentTarget,'На бизнес-карте недостаточно денег');return}businessData().factoryPayments.push({id:uid(),amount,date,note:String(f.get('note')||'').trim(),createdAt:Date.now()});await persist();closeSheet();render();showToast('Оплата заводу записана')}}
function openFactoryPaymentDetail(id){const x=businessData().factoryPayments.find(v=>v.id===id);if(!x)return;openSheet(`<div class="sheet-head"><h3>Оплата заводу</h3><button class="sheet-close">×</button></div><div class="business-detail list-surface"><div><span>Сумма</span><strong>${businessMoney(x.amount)}</strong></div><div><span>Дата</span><strong>${esc(fmtDate(x.date))}</strong></div>${x.note?`<div><span>Комментарий</span><strong>${esc(x.note)}</strong></div>`:''}</div><button class="danger-btn" data-delete-factory-payment>Удалить оплату</button>`);$('[data-delete-factory-payment]')?.addEventListener('click',async()=>{if(!confirm('Удалить эту оплату? Долг заводу будет восстановлен.'))return;businessData().factoryPayments=businessData().factoryPayments.filter(v=>v.id!==id);await persist();closeSheet();render();showToast('Оплата удалена')})}
function openInputVatSheet(){
  const b=businessData();openSheet(`<div class="sheet-head"><div><h3>Подтверждённая Vorsteuer</h3><p class="sheet-subtitle">Вводите именно сумму Vorsteuer из корректного счёта/Beleg.</p></div><button class="sheet-close">×</button></div><form id="inputVatForm"><div class="field"><label>Сумма Vorsteuer</label><input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="0,00"></div><div class="field"><label>Дата для периода НДС</label><input name="date" type="date" max="${todayISO()}" required value="${todayISO()}"></div><div class="field"><label>Счёт / комментарий</label><input name="note" maxlength="100" required placeholder="Например: Rechnung 2026-104"></div><label class="toggle-row"><span><strong>Rechnung / Beleg проверен</strong><small>Без подтверждения запись не уменьшает ожидаемый платёж</small></span><input type="checkbox" name="confirmed" required></label><div class="form-error hidden"></div><button class="primary-btn">Добавить Vorsteuer</button></form>`);$('#inputVatForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount')),date=String(f.get('date')||todayISO()),key=businessPeriodKey(date);if(!(amount>0)){setFormError(e.currentTarget,'Введите сумму Vorsteuer');return}if(businessClosedVatKeys().has(key)){setFormError(e.currentTarget,'Этот период уже закрыт. Используйте корректировку НДС.');return}if(f.get('confirmed')!=='on'){setFormError(e.currentTarget,'Подтвердите, что Rechnung / Beleg проверен');return}b.inputVat.push({id:uid(),amount,date,note:String(f.get('note')||'').trim(),confirmed:true,createdAt:Date.now()});await persist();closeSheet();render();showToast('Vorsteuer добавлена')}}
function openInputVatDetail(id){const b=businessData(),x=b.inputVat.find(v=>v.id===id);if(!x)return;const key=businessPeriodKey(x.date),closed=businessClosedVatKeys().has(key);openSheet(`<div class="sheet-head"><h3>Vorsteuer</h3><button class="sheet-close">×</button></div><div class="business-detail list-surface"><div><span>Сумма</span><strong>${businessMoney(x.amount)}</strong></div><div><span>Период</span><strong>${esc(businessPeriodLabel(key))}</strong></div><div><span>Дата</span><strong>${fmtDate(x.date)}</strong></div><div><span>Rechnung</span><strong>${esc(x.note||'—')}</strong></div></div>${closed?'<div class="notice">Период закрыт. Историческая Vorsteuer заблокирована.</div>':'<button class="danger-btn" data-delete-input-vat>Удалить Vorsteuer</button>'}`);$('[data-delete-input-vat]')?.addEventListener('click',async()=>{if(!confirm('Удалить запись Vorsteuer?'))return;b.inputVat=b.inputVat.filter(v=>v.id!==id);await persist();closeSheet();render();showToast('Vorsteuer удалена')})}
function openVatPeriodDetail(key){
  const b=businessData(),p=businessVatPeriodMap().get(key)||{key,label:businessPeriodLabel(key),taxableGross:0,outputVat:0,inputVat:0,correction:0,safeReserve:0,net:0,expected:0,closed:false,payment:null},bounds=businessPeriodBounds(key),inputs=b.inputVat.filter(x=>businessPeriodKey(x.date)===key),corr=b.vatCorrections.filter(x=>x.periodKey===key||x.sourcePeriodKey===key),ended=todayISO()>=bounds.endISO;
  openSheet(`<div class="sheet-head"><div><h3>НДС · ${esc(p.label)}</h3><p class="sheet-subtitle">Базовый срок: ${esc(businessPeriodDueText(key))}</p></div><button class="sheet-close">×</button></div><div class="vat-period-hero ${p.closed?'closed':''}"><span>${p.closed?'Период закрыт':'Ожидаемо к оплате Finanzamt'}</span><strong>${businessMoney(p.closed?(p.payment?.amount||0):p.expected)}</strong><small>${p.closed?`Оплачено ${fmtDate(p.payment?.date||'')}`:`Безопасный резерв ${businessMoney(p.safeReserve)}`}</small></div><div class="business-detail list-surface"><div><span>${businessTaxationMode()==='ist'?'Официальные поступления Brutto':'Налоговые события Brutto'}</span><strong>${businessMoney(p.taxableGross)}</strong></div><div><span>Umsatzsteuer</span><strong>${businessMoney(p.outputVat)}</strong></div><div><span>Подтверждённая Vorsteuer</span><strong>${businessMoney(p.inputVat)}</strong></div><div><span>Корректировки</span><strong>${businessMoney(p.correction,true)}</strong></div><div><span>Расчётный итог</span><strong>${businessMoney(p.net)}</strong></div></div>${inputs.length?`<div class="section-mini-title">Vorsteuer</div><div class="settings-list list-surface">${inputs.map(x=>`<button class="list-button" data-input-vat="${x.id}"><span class="settings-icon">🧾</span><div class="lb-main"><strong>${businessMoney(x.amount)}</strong><small>${fmtDate(x.date)} · ${esc(x.note||'')}</small></div><span class="arrow">${uiIcon('chevron')}</span></button>`).join('')}</div>`:''}${corr.length?`<div class="section-mini-title">Корректировки</div><div class="settings-list list-surface">${corr.map(x=>`<div class="list-button static"><span class="settings-icon">±</span><div class="lb-main"><strong>${businessMoney(x.amount,true)}</strong><small>${fmtDate(x.date)} · ${esc(x.note||'Корректировка')}</small></div></div>`).join('')}</div>`:''}${p.closed?'<button class="secondary-btn" data-vat-correction>+ Корректировка после закрытия</button>':`<button class="primary-btn" data-close-vat ${ended?'':'disabled'}>${p.expected>0?'НДС оплачен':'Закрыть период'}</button>${!ended?'<div class="notice">Период ещё не закончился, поэтому его нельзя закрыть.</div>':''}`}<div class="notice subtle">Money App ведёт управленческий резерв. Период, ставка и налоговый режим должны соответствовать вашим данным Finanzamt.</div>`);
  $$('[data-input-vat]').forEach(el=>el.onclick=()=>openInputVatDetail(el.dataset.inputVat));$('[data-close-vat]')?.addEventListener('click',()=>openVatPaymentSheet(key));$('[data-vat-correction]')?.addEventListener('click',()=>openVatCorrectionSheet(key));
}
function openVatPaymentSheet(key){
  const p=businessVatPeriodMap().get(key);if(!p||p.closed){showToast('Период уже закрыт');return}const bounds=businessPeriodBounds(key);if(todayISO()<bounds.endISO){showToast('Период ещё не закончился');return}const m=businessMetrics();
  openSheet(`<div class="sheet-head"><div><h3>${p.expected>0?'НДС оплачен':'Закрыть период'}</h3><p class="sheet-subtitle">${esc(p.label)} · списание только с карты</p></div><button class="sheet-close">×</button></div><form id="vatPaymentForm"><div class="business-payment-hint"><span>Ожидается ${businessMoney(p.expected)}</span><span>На карте ${businessMoney(m.card)}</span></div><div class="field"><label>Фактически оплачено Finanzamt</label><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required value="${Number(p.expected.toFixed(2))}"></div><div class="field"><label>Дата оплаты / закрытия</label><input name="date" type="date" max="${todayISO()}" required value="${todayISO()}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="100" placeholder="Voranmeldung / платёж"></div><div class="form-error hidden"></div><button class="primary-btn">Закрыть ${esc(p.label)}</button></form>`);$('#vatPaymentForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount')),date=String(f.get('date')||todayISO()),now=businessMetrics();if(amount<0||!Number.isFinite(amount)){setFormError(e.currentTarget,'Проверьте сумму');return}if(amount>now.card+.001){setFormError(e.currentTarget,'На бизнес-карте недостаточно денег для этой оплаты');return}if(Math.abs(amount-p.expected)>.011){setFormError(e.currentTarget,`Фактическая оплата должна совпадать с расчётом ${businessMoney(p.expected)}. Если Finanzamt требует другую сумму, сначала внесите корректировку НДС.`);return}businessData().vatPayments.push({id:uid(),periodKey:key,amount,date,note:String(f.get('note')||'').trim(),expectedAtClose:p.expected,outputVatAtClose:p.outputVat,inputVatAtClose:p.inputVat,closed:true,createdAt:Date.now()});await persist();closeSheet();render();showToast('Период НДС закрыт')}}
function openVatCorrectionSheet(sourceKey){
  const b=businessData(),targetKey=businessPeriodKey(todayISO());openSheet(`<div class="sheet-head"><div><h3>Корректировка НДС</h3><p class="sheet-subtitle">История ${esc(businessPeriodLabel(sourceKey))} не переписывается. Корректировка попадёт в текущий открытый период.</p></div><button class="sheet-close">×</button></div><form id="vatCorrectionForm"><div class="field"><label>Изменение НДС</label><input name="amount" type="number" inputmode="decimal" step="0.01" required placeholder="Например: 120 или -50"><small>Плюс увеличивает обязательство, минус уменьшает расчётный итог.</small></div><div class="field"><label>Причина</label><input name="note" maxlength="120" required placeholder="Причина корректировки"></div><div class="form-error hidden"></div><button class="primary-btn">Записать корректировку</button></form>`);$('#vatCorrectionForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount'));if(!amount||!Number.isFinite(amount)){setFormError(e.currentTarget,'Введите ненулевую сумму');return}if(businessClosedVatKeys().has(targetKey)){setFormError(e.currentTarget,'Текущий период уже закрыт. Сначала проверьте настройки периода НДС.');return}b.vatCorrections.push({id:uid(),sourcePeriodKey:sourceKey,periodKey:targetKey,amount,date:todayISO(),note:String(f.get('note')||'').trim(),createdAt:Date.now()});await persist();closeSheet();render();showToast('Корректировка записана')}}
function openBusinessSettings(){
  const b=businessData(),lockedTaxConfig=b.vatPayments.length>0||b.inputVat.length>0||b.vatCorrections.length>0||businessVatEvents().some(e=>e.date<=todayISO());
  openSheet(`<div class="sheet-head"><div><h3>Настройки бизнеса</h3><p class="sheet-subtitle">Налоговый режим задавайте только по данным вашего Finanzamt / Steuerberater.</p></div><button class="sheet-close">×</button></div><form id="businessSettingsForm"><div class="field"><label>Название</label><input name="name" maxlength="40" value="${esc(b.settings.name||'Бизнес')}"></div><div class="field"><label>Стартовый остаток карты</label><input name="cardOpening" type="number" inputmode="decimal" step="0.01" value="${Number(b.settings.cardOpening)||0}"></div><div class="field"><label>Стартовые наличные</label><input name="cashOpening" type="number" inputmode="decimal" step="0.01" value="${Number(b.settings.cashOpening)||0}"></div><div class="form-divider"><span>НДС</span></div><div class="field"><label>Налоговый режим</label><select name="taxationMode" ${lockedTaxConfig?'disabled':''}><option value="ist" ${businessTaxationMode()==='ist'?'selected':''}>Istversteuerung</option><option value="soll" ${businessTaxationMode()==='soll'?'selected':''}>Sollversteuerung</option></select><small>${lockedTaxConfig?'Заблокировано после появления налоговых данных.':'Ist: по поступлениям. Soll: по исполнению с учётом предоплат.'}</small></div><div class="field"><label>Период Voranmeldung</label><select name="vatPeriod" ${lockedTaxConfig?'disabled':''}><option value="quarterly" ${businessPeriodMode()==='quarterly'?'selected':''}>Квартал</option><option value="monthly" ${businessPeriodMode()==='monthly'?'selected':''}>Месяц</option></select></div><div class="field"><label>Ставка по умолчанию, %</label><input name="defaultVatRate" type="number" inputmode="decimal" min="0" max="100" step="0.01" value="${Number(b.settings.defaultVatRate)||19}"></div><div class="notice subtle">Старые продажи из V8 автоматически перенесены как заказы без НДС, чтобы приложение не создало налоговый долг задним числом без вашего подтверждения.</div><button class="primary-btn">Сохранить</button></form>`);$('#businessSettingsForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),rate=Number(f.get('defaultVatRate'));if(rate<0||rate>100){setFormError(e.currentTarget,'Проверьте ставку НДС');return}b.settings.name=String(f.get('name')||'Бизнес').trim()||'Бизнес';b.settings.cardOpening=Number(f.get('cardOpening'))||0;b.settings.cashOpening=Number(f.get('cashOpening'))||0;b.settings.defaultVatRate=rate;if(!lockedTaxConfig){b.settings.taxationMode=f.get('taxationMode')==='soll'?'soll':'ist';b.settings.vatPeriod=f.get('vatPeriod')==='monthly'?'monthly':'quarterly'}await persist();closeSheet();updateWorkspaceChrome();render();showToast('Настройки сохранены')}}
function openBusinessAdjustmentSheet(){openSheet(`<div class="sheet-head"><div><h3>Корректировка остатка</h3><p class="sheet-subtitle">Используйте только для сверки с фактическими деньгами.</p></div><button class="sheet-close">×</button></div><form id="businessAdjustmentForm"><div class="field"><label>Счёт</label><select name="account"><option value="card">Карта</option><option value="cash">Наличные</option></select></div><div class="field"><label>Изменение</label><input name="amount" type="number" inputmode="decimal" step="0.01" required placeholder="Например: -20 или 50"></div><div class="field"><label>Причина</label><input name="note" maxlength="80" required placeholder="Сверка остатка"></div><button class="primary-btn">Применить</button></form>`);$('#businessAdjustmentForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount'));if(!amount)return;businessData().adjustments.push({id:uid(),account:f.get('account')==='cash'?'cash':'card',amount,note:String(f.get('note')||'').trim(),date:todayISO(),createdAt:Date.now()});await persist();closeSheet();render();showToast('Остаток скорректирован')}}

function render({motion='refresh',direction=0}={}){
  applyUISettings();
  updateWorkspaceChrome();
  chartRegistry.clear();
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===activeTab));
  updateNavGlider();
  const business=currentWorkspace()==='business';
  const title=(business?{overview:'Обзор',transactions:'Заказы',plan:'Обязательства',stats:'Статистика',more:'Ещё'}:{overview:'Обзор',transactions:'Операции',plan:'План',stats:'Статистика',more:'Ещё'})[activeTab]; setPageTitle(title); if(motion!=='none')animatePageChrome();
  if(business){renderBusiness();requestAnimationFrame(()=>{enhanceRenderedUI();if(motion!=='none')animateMainSurface(motion,direction)});return}
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
    <div class="timeline-main"><div class="timeline-title">${esc(title)} ${badge}</div><div class="timeline-sub">${esc(a?.name||'Без счёта')}${p.frequency!=='once'?` · ${frequencyLabel(p.frequency)}`:''}</div></div>
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
  const safety=safeCashflowForecast();
  const free=safety.available;
  const monthPlan=monthRemainingSummary();
  const monthEnd=monthPlan.projected;
  const timeline=primaryUpcomingPlans().slice(0,Math.max(3,Math.min(8,Number(state.settings.upcomingCount)||5)));
  const budgets=budgetSnapshot().slice(0,3);
  const budgetPace=budgetPaceSnapshot();
  const goals=state.goals.slice(0,2);
  const forecast=forecastSeries(6);
  const runway=financialRunway();
  const comparison=monthComparison();
  const savingsRate=m.income?m.net/m.income*100:null;
  const noData=state.transactions.length===0 && state.accounts.every(a=>Number(a.openingBalance||0)===0);
  const attention=attentionItems();
  const nextIncome=nextIncomeStatus();
  const focus=state.settings.dashboardMode==='focus';
  const adaptive=state.settings.adaptiveHome!==false;
  $('#main').innerHTML=`
    <section class="capital-hero">
      <div class="capital-label">Общий капитал <button class="inline-info" data-explain="capital" aria-label="Как считается капитал">${uiIcon('info')}</button></div>
      <div class="capital-value">${fmtMajor(total)}</div>
      <div class="capital-meta">
        <div><span>Безопасно доступно <button class="inline-info" data-explain="free" aria-label="Как считается безопасно доступная сумма">${uiIcon('info')}</button></span><strong class="${safety.deficit>0?'negative':'positive'}">${fmtMajor(free)}</strong></div>
        <div><span>Зарезервировано <button class="inline-info" data-explain="reserve" aria-label="Как считается резерв">${uiIcon('info')}</button></span><strong>${fmtMajor(reserved)}</strong></div>
      </div>
      <div class="capital-footnote">${safety.deficit>0?`По плану к ${fmtDate(toISODate(safety.lowestDate))} не хватает ${fmtMajor(safety.deficit)} до заданной финансовой подушки.`:`Прогноз на ${safety.days} дн.: минимальный доступный остаток ${fmtMajor(safety.minSpendable)}${safety.rows.length?` · ${fmtDate(toISODate(safety.lowestDate))}`:''}.`}</div>
    </section>

    ${adaptive&&attention.length?`<button class="attention-card ${attention.some(x=>x.level==='danger')?'danger':''}" data-action="open-inbox"><span class="attention-icon">${uiIcon('info')}</span><div><small>Требует внимания</small><strong>${attention[0].title}</strong><span>${attention.length>1?`И ещё ${attention.length-1}`:attention[0].sub}</span></div><b>${attention.length}</b>${uiIcon('chevron')}</button>`:''}

    <section class="month-outlook clean-surface">
      <div class="month-outlook-main"><small>По плану к концу месяца <button class="inline-info" data-explain="month" aria-label="Как считается прогноз">${uiIcon('info')}</button></small><strong class="${monthEnd>=total?'positive':'negative'}">${fmtMajor(monthEnd)}</strong></div>
      <div class="month-outlook-flow"><span class="positive">+${fmtMajor(monthPlan.income)}</span><span>−${fmtMajor(monthPlan.expense)}</span></div>
      <button data-tab-link="plan" class="circle-link" aria-label="Открыть план">${uiIcon('chevron')}</button>
    </section>

    ${nextIncome?`<div class="daily-guide ${nextIncome.shortage>0?'warning':''}"><span>${uiIcon('calendar')}</span><div><small>До следующего дохода · ${nextIncome.days} дн.</small><strong>${fmtMajor(nextIncome.amount)} · ${esc(nextIncome.title)}</strong>${nextIncome.required>0?`<em>До него обязательных платежей: ${fmtMajor(nextIncome.required)}</em>`:''}${nextIncome.shortage>0?`<em class="negative">Не хватает ${fmtMajor(nextIncome.shortage)}</em>`:''}</div><button data-explain="nextIncome" aria-label="Подробнее">${uiIcon('info')}</button></div>`:''}

    ${budgetPace?`<button class="budget-pace-card ${budgetPace.remaining<0?'over':budgetPace.paceRatio>1.2?'warning':''}" data-tab-link="plan"><span class="budget-pace-icon">${uiIcon('chart')}</span><div><small>Темп бюджетов · ${budgetPace.rows.length} катег.</small><strong>${budgetPace.remaining>=0?`Осталось ${fmtMajor(budgetPace.remaining)}`:`Перерасход ${fmtMajor(Math.abs(budgetPace.remaining))}`}</strong><em>${budgetPace.remaining>=0?`По установленным лимитам ≈ ${fmtMajor(budgetPace.dailyRemaining)} / день на ${budgetPace.daysLeft} дн.`:`Лимиты месяца уже превышены.`}</em></div>${uiIcon('chevron')}</button>`:''}

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
      <p class="subtle-copy">${comparison.expenseDelta===null?'Сравнение появится после данных за предыдущий месяц.':`Расходы ${comparison.expenseDelta>0?'выше':'ниже'} ${comparison.label} на ${Math.abs(Math.round(comparison.expenseDelta))}%. Норма накопления: ${savingsRate===null?'—':`${Math.round(savingsRate)}%`}.`}</p>
    </section>

    ${budgets.length?`<section class="section"><div class="section-head"><h2>Бюджеты</h2><button data-tab-link="plan">Все</button></div><div class="budget-overview-list">${budgets.map(budgetOverviewRow).join('')}</div></section>`:''}

    ${goals.length?`<section class="section"><div class="section-head"><h2>Цели</h2><button data-tab-link="plan">Все</button></div><div class="goal-overview-list">${goals.map(goalOverviewRow).join('')}</div></section>`:''}`:''}

    <section class="section">
      <div class="section-head"><h2>Прогноз капитала</h2><button data-tab-link="plan">Сценарии</button></div>
      <div class="chart-surface"><div class="chart">${svgLine(forecast.series,{interactive:true})}</div><div class="chart-footer"><span>Через 6 месяцев <b>${fmtMajor(forecast.series.at(-1).value)}</b></span><span>Без доходов <b>${runway===null?'—':`${runway.toFixed(1)} мес.`}</b> <button class="inline-info" data-explain="runway" aria-label="Как считается запас">${uiIcon('info')}</button></span></div></div>
    </section>`;
  bindCommonActions();
  bindInteractiveCharts();
}

function accountTypeName(type){ return ({card:'Банковская карта',bank:'Банковский счёт',cash:'Наличные',savings:'Накопительный счёт',credit:'Кредитная карта',other:'Другой счёт'})[type]||'Счёт'; }
function txRow(t){
  const a=account(t.accountId), c=category(t.categoryId), to=account(t.toAccountId);
  const icon=t.type==='transfer'?uiIcon('transfer'):(c?.icon||(t.type==='income'?'＋':'−'));
  const title=t.isAdjustment?'Корректировка баланса':t.type==='transfer'?`${a?.name||'Счёт'} → ${to?.name||'Счёт'}`:(c?.name||'Без категории');
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
  const hay=[t.merchant,t.note,category(t.categoryId)?.name,account(t.accountId)?.name,account(t.toAccountId)?.name,String(t.amount||''),t.isAdjustment?'корректировка':t.type==='expense'?'расход':t.type==='income'?'доход':'перевод'].filter(Boolean).join(' ').toLowerCase();
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
    <div class="detail-hero"><small>${t.isAdjustment?'Корректировка':t.type==='expense'?'Расход':t.type==='income'?'Доход':'Перевод'}</small><strong class="${t.type==='income'?'positive':''}">${t.type==='transfer'?fmt(t.amount):fmt(signed,true)}</strong><span>${esc(fmtDate(t.date))}</span></div>
    <div class="detail-list">${t.type==='transfer'?`<div><span>Откуда</span><strong>${esc(a?.name||'—')}</strong></div><div><span>Куда</span><strong>${esc(to?.name||'—')}</strong></div>`:`<div><span>Категория</span><strong>${esc(c?.icon||'')} ${esc(c?.name||'Без категории')}</strong></div><div><span>Счёт</span><strong>${esc(a?.name||'—')}</strong></div>`}${t.merchant?`<div><span>Получатель</span><strong>${esc(t.merchant)}</strong></div>`:''}${t.note?`<div><span>Комментарий</span><strong>${esc(t.note)}</strong></div>`:''}${t.needsReview?'<div><span>Статус</span><strong class="warn-text">Нужно уточнить</strong></div>':''}</div>
    <div class="detail-actions ${!t.isAdjustment&&t.type!=='transfer'?'three':''}">${t.isAdjustment?'':`<button class="secondary-btn" id="detailRepeat">Повторить</button>`}${!t.isAdjustment&&t.type!=='transfer'?'<button class="secondary-btn" id="detailToPlan">В план</button>':''}<button class="primary-btn" id="detailEdit">Изменить</button></div><button class="danger-btn" id="detailDelete">Удалить</button>`);
  $('#detailEdit').onclick=()=>t.isAdjustment?openAdjustmentTransactionSheet(t):openTransactionSheet(t,t.type);
  const repeat=$('#detailRepeat');if(repeat)repeat.onclick=()=>openTransactionSheet(null,t.type,t);
  const toPlan=$('#detailToPlan');if(toPlan)toPlan.onclick=()=>{const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);openPlanSheet(null,toISODate(tomorrow),{type:t.type,title:t.merchant||c?.name||'',amount:t.amount,categoryId:t.categoryId,accountId:t.accountId,frequency:'once',required:false})};
  $('#detailDelete').onclick=()=>{closeSheet();deleteTransactionWithUndo(t)};
}
function openAdjustmentTransactionSheet(t){
  if(!t?.isAdjustment)return openTransactionSheet(t,t?.type||'expense');
  const delta=t.type==='income'?Number(t.amount||0):-Number(t.amount||0);
  const a=account(t.accountId);
  openSheet(`<div class="sheet-head"><div><h3>Изменить корректировку</h3><p class="sheet-subtitle">Корректировка влияет на баланс, но не входит в статистику доходов и расходов.</p></div><button class="sheet-close" aria-label="Закрыть">×</button></div>
    <form id="adjustmentTxForm"><div class="field"><label>Счёт</label><input value="${esc(a?.name||'Счёт недоступен')}" disabled></div><div class="field"><label>Изменение баланса</label><input name="delta" type="number" inputmode="decimal" step="0.01" required value="${esc(delta)}"><small>Плюс увеличивает остаток, минус уменьшает.</small></div><div class="field"><label>Дата</label><input name="date" type="date" max="${todayISO()}" required value="${esc(t.date||todayISO())}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="100" value="${esc(t.note||'Корректировка после сверки баланса')}"></div><div class="form-error hidden" role="alert"></div><button class="primary-btn" type="submit">Сохранить</button></form>`);
  $('#adjustmentTxForm').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form);setFormError(form,'');
    const value=Number(fd.get('delta')),date=String(fd.get('date')||todayISO());
    if(!Number.isFinite(value)||Math.abs(value)<.005){setFormError(form,'Введите ненулевую корректировку.');return}
    if(date>todayISO()){setFormError(form,'Фактическая корректировка не может быть в будущем.');return}
    if(!account(t.accountId)){setFormError(form,'Счёт этой корректировки больше не существует. Проверьте целостность данных.');return}
    const type=value>0?'income':'expense';
    const fallbackCategory=type==='income'?(category('inc-other')?.id||state.categories.find(c=>c.type==='income')?.id):(category('exp-other')?.id||state.categories.find(c=>c.type==='expense')?.id);
    if(!fallbackCategory){setFormError(form,'Нет подходящей категории для корректировки.');return}
    const previous=structuredClone(state);
    const updated={...t,type,amount:Math.abs(value),date,categoryId:fallbackCategory,toAccountId:null,merchant:'',note:String(fd.get('note')||'').trim()||'Корректировка после сверки баланса',isAdjustment:true};
    state.transactions=state.transactions.map(x=>x.id===t.id?updated:x);
    try{await persist();closeSheet();render({motion:'refresh'});showToast('Корректировка обновлена')}catch(_){state=previous;render({motion:'none'});showToast('Не удалось сохранить корректировку')}
  };
}

function openAccountDetail(a){
  if(!a)return;
  const bal=accountBalance(a.id);const txs=state.transactions.filter(t=>t.accountId===a.id||t.toAccountId===a.id);
  openSheet(`<div class="sheet-head"><h3>${esc(a.name)}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><span class="detail-glyph">${accountGlyph(a.type)}</span><strong>${fmtMajor(bal)}</strong><span>${esc(accountTypeName(a.type))}${a.protected?' · защищённый':''}</span></div><div class="detail-list"><div><span>Операций</span><strong>${txs.length}</strong></div><div><span>Начальный остаток</span><strong>${fmt(a.openingBalance||0)}</strong></div><div><span>Последняя сверка</span><strong>${a.lastReconciledAt?fmtDate(toISODate(new Date(a.lastReconciledAt))):'никогда'}</strong></div></div><div class="detail-actions"><button class="secondary-btn" id="accountReconcile">Сверить баланс</button><button class="primary-btn" id="accountEdit">Настроить</button></div>`);
  $('#accountEdit').onclick=()=>openAccountSheet(a);
  $('#accountReconcile').onclick=()=>openReconcileSheet(a);
}
function openReconcileSheet(a){
  const current=accountBalance(a.id);
  openSheet(`<div class="sheet-head"><h3>Сверить баланс</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><form id="reconcileForm"><div class="field"><label>В приложении</label><input value="${esc(current.toFixed(2))}" disabled></div><div class="field"><label>Реальный баланс</label><input id="realBalance" name="real" type="number" step="0.01" inputmode="decimal" value="${esc(current.toFixed(2))}" required></div><div class="reconcile-preview" id="reconcilePreview">Разницы нет.</div><button class="primary-btn" type="submit">Сверить</button></form>`);
  const input=$('#realBalance'),preview=$('#reconcilePreview');
  const update=()=>{const real=Number(input.value);const diff=real-current;preview.textContent=Math.abs(diff)<.005?'Разницы нет.':`Корректировка: ${fmt(diff,true)}`;preview.className=`reconcile-preview ${diff<0?'negative':diff>0?'positive':''}`};input.oninput=update;update();
  $('#reconcileForm').onsubmit=async e=>{e.preventDefault();const real=Number(new FormData(e.currentTarget).get('real'));if(!Number.isFinite(real))return;const diff=real-current;const previous=structuredClone(state);state.accounts=state.accounts.map(x=>x.id===a.id?{...x,lastReconciledAt:Date.now()}:x);if(Math.abs(diff)>=.005)state.transactions.push({id:uid(),type:diff>0?'income':'expense',amount:Math.abs(diff),date:todayISO(),accountId:a.id,toAccountId:null,categoryId:diff>0?(category('inc-other')?.id||state.categories.find(c=>c.type==='income')?.id):(category('exp-other')?.id||state.categories.find(c=>c.type==='expense')?.id),note:'Корректировка после сверки баланса',isAdjustment:true,createdAt:Date.now()});try{await persist();closeSheet();render({motion:'refresh'});if(Math.abs(diff)<.005)showToast('Баланс совпадает · счёт сверён');else showToast(`Баланс скорректирован на ${fmt(diff,true)}`,'Отменить',async()=>{state=previous;await persist();render({motion:'refresh'})})}catch(_){state=previous;render({motion:'none'});showToast('Не удалось сохранить сверку')}};
}
function openPlanDetail(p){
  if(!p)return;
  const c=planCategory(p),next=nextOccurrence(p,new Date());
  openSheet(`<div class="sheet-head"><h3>${esc(p.title||c?.name||'План')}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="detail-hero"><small>${p.type==='income'?'Плановый доход':'Плановый расход'}</small><strong class="${p.type==='income'?'positive':''}">${fmt(p.type==='income'?Number(p.amount):-Number(p.amount),true)}</strong><span>${next?`Следующее: ${esc(fmtDate(toISODate(next)))}`:'Нет будущих событий'}</span></div><div class="detail-list"><div><span>Повтор</span><strong>${esc(frequencyLabel(p.frequency))}</strong></div><div><span>Счёт</span><strong>${esc(account(p.accountId)?.name||'—')}</strong></div>${p.type==='expense'?`<div><span>Обязательный</span><strong>${p.required?'Да':'Нет'}</strong></div>`:''}</div><button class="primary-btn" id="planEdit">Изменить план</button>`);
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
  if(window.matchMedia('(pointer: fine)').matches)setTimeout(()=>{try{$('#quickCaptureAmount')?.focus({preventScroll:true})}catch(_){}},motionMs(160));
}

function renderTransactions(){
  let txs=[...state.transactions].sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0));
  if(txFilter!=='all') txs=txs.filter(t=>!t.isAdjustment&&t.type===txFilter);
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
  const repeat=p.frequency==='once'?'один раз':`${frequencyLabel(p.frequency)}${p.endDate?` · до ${fmtDate(p.endDate)}`:' · без окончания'}`;
  const onceDone=p.frequency==='once'&&isOccurrenceCompleted(p.id,planStart(p));
  const when=onceDone?'проведено':d?fmtDate(toISODate(d)):(p.frequency!=='once'&&p.endDate?'завершено':fmtDate(p.date));
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
  const monthFact=monthTotals();
  const monthName=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date());
  const monthNameCap=monthName.charAt(0).toUpperCase()+monthName.slice(1);
  const deficitRows=forecast.series.slice(1).map((r,index)=>({...r,index:index+1,net:(Number(r.income)||0)-(Number(r.expense)||0),shortfall:Math.max(0,(Number(r.expense)||0)-(Number(r.income)||0))})).filter(r=>r.shortfall>.005);
  const analysis=planAlgorithmAnalysis(forecast,health);
  return `<div class="chart plan-chart">${svgLine(forecast.series,{interactive:true,height:'large'})}</div>
    <div class="grid-3 plan-kpis">
      <div class="kpi"><small>Капитал через ${planForecastRange} мес.</small><strong class="${final>=start?'positive':'negative'}">${fmtMajor(final)}</strong><span class="kpi-note">прогноз на выбранный период</span></div>
      <div class="kpi"><small>Минимум за ${planForecastRange} мес.</small><strong class="${health.min>=0?'positive':'negative'}">${fmtMajor(health.min)}</strong><span class="kpi-note">самая низкая точка прогноза</span></div>
      <div class="kpi"><small>Изменение за ${planForecastRange} мес.</small><strong class="${change>=0?'positive':'negative'}">${fmtMajor(change,true)}</strong><span class="kpi-note">${fmtMajor(start)} → ${fmtMajor(final)}</span></div>
    </div>
    <div class="plan-fact-block">
      <div class="plan-fact-head"><div><small>Фактически в этом месяце</small><strong>${esc(monthNameCap)}</strong></div><span>по проведённым операциям</span></div>
      <div class="plan-fact-grid">
        <div class="plan-fact-item">
          <small>Изменение накоплений</small>
          <strong class="${monthFact.net>=0?'positive':'negative'}">${fmtMajor(monthFact.net,true)}</strong>
          <span>доходы ${fmtMajor(monthFact.income)} − расходы ${fmtMajor(monthFact.expense)}</span>
        </div>
        <div class="plan-fact-item">
          <small>Ушло за месяц</small>
          <strong class="${monthFact.expense>0?'negative':''}">${fmtMajor(monthFact.expense)}</strong>
          <span>фактические расходы за ${esc(monthName)}</span>
        </div>
      </div>
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
function calendarMonthHTML(cursor=calendarCursor){
  const y=cursor.getFullYear(),m=cursor.getMonth();
  const first=new Date(y,m,1,12),days=lastDayOfMonth(y,m),offset=(first.getDay()+6)%7;
  const start=new Date(y,m,1,0),end=endOfMonth(first);
  const events=planOccurrencesBetween(start,end,{includeCompleted:true});
  const txs=state.transactions.filter(t=>(t.date||'').slice(0,7)===monthKey(first));
  const cells=[];
  for(let i=0;i<offset;i++)cells.push('<div class="cal-day empty"></div>');
  for(let day=1;day<=days;day++){
    const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const pe=events.filter(x=>toISODate(x.date)===iso), at=txs.filter(t=>t.date===iso);
    const income=pe.filter(x=>x.p.type==='income'&&!x.completed).reduce((s,x)=>s+Number(x.p.amount||0),0)+at.filter(t=>isAnalyticalTransaction(t)&&t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expense=pe.filter(x=>x.p.type==='expense'&&!x.completed).reduce((s,x)=>s+Number(x.p.amount||0),0)+at.filter(t=>isAnalyticalTransaction(t)&&t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
    const has=pe.length||at.length; const today=iso===todayISO();
    cells.push(`<button class="cal-day ${has?'has-events':''} ${today?'today':''}" data-calendar-day="${iso}"><span>${day}</span>${has?`<i>${income>0?'<b class="inc"></b>':''}${expense>0?'<b class="exp"></b>':''}</i><small>${expense>0?`−${compactMoney(expense)}`:income>0?`+${compactMoney(income)}`:''}</small>`:''}</button>`);
  }
  const label=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(first);
  return `<div class="finance-calendar"><div class="calendar-nav"><button data-calendar-shift="-1">‹</button><strong>${esc(label)}</strong><button data-calendar-shift="1">›</button></div><div class="calendar-weekdays">${['пн','вт','ср','чт','пт','сб','вс'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div></div>`;
}
function openCalendarDay(iso){
  const d=parseISO(iso),start=new Date(d);start.setHours(0,0,0,0);const end=new Date(d);end.setHours(23,59,59,999);
  const plans=planOccurrencesBetween(start,end,{includeCompleted:true}); const txs=state.transactions.filter(t=>t.date===iso);
  openSheet(`<div class="sheet-head"><h3>${esc(fmtDate(iso))}</h3><button class="sheet-close">×</button></div>${plans.length?`<div class="section-mini-title">План</div><div class="timeline list-surface">${plans.map(eventRow).join('')}</div>`:''}${txs.length?`<div class="section-mini-title">Факт</div><div class="tx-list list-surface">${txs.map(txRow).join('')}</div>`:''}${!plans.length&&!txs.length?'<div class="empty-inline"><strong>Событий нет</strong><span>На этот день ничего не запланировано и не записано.</span></div>':''}<button class="primary-btn" data-day-add-plan>Добавить план на этот день</button>`);
  $$('[data-complete-plan]').forEach(b=>b.onclick=e=>{e.stopPropagation();completePlannedOccurrence(b.dataset.completePlan,b.dataset.completeDate)});
  $$('[data-tx]').forEach(b=>b.onclick=()=>openTransactionDetail(state.transactions.find(t=>t.id===b.dataset.tx)));
  $('[data-day-add-plan]')?.addEventListener('click',()=>openPlanSheet(null,iso));
}
function openSaveScenarioSheet(){
  openSheet(`<div class="sheet-head"><h3>Сохранить сценарий</h3><button class="sheet-close">×</button></div><form id="scenarioSave"><div class="field"><label>Название</label><input name="name" required maxlength="40" placeholder="Например: Переезд"></div><div class="notice">Сохранится только What-if сценарий. Реальные операции и план не изменятся.</div><button class="primary-btn">Сохранить</button></form>`);
  $('#scenarioSave').onsubmit=async e=>{e.preventDefault();const name=String(new FormData(e.currentTarget).get('name')||'').trim();if(!name)return;state.scenarios.push({id:uid(),name,scenario:{...planScenario}});await persist();closeSheet();render();showToast('Сценарий сохранён')};
}
function openScenarioManager(){
  openSheet(`<div class="sheet-head"><h3>Сценарии</h3><button class="sheet-close">×</button></div>${state.scenarios.length?`<div class="scenario-manager">${state.scenarios.map(x=>`<div><button data-apply-scenario="${x.id}"><strong>${esc(x.name)}</strong><small>Доход +${fmtMajor(x.scenario.extraIncome||0)} · расход +${fmtMajor(x.scenario.extraExpense||0)}</small></button><button class="scenario-delete" data-delete-scenario="${x.id}">×</button></div>`).join('')}</div>`:'<div class="empty-inline"><strong>Сценариев пока нет</strong><span>Настройте «Что если?» и сохраните вариант.</span></div>'}`);
  $$('[data-apply-scenario]').forEach(b=>b.onclick=()=>{const x=state.scenarios.find(s=>s.id===b.dataset.applyScenario);if(!x)return;planScenario={...x.scenario};closeSheet();activeTab='plan';render();showToast(`Сценарий «${x.name}» применён`)});
  $$('[data-delete-scenario]').forEach(b=>b.onclick=async()=>{state.scenarios=state.scenarios.filter(x=>x.id!==b.dataset.deleteScenario);await persist();openScenarioManager()});
}

function renderPlanCalendarBindings(){
  $$(`[data-calendar-day]`).forEach(b=>b.onclick=()=>openCalendarDay(b.dataset.calendarDay));
  $$(`[data-calendar-shift]`).forEach(b=>b.onclick=()=>{calendarCursor=addMonths(calendarCursor,Number(b.dataset.calendarShift));const box=$('#calendarDynamic');if(box){box.innerHTML=calendarMonthHTML();renderPlanCalendarBindings()}});
}
function renderPlan(){
  chartRegistry.clear();
  const nextMonth=addMonths(new Date(),1);
  const nextIncomeBase=forecastBaseForMonth('income',nextMonth);
  const nextExpenseBase=forecastBaseForMonth('expense',nextMonth);
  const recurringIncome=nextIncomeBase.amount;
  const recurringExpense=nextExpenseBase.amount;
  const due=monthRemainingSummary();
  const timeline=primaryUpcomingPlans();
  const budgets=budgetSnapshot();
  $('#main').innerHTML=`
    <section class="forecast-panel">
      <div class="section-head"><h2>Прогноз капитала</h2><span class="badge" id="forecastRangeLabel">${planForecastRange} мес.</span></div>
      <div class="forecast-range-tabs">${[3,6,12,18].map(n=>`<button data-forecast-range="${n}" class="${planForecastRange===n?'active':''}">${n} мес.</button>`).join('')}</div>
      <div id="forecastDynamic">${planForecastHTML()}</div>
      <div class="forecast-method"><span>Доходы: <b>${esc(nextIncomeBase.mode.toLowerCase())}</b></span><span>Расходы: <b>${esc(nextExpenseBase.mode.toLowerCase())}</b></span></div>
      <div class="chart-hint">Зажми линию и веди пальцем по месяцам. Маркеры показывают месяцы с запланированными событиями.</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Финансовый календарь</h2><span class="badge">план + факт</span></div>
      <div id="calendarDynamic">${calendarMonthHTML()}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Ближайшие события</h2><button class="round-section-action" data-action="all-events" aria-label="Показать события на 30 дней">＋</button></div>
      ${timeline.length?`<div class="timeline list-surface">${timeline.map(eventRow).join('')}</div>`:`<div class="empty-inline"><strong>Нет событий в основном окне</strong><span>${new Date().getDate()>=20?'Показывается остаток текущего и весь следующий месяц.':'Показывается остаток текущего месяца.'}</span></div>`}<p class="subtle-copy event-window-note">${new Date().getDate()>=20?'С 20-го числа здесь показывается остаток текущего месяца и весь следующий.':'Здесь показываются события до конца текущего месяца.'} Нажмите +, чтобы увидеть ближайшие 30 дней.</p>
    </section>

    <section class="section">
      <div class="section-head"><h2>Что если?</h2><div class="section-actions"><button id="saveScenario">Сохранить</button><button id="resetScenario">Сбросить</button></div></div>${state.scenarios.length?`<div class="saved-scenarios">${state.scenarios.slice(-4).map(x=>`<button data-scenario="${x.id}">${esc(x.name)}</button>`).join('')}<button data-action="manage-scenarios">•••</button></div>`:''}
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
      <div class="section-head"><h2>Бюджеты категорий</h2><div class="section-actions"><button data-action="suggest-budgets">Подобрать</button><button data-action="add-budget">Добавить</button></div></div>
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
  $$('[data-calendar-shift]').forEach(b=>b.onclick=()=>{calendarCursor=addMonths(calendarCursor,Number(b.dataset.calendarShift));$('#calendarDynamic').innerHTML=calendarMonthHTML();renderPlanCalendarBindings()});
  renderPlanCalendarBindings();
  const saveScenario=$('#saveScenario');if(saveScenario)saveScenario.onclick=openSaveScenarioSheet;
  $$('[data-scenario]').forEach(b=>b.onclick=()=>{const x=state.scenarios.find(s=>s.id===b.dataset.scenario);if(!x)return;planScenario={...x.scenario};render()});
  $$('[data-action="manage-scenarios"]').forEach(b=>b.onclick=openScenarioManager);
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
  const savingsRate=m.income?m.net/m.income*100:null;
  const avgExpenseInfo=actualAverageInfo('expense');
  const avgIncomeInfo=actualAverageInfo('income');
  const avgExpense=avgExpenseInfo.monthly;
  const avgIncome=avgIncomeInfo.monthly;
  const topCat=cats[0];
  const budgets=budgetSnapshot();
  const overBudgets=budgets.filter(b=>b.ratio>1);
  const runway=financialRunway();
  $('#main').innerHTML=`
    <div class="pill-tabs stats-period">${[3,6,9,12].map(n=>`<button data-range="${n}" class="${statsRange===n?'active':''}">${n} мес.</button>`).join('')}</div>

    <section class="stats-hero">
      <div><small>Расходы месяца</small><strong>${fmtMajor(m.expense)}</strong><span>${comparison.expenseDelta===null?'нет сравнения':`${comparison.expenseDelta>0?'+':''}${Math.round(comparison.expenseDelta)}% ${comparison.label}`}</span></div>
      <div><small>Норма накопления <button class="inline-info" data-explain="savings" aria-label="Как считается savings rate">${uiIcon('info')}</button></small><strong class="${savingsRate===null?'':savingsRate>=0?'positive':'negative'}">${savingsRate===null?'—':`${Math.round(savingsRate)}%`}</strong><span>${fmtMajor(m.net,true)} за месяц</span></div>
    </section>

    <section class="section"><div class="section-head"><h2>Доходы и расходы</h2><span class="badge">cash flow</span></div><div class="chart-surface"><div class="chart">${svgBars(monthly)}</div><div class="chart-legend"><span><i class="legend-income"></i>Доходы</span><span><i class="legend-expense"></i>Расходы</span></div></div></section>
    <section class="section"><div class="section-head"><h2>Капитал</h2><span class="badge">динамика</span></div><div class="chart-surface"><div class="chart">${svgLine(capital,{interactive:true})}</div></div></section>
    <section class="section"><div class="section-head"><h2>Куда уходят деньги</h2><span class="badge">месяц</span></div><div class="donut-surface">${donutHTML(cats)}</div></section>
    <section class="section"><div class="section-head"><h2>Наблюдения</h2><span class="badge">локальный анализ</span></div><div class="insight-list">${financialInsights().map(x=>`<div class="insight-card ${x.tone}"><strong>${esc(x.title)}</strong><span>${esc(x.sub)}</span></div>`).join('')}</div></section>

    <section class="section"><div class="section-head"><h2>Показатели</h2></div><div class="insight-list list-surface">
      <div class="insight-row"><span>Средний расход · ${avgExpenseInfo.denominatorDays||'—'} дн.</span><strong>${fmtMajor(avgExpense)}</strong></div>
      <div class="insight-row"><span>Средний доход · ${avgIncomeInfo.denominatorDays||'—'} дн.</span><strong>${fmtMajor(avgIncome)}</strong></div>
      <div class="insight-row"><span>Запас без новых доходов</span><strong>${runway===null?'—':`${runway.toFixed(1)} мес.`}</strong></div>
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
    <div class="definition-list list-surface"><div class="definition-row"><strong>Безопасно доступно</strong><span>Моделирует явный план на выбранный горизонт и показывает, сколько можно изъять сегодня, не опуская прогноз ниже финансовой подушки. Защищённые счета не считаются доступными.</span></div><div class="definition-row"><strong>Прогноз</strong><span>Месячный прогноз может использовать регулярный план и осторожный средний факт. Но «Безопасно доступно» использует только явные плановые доходы и расходы — исторический доход не считается гарантированным.</span></div><div class="definition-row"><strong>Плановые операции</strong><span>Никогда не становятся фактическими автоматически. Проведение всегда подтверждается вручную.</span></div></div>
    <button class="secondary-btn" id="advancedIntegrity">Проверить целостность данных</button>`);
  $('#advancedIntegrity').onclick=()=>runIntegrityCheck();
}
function runIntegrityCheck(){
  const issues=[];
  const add=(msg)=>issues.push(msg);
  const duplicateIds=(rows,label)=>{const seen=new Set();rows.forEach(x=>{if(!x?.id)add(`${label}: запись без ID`);else if(seen.has(x.id))add(`${label}: повторяющийся ID`);else seen.add(x.id)})};
  duplicateIds(state.accounts,'Счета');duplicateIds(state.categories,'Категории');duplicateIds(state.transactions,'Операции');duplicateIds(state.plans,'Планы');duplicateIds(state.budgets,'Бюджеты');duplicateIds(state.goals,'Цели');
  const accountIds=new Set(state.accounts.map(a=>a.id)),catIds=new Set(state.categories.map(c=>c.id)),planIds=new Set(state.plans.map(p=>p.id)),txIds=new Set(state.transactions.map(t=>t.id));
  state.transactions.forEach(t=>{
    if(!['income','expense','transfer'].includes(t.type))add('Операция с неизвестным типом');
    if(!(Number(t.amount)>0))add('Операция с некорректной суммой');
    if(!t.accountId||!accountIds.has(t.accountId))add('Операция с удалённым или отсутствующим счётом');
    if(t.type!=='transfer'){
      const c=category(t.categoryId);if(!c)add('Операция без корректной категории');else if(c.type!==t.type)add('Категория операции не соответствует её типу');
    }
    if(t.type==='transfer'){
      if(!t.toAccountId||!accountIds.has(t.toAccountId))add('Перевод без корректного счёта назначения');
      if(t.accountId===t.toAccountId)add('Перевод на тот же счёт');
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date||''))add('Операция с некорректной датой');
    else if(t.date>todayISO())add('Фактическая операция датирована будущим');
  });
  state.plans.forEach(p=>{
    if(!['income','expense'].includes(p.type))add('План с неизвестным типом');
    if(!(Number(p.amount)>0))add('План с некорректной суммой');
    if(!p.accountId||!accountIds.has(p.accountId))add('План с удалённым или отсутствующим счётом');
    const c=category(p.categoryId);if(!c)add('План без корректной категории');else if(c.type!==p.type)add('Категория плана не соответствует его типу');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))add('План с некорректной датой');
    if(p.endDate&&p.date&&p.endDate<p.date)add('План с окончанием раньше начала');
  });
  state.planCompletions.forEach(x=>{if(!planIds.has(x.planId))add('Проведение ссылается на удалённый план');if(x.transactionId&&!txIds.has(x.transactionId))add('Проведение ссылается на удалённую операцию')});
  state.budgets.forEach(b=>{const c=category(b.categoryId);if(!c)add('Бюджет с удалённой категорией');else if(c.type!=='expense')add('Бюджет привязан не к категории расходов');if(Number(b.limit)<0)add('Бюджет с отрицательным лимитом')});
  state.goals.forEach(g=>{if(Number(g.target)<0||Number(g.saved)<0)add('Цель с отрицательной суммой')});
  const b=businessData();duplicateIds(b.orders,'Заказы бизнеса');duplicateIds(b.customerPayments,'Платежи клиентов');duplicateIds(b.factoryPayments,'Оплаты заводу');duplicateIds(b.inputVat,'Vorsteuer');duplicateIds(b.vatPayments,'Оплаты НДС');duplicateIds(b.vatCorrections,'Корректировки НДС');duplicateIds(b.adjustments,'Корректировки бизнеса');
  b.orders.forEach(x=>{if(!(Number(x.totalAmount)>0)||Number(x.factoryCost)<0)add('Бизнес-заказ с некорректной суммой');if(x.taxable&&(Number(x.vatRate)<0||Number(x.vatRate)>100))add('Заказ с некорректной ставкой НДС')});
  b.customerPayments.forEach(x=>{const o=businessOrder(x.orderId);if(!o)add('Платёж клиента без существующего заказа');if(!(Number(x.amount)>0))add('Платёж клиента с некорректной суммой');if(!['card','cash'].includes(x.method))add('Платёж клиента с неизвестным способом оплаты');if((x.date||'')>todayISO())add('Платёж клиента датирован будущим')});
  b.orders.forEach(o=>{if(businessOrderReceivedBasis(o.id)>Number(o.totalAmount||0)+.001)add(`Платежи превышают стоимость заказа: ${o.title||'без названия'}`)});
  b.factoryPayments.forEach(x=>{if(!(Number(x.amount)>0))add('Оплата заводу с некорректной суммой');if((x.date||'')>todayISO())add('Оплата заводу датирована будущим')});
  b.inputVat.forEach(x=>{if(!(Number(x.amount)>0))add('Vorsteuer с некорректной суммой');if((x.date||'')>todayISO())add('Vorsteuer датирована будущим')});
  b.vatPayments.forEach(x=>{if(Number(x.amount)<0||!x.periodKey)add('Некорректная оплата НДС');if((x.date||'')>todayISO())add('Оплата НДС датирована будущим')});
  b.vatCorrections.forEach(x=>{if(!Number(x.amount)||!x.periodKey)add('Некорректная корректировка НДС')});
  b.adjustments.forEach(x=>{if(!['card','cash'].includes(x.account)||!Number.isFinite(Number(x.amount)))add('Некорректная корректировка бизнеса')});
  if(businessPaidTotal()>businessCostTotal()+.001)add('Оплачено заводу больше общей закупочной стоимости');
  const unique=[...new Set(issues)];
  if(!unique.length){showToast('Данные выглядят целостными');return}
  openSheet(`<div class="sheet-head"><div><h3>Проверка данных</h3><p class="sheet-subtitle">Найдено проблем: ${unique.length}</p></div><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="integrity-list list-surface">${unique.slice(0,40).map(x=>`<div class="integrity-row"><span>${uiIcon('info')}</span><strong>${esc(x)}</strong></div>`).join('')}</div>${unique.length>40?`<div class="notice">Показаны первые 40 типов проблем.</div>`:''}<button class="primary-btn sheet-close" type="button">Понятно</button>`);
}

function openMonthCloseSheet(){
  const m=monthTotals(),cmp=monthComparison(),cats=expenseByCategory(),sr=m.income?m.net/m.income*100:null;
  const title=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date());
  openSheet(`<div class="sheet-head"><h3>Итоги месяца</h3><button class="sheet-close" aria-label="Закрыть">×</button></div><div class="month-close"><div class="month-close-title">${esc(title)}</div><div class="month-close-grid"><div><small>Доходы</small><strong class="positive">${fmtMajor(m.income)}</strong></div><div><small>Расходы</small><strong>${fmtMajor(m.expense)}</strong></div><div><small>Результат</small><strong class="${m.net>=0?'positive':'negative'}">${fmtMajor(m.net,true)}</strong></div><div><small>Норма накопления</small><strong>${sr===null?'—':`${Math.round(sr)}%`}</strong></div></div>${cats[0]?`<p>Больше всего расходов: <b>${esc(cats[0].icon)} ${esc(cats[0].name)} · ${fmtMajor(cats[0].value)}</b>.</p>`:''}${cmp.expenseDelta!==null?`<p>Расходы ${cmp.expenseDelta>0?'выше':'ниже'} ${cmp.label} на <b>${Math.abs(Math.round(cmp.expenseDelta))}%</b>.</p>`:''}</div><button class="primary-btn sheet-close">Готово</button>`);
}


async function forceAppUpdate(button=null){
  if(button){
    button.disabled=true;
    button.classList.add('checking');
    const label=button.querySelector('[data-update-label]');
    if(label) label.textContent='Проверяю…';
  }

  const restore=(text='Проверить и обновить')=>{
    if(!button)return;
    button.disabled=false;
    button.classList.remove('checking');
    const label=button.querySelector('[data-update-label]');
    if(label) label.textContent=text;
  };

  try{
    if(!navigator.onLine){
      restore('Нет подключения');
      showToast('Для проверки обновления нужен интернет');
      return;
    }

    // version.json is deliberately requested outside the app-shell cache.
    const res=await fetch(`./version.json?t=${Date.now()}`,{
      cache:'no-store',
      headers:{'Cache-Control':'no-cache'}
    });
    if(!res.ok) throw new Error('version check failed');
    const remote=await res.json();
    const latest=String(remote.version||'').trim();

    if(!latest) throw new Error('invalid version');

    if(latest===APP_VERSION){
      const reg=await navigator.serviceWorker?.getRegistration();
      if(reg) await reg.update().catch(()=>{});
      restore('Уже актуально');
      showToast(`Установлена последняя версия V${APP_VERSION}`);
      setTimeout(()=>restore(),1700);
      return;
    }

    if(button){
      const label=button.querySelector('[data-update-label]');
      if(label) label.textContent=`Обновляю до V${latest}…`;
    }

    // For an explicit user-requested update we prefer freshness over keeping
    // an old app-shell cache. IndexedDB financial data is NOT touched.
    const reg=await navigator.serviceWorker?.getRegistration();
    if(reg){
      try{await reg.update()}catch(_){}
      try{await reg.unregister()}catch(_){}
    }

    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(
        keys
          .filter(key=>key.startsWith('money-pwa-'))
          .map(key=>caches.delete(key))
      );
    }

    // Bust Safari's document cache as well. The next page registers the new SW.
    const url=new URL('./',location.href);
    url.searchParams.set('update',latest);
    url.searchParams.set('_',Date.now().toString());
    location.replace(url.href);
  }catch(err){
    console.error('Update check failed',err);
    restore('Повторить проверку');
    showToast('Не удалось проверить обновление');
  }
}

function renderMore(){
  const protectedCount=state.accounts.filter(a=>a.protected).length;
  const backupText=state.settings.lastBackupAt?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(state.settings.lastBackupAt)):'ещё не создавалась';
  const rows=(items)=>`<div class="settings-list list-surface">${items.join('')}</div>`;
  const row=(icon,title,sub,action,badge='')=>`<button class="list-button" data-action="${action}"><span class="settings-icon">${uiIcon(icon)}</span><div class="lb-main"><strong>${title}</strong><small>${sub}</small></div>${badge?`<span class="settings-badge">${badge}</span>`:''}<span class="arrow">${uiIcon('chevron')}</span></button>`;
  const att=attentionItems();
  $('#main').innerHTML=`
    <section class="app-version-card">
      <div class="app-version-main">
        <div class="app-version-icon">${uiIcon('sparkles')}</div>
        <div>
          <small>Money App</small>
          <strong>V${APP_VERSION}</strong>
          <span>Текущая установленная версия</span>
        </div>
      </div>
      <button class="app-update-btn" type="button" data-action="force-update">
        ${uiIcon('download')}
        <span data-update-label>Проверить и обновить</span>
      </button>
    </section>
    <section class="section first-section"><div class="section-head"><h2>Основные</h2></div>${rows([
      row('wallet','Счета и кошельки',`${state.accounts.length} счетов · ${protectedCount} защищённых`,'manage-accounts'),
      row('tag','Категории','Доходы и расходы','manage-categories'),
      row('shield','Финансовая подушка',`${fmtMajor(explicitReserve())} · горизонт ${safetyHorizonDays()} дн.`,'reserve'),
      row('info','Требует внимания',att.length?'Есть пункты для проверки':'Всё в порядке','open-inbox',att.length?String(att.length):'')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Интерфейс</h2></div>${rows([
      row('chart','Внешний вид и плавность',`${motionProfile().label} · ${state.settings.interfaceDensity==='compact'?'компактно':'стандартно'}`,'appearance'),
      row('calendar','Итоги текущего месяца','Короткая сводка без лишних графиков','month-close'),
      row('sparkles','Сохранённые сценарии',`${state.scenarios.length} вариантов What-if`,'manage-scenarios')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Данные</h2></div>${rows([
      row('upload','Резервная копия',`Последняя: ${backupText}`,'export-json'),
      row('download','Восстановить копию','Импорт JSON','import-json'),
      row('file','Экспорт операций','CSV для Excel / Numbers','export-csv')
    ])}</section>

    <section class="section"><div class="section-head"><h2>Расширенные</h2></div>${rows([
      row('info','Логика расчётов','Прогноз, безопасная сумма и проверка данных','advanced-settings')
    ])}</section>

    <details class="tech-details section"><summary>Диагностика</summary><div class="diagnostics list-surface">
      <div><span>Версия приложения</span><strong>${APP_VERSION}</strong></div>
      <div><span>Версия данных</span><strong>${state.version??11}</strong></div>
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
  const actualDate=(dateISO&&dateISO<=todayISO())?dateISO:todayISO();
  state.transactions.push({id:transactionId,type:p.type,amount:Number(p.amount)||0,date:actualDate,accountId:p.accountId||state.accounts[0]?.id,toAccountId:null,categoryId:p.categoryId||null,note:`По плану: ${p.title||planCategory(p)?.name||'операция'}`,createdAt:Date.now()});
  state.planCompletions.push({planId,date:dateISO,transactionId,completedAt:Date.now()});
  state.settings.lastAccountByType={...(state.settings.lastAccountByType||{}),[p.type]:p.accountId||state.accounts[0]?.id};
  if(p.categoryId)state.settings.lastCategoryByType={...(state.settings.lastCategoryByType||{}),[p.type]:p.categoryId};
  const sheetWasOpen=!$('#sheet')?.classList.contains('hidden');
  if(sheetWasOpen)closeSheet();
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
  $$('[data-action="suggest-budgets"]').forEach(b=>b.onclick=openBudgetSuggestions);
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
  $$('[data-action="manage-scenarios"]').forEach(b=>b.onclick=openScenarioManager);
  $$('[data-action="all-events"]').forEach(b=>b.onclick=openUpcomingEventsSheet);
  const reserve=$('[data-action="reserve"]'); if(reserve)reserve.onclick=openReserveSheet;
  const exj=$('[data-action="export-json"]'); if(exj)exj.onclick=exportJSON;
  const imj=$('[data-action="import-json"]'); if(imj)imj.onclick=()=>$('#importInput').click();
  const exc=$('[data-action="export-csv"]'); if(exc)exc.onclick=exportCSV;
  const clear=$('[data-action="clear-data"]'); if(clear)clear.onclick=clearAllData;
  const forceUpdate=$('[data-action="force-update"]'); if(forceUpdate)forceUpdate.onclick=()=>forceAppUpdate(forceUpdate);
}

function iosRubberBand(distance,dimension=320,constant=.55){
  const sign=distance<0?-1:1;
  const d=Math.abs(Number(distance)||0);
  const dim=Math.max(120,Number(dimension)||320);
  return sign*((d*dim*constant)/(dim+constant*d));
}

function sheetDragDistance(distance){
  const d=Math.max(0,Number(distance)||0);
  if(d<=110)return d*.94;
  return 103.4+iosRubberBand(d-110,360,.34);
}

function cancelMotion(animation){
  if(!animation)return;
  try{animation.cancel()}catch(_){}
}

function installSheetPhysics(sheet,backdrop){
  if(sheetMotionCleanup){sheetMotionCleanup();sheetMotionCleanup=null}

  const scroller=$('.sheet-content',sheet);
  const app=$('#app');
  if(!scroller)return;

  let startX=0,startY=0,lastY=0,lastT=0,lastVelocity=0;
  let mode='';
  let modeStartY=0;
  let offset=0;
  let tracking=false;
  let ignored=false;
  let axisLock='';
  let startedAtTop=false;
  let settleAnimation=null;
  let settleTimer=null;

  const ignoreTarget=target=>target instanceof Element && Boolean(target.closest(
    'input,textarea,select,[contenteditable="true"],input[type="range"],.interactive-chart,.chart-shell,.filter-row,.forecast-range-tabs,.pill-tabs,.saved-scenarios'
  ));

  const maxScroll=()=>Math.max(0,scroller.scrollHeight-scroller.clientHeight);
  const atTop=()=>scroller.scrollTop<=.75;
  const atBottom=()=>scroller.scrollTop>=maxScroll()-.75;
  const scrollable=()=>maxScroll()>1.5;

  const stopSettle=()=>{
    cancelMotion(settleAnimation);settleAnimation=null;
    if(settleTimer){clearTimeout(settleTimer);settleTimer=null}
  };

  const clearInline=()=>{
    stopSettle();
    sheet.style.removeProperty('--sheet-gesture-y');
    sheet.style.removeProperty('--sheet-runtime-duration');
    sheet.style.removeProperty('--sheet-runtime-ease');
    scroller.style.transform='';
    scroller.style.transformOrigin='';
    scroller.style.willChange='';
    backdrop.style.opacity='';
    if(app){
      app.style.removeProperty('--app-sheet-scale');
      app.style.removeProperty('--app-sheet-opacity');
    }
    sheet.classList.remove('sheet-gesture-active','sheet-rubber-active');
    scroller.classList.remove('sheet-content-rubber');
    document.body.classList.remove('sheet-gesture-active');
  };

  const activate=(nextMode,y,previousY)=>{
    mode=nextMode;
    // If the finger reaches an edge during an already-running scroll, start
    // the elastic distance from the previous frame. This prevents a jump.
    modeStartY=previousY ?? y;
    offset=0;
    sheet.classList.add('sheet-gesture-active');
    document.body.classList.add('sheet-gesture-active');
    if(nextMode.startsWith('rubber')){
      sheet.classList.add('sheet-rubber-active');
      scroller.classList.add('sheet-content-rubber');
      scroller.style.willChange='transform';
    }
  };

  const springScrollerBack=current=>{
    stopSettle();
    if(Math.abs(current)<.5){clearInline();return}
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduce?1:motionMs(560);
    const opposite=current<0?Math.min(4.5,Math.abs(current)*.09):-Math.min(4.5,Math.abs(current)*.09);
    scroller.style.transform='';
    settleAnimation=scroller.animate([
      {transform:`translate3d(0,${current}px,0)`,offset:0,easing:'cubic-bezier(.18,.70,.16,1)'},
      {transform:`translate3d(0,${opposite}px,0)`,offset:.76,easing:'cubic-bezier(.24,.62,.24,1)'},
      {transform:'translate3d(0,0,0)',offset:1}
    ],{duration,fill:'both'});
    settleAnimation.onfinish=clearInline;
    settleAnimation.oncancel=()=>{};
  };

  const springSheetBack=current=>{
    stopSettle();
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduce?1:motionMs(545);
    sheet.style.setProperty('--sheet-runtime-duration',`${duration}ms`);
    sheet.style.setProperty('--sheet-runtime-ease','cubic-bezier(.18,.72,.16,1)');
    requestAnimationFrame(()=>{
      sheet.style.setProperty('--sheet-gesture-y','0px');
      backdrop.style.opacity='1';
      if(app){
        app.style.setProperty('--app-sheet-scale','.988');
        app.style.setProperty('--app-sheet-opacity','.93');
      }
    });
    settleTimer=setTimeout(clearInline,duration+42);
  };

  const onTouchStart=e=>{
    if(e.touches.length!==1)return;
    stopSettle();
    const touch=e.touches[0];
    startX=touch.clientX;
    startY=lastY=touch.clientY;
    lastT=performance.now();
    lastVelocity=0;offset=0;mode='';axisLock='';tracking=true;
    ignored=ignoreTarget(e.target);
    startedAtTop=atTop();
  };

  const onTouchMove=e=>{
    if(!tracking||ignored||e.touches.length!==1)return;
    const touch=e.touches[0];
    const y=touch.clientY;
    const now=performance.now();
    const totalDx=touch.clientX-startX;
    const totalDy=y-startY;
    const frameDy=y-lastY;
    const frameDt=Math.max(1,now-lastT);
    const velocity=frameDy/frameDt;
    lastVelocity=lastVelocity*.68+velocity*.32;
    const previousY=lastY;
    lastY=y;lastT=now;

    if(!mode){
      if(Math.hypot(totalDx,totalDy)<5)return;
      if(!axisLock)axisLock=Math.abs(totalDx)>Math.abs(totalDy)*1.12?'x':'y';
      // Once a gesture is classified as horizontal it stays horizontal.
      if(axisLock==='x')return;

      if(atTop() && totalDy>0){
        activate('sheet-down',y,startedAtTop?startY:previousY);
      }else if(atBottom() && frameDy<0){
        activate('rubber-bottom',y,previousY);
      }else if(!scrollable() && totalDy<0){
        activate('rubber-up',y,startY);
      }else{
        // Native momentum scrolling continues until a real edge is reached.
        return;
      }
    }

    const edgeDy=y-modeStartY;

    if(mode==='sheet-down'){
      if(edgeDy<0){
        offset=0;
        sheet.style.setProperty('--sheet-gesture-y','0px');
        return;
      }
      e.preventDefault();
      offset=sheetDragDistance(edgeDy);
      const progress=Math.min(1,offset/330);
      sheet.style.setProperty('--sheet-gesture-y',`${offset}px`);
      backdrop.style.opacity=String(Math.max(.14,1-progress*.86));
      if(app){
        app.style.setProperty('--app-sheet-scale',String(.988+progress*.012));
        app.style.setProperty('--app-sheet-opacity',String(.93+progress*.07));
      }
      return;
    }

    if(mode==='rubber-up'){
      if(edgeDy>0){offset=0;sheet.style.setProperty('--sheet-gesture-y','0px');return}
      e.preventDefault();
      offset=iosRubberBand(edgeDy,260,.44);
      sheet.style.setProperty('--sheet-gesture-y',`${offset}px`);
      backdrop.style.opacity=String(Math.max(.90,1-Math.abs(offset)/300));
      return;
    }

    if(mode==='rubber-bottom'){
      if(edgeDy>0){
        offset=0;
        scroller.style.transform='translate3d(0,0,0)';
        return;
      }
      e.preventDefault();
      offset=iosRubberBand(edgeDy,300,.55);
      scroller.style.transformOrigin='center bottom';
      scroller.style.transform=`translate3d(0,${offset}px,0)`;
      return;
    }
  };

  const finish=cancelled=>{
    if(!tracking)return;
    tracking=false;
    if(ignored){ignored=false;return}
    const currentMode=mode;
    mode='';
    if(!currentMode){return}

    if(currentMode==='sheet-down'){
      const fastFlick=lastVelocity>.78;
      const farEnough=offset>112;
      if(!cancelled&&(fastFlick||farEnough)){
        closeSheet({gestureVelocity:lastVelocity,gestureOffset:offset});
      }else springSheetBack(offset);
      return;
    }

    if(currentMode==='rubber-up'){
      springSheetBack(offset);
      return;
    }

    springScrollerBack(offset);
  };

  const onTouchEnd=()=>finish(false);
  const onTouchCancel=()=>finish(true);

  sheet.addEventListener('touchstart',onTouchStart,{passive:true});
  sheet.addEventListener('touchmove',onTouchMove,{passive:false});
  sheet.addEventListener('touchend',onTouchEnd,{passive:true});
  sheet.addEventListener('touchcancel',onTouchCancel,{passive:true});

  const handle=$('.sheet-handle',sheet);
  if(handle){
    handle.addEventListener('pointerdown',()=>sheet.classList.add('sheet-handle-active'),{passive:true});
    ['pointerup','pointercancel','pointerleave'].forEach(name=>handle.addEventListener(name,()=>sheet.classList.remove('sheet-handle-active'),{passive:true}));
  }

  sheetMotionCleanup=(preserveVisual=false)=>{
    stopSettle();
    sheet.removeEventListener('touchstart',onTouchStart);
    sheet.removeEventListener('touchmove',onTouchMove);
    sheet.removeEventListener('touchend',onTouchEnd);
    sheet.removeEventListener('touchcancel',onTouchCancel);
    if(!preserveVisual)clearInline();
  };
}

function openSheet(html){
  const sheet=$('#sheet'), backdrop=$('#sheetBackdrop');
  const wasOpen=!sheet.classList.contains('hidden');
  const previousFocus=wasOpen&&sheet._previousFocus?sheet._previousFocus:document.activeElement;

  // Replacing one sheet with another must be atomic. A closing timer from the
  // previous surface is never allowed to hide the new one.
  if(sheetCloseTimer){clearTimeout(sheetCloseTimer);sheetCloseTimer=null}
  if(sheetMotionCleanup){sheetMotionCleanup();sheetMotionCleanup=null}

  sheet._previousFocus=previousFocus;
  sheet.style.removeProperty('--sheet-gesture-y');
  sheet.style.removeProperty('--sheet-runtime-duration');
  sheet.style.removeProperty('--sheet-runtime-ease');
  backdrop.style.opacity='';
  sheet.innerHTML=`<div class="sheet-handle" aria-hidden="true"><span></span></div><div class="sheet-content">${html}</div>`;
  const sheetScroller=$('.sheet-content',sheet);
  if(sheetScroller)sheetScroller.scrollTop=0;
  sheet.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  document.body.classList.add('sheet-open');

  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    sheet.classList.add('sheet-visible');
    backdrop.classList.add('sheet-visible');
    installPressFeedback(sheet);
    installSheetPhysics(sheet,backdrop);
    animateSheetContent(sheet);
  }));

  $$('.sheet-close',sheet).forEach(b=>b.onclick=closeSheet);

  // Let the sheet finish its entrance before the iOS keyboard changes the
  // visual viewport. This removes a common PWA "jump" on quick-entry forms.
  setTimeout(()=>{
    if(sheet.classList.contains('hidden'))return;
    const auto=sheet.querySelector('.quick-amount input, input[autofocus]');
    if(auto && window.matchMedia('(pointer: fine)').matches) {
      try{auto.focus({preventScroll:true})}catch(_){auto.focus()}
    }
  },motionMs(635));
}

function closeSheet(options={}){
  const sheet=$('#sheet'), backdrop=$('#sheetBackdrop');
  if(sheet.classList.contains('hidden')) return;
  const previousFocus=sheet._previousFocus;
  const gestureOffset=Math.max(0,Number(options?.gestureOffset)||0);
  const velocity=Math.max(0,Number(options?.gestureVelocity)||0);

  if(sheetCloseTimer){clearTimeout(sheetCloseTimer);sheetCloseTimer=null}
  if(sheetMotionCleanup){
    // During an interactive dismissal keep the current visual position until
    // the exit transition takes over; otherwise clean gesture state now.
    sheetMotionCleanup(gestureOffset>0);sheetMotionCleanup=null;
  }

  const remaining=Math.max(120,window.innerHeight-gestureOffset);
  const velocityDuration=velocity>0?remaining/Math.max(.88,velocity):430;
  const duration=motionMs(Math.max(290,Math.min(470,velocityDuration)));
  sheet.style.setProperty('--sheet-runtime-duration',`${duration}ms`);
  sheet.style.setProperty('--sheet-runtime-ease','cubic-bezier(.24,.66,.12,1)');

  // Commit the finger position before switching the CSS variable back to the
  // off-screen state. This keeps a flick perfectly continuous.
  void sheet.offsetHeight;
  document.body.classList.remove('sheet-gesture-active');
  sheet.classList.remove('sheet-gesture-active','sheet-visible');
  backdrop.classList.remove('sheet-visible');
  document.body.classList.remove('sheet-open');
  backdrop.style.opacity='0';

  sheetCloseTimer=setTimeout(()=>{
    sheet.classList.add('hidden');
    backdrop.classList.add('hidden');
    sheet.style.removeProperty('--sheet-gesture-y');
    sheet.style.removeProperty('--sheet-runtime-duration');
    sheet.style.removeProperty('--sheet-runtime-ease');
    backdrop.style.opacity='';
    sheet.innerHTML='';
    sheetCloseTimer=null;
    if(previousFocus && previousFocus.focus) try{previousFocus.focus({preventScroll:true})}catch(_){}
  },duration+24);
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
function revealChoiceInScroller(el){
  if(!el)return;
  const rail=el.closest('[data-horizontal-scroller]');
  if(!rail)return;
  const rr=rail.getBoundingClientRect(),er=el.getBoundingClientRect();
  const max=Math.max(0,rail.scrollWidth-rail.clientWidth);
  const delta=(er.left+er.width/2)-(rr.left+rr.width/2);
  rail.scrollLeft=Math.max(0,Math.min(max,rail.scrollLeft+delta));
}

function openTransactionSheet(existing=null,initialType='expense',template=null){
  if(!state.accounts.length){showToast('Сначала добавьте хотя бы один счёт');openAccountsManager();return}
  const requestedType=existing?.type||template?.type||initialType;
  if(requestedType==='transfer'&&state.accounts.length<2){showToast('Для перевода нужны как минимум два счёта');openAccountsManager();return}
  let type=requestedType;
  const source={...(template||{}),...(existing||{})};
  let draft={...source,date:source.date||todayISO()};
  const categoryByType={
    expense:category(source.categoryId)?.type==='expense'?source.categoryId:state.settings.lastCategoryByType?.expense,
    income:category(source.categoryId)?.type==='income'?source.categoryId:state.settings.lastCategoryByType?.income
  };
  const accountByType={
    expense:source.type==='expense'?source.accountId:state.settings.lastAccountByType?.expense,
    income:source.type==='income'?source.accountId:state.settings.lastAccountByType?.income,
    transfer:source.type==='transfer'?source.accountId:state.settings.lastAccountByType?.transfer
  };

  const captureDraft=()=>{
    const form=$('#txForm');if(!form)return;
    const fd=new FormData(form);
    draft={...draft,
      amount:fd.get('amount')??draft.amount??'',
      date:String(fd.get('date')||draft.date||todayISO()),
      merchant:String(fd.get('merchant')??draft.merchant??''),
      note:String(fd.get('note')??draft.note??''),
      toAccountId:String(fd.get('toAccountId')||draft.toAccountId||'')
    };
    const accountId=String(fd.get('accountId')||'');
    if(accountId){accountByType[type]=accountId;draft.accountId=accountId}
    const categoryId=String(fd.get('categoryId')||'');
    if(type!=='transfer'&&categoryId){categoryByType[type]=categoryId;draft.categoryId=categoryId}
  };

  const build=()=>{
    const recent=[...state.transactions].filter(x=>x.type===type).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    const t=draft;
    const isTransfer=type==='transfer';
    const accountCandidates=[accountByType[type],t.accountId,state.settings.lastAccountByType?.[type],recent?.accountId,state.accounts[0]?.id];
    const defaultAccount=accountCandidates.find(id=>id&&account(id))||state.accounts[0]?.id;
    accountByType[type]=defaultAccount;
    const cats=state.categories.filter(c=>c.type===type);
    const categoryCandidates=[categoryByType[type],t.categoryId,state.settings.lastCategoryByType?.[type],recent?.categoryId,cats[0]?.id];
    const defaultCategory=categoryCandidates.find(id=>id&&category(id)?.type===type)||cats[0]?.id||'';
    if(!isTransfer)categoryByType[type]=defaultCategory;
    const toCandidates=[t.toAccountId,recent?.toAccountId,state.accounts.find(a=>a.id!==defaultAccount)?.id];
    const defaultTo=toCandidates.find(id=>id&&id!==defaultAccount&&account(id))||'';
    const quickCats=cats;
    const quickAccounts=state.accounts;
    openSheet(`<div class="sheet-head quick-sheet-head"><h3>${existing?'Изменить операцию':template?'Повторить операцию':type==='expense'?'Новый расход':type==='income'?'Новый доход':'Перевод'}</h3><button class="sheet-close" aria-label="Закрыть">×</button></div>
      <div class="segmented tx-segmented"><button data-type="expense" class="${type==='expense'?'active':''}">Расход</button><button data-type="income" class="${type==='income'?'active':''}">Доход</button><button data-type="transfer" class="${type==='transfer'?'active':''}">Перевод</button></div>
      <form id="txForm" class="quick-tx-form">
        <div class="quick-amount"><input id="txAmount" class="amount-input" name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="0,00" required value="${esc(t.amount??'')}"><span>€</span></div>
        ${!isTransfer?`
          <input type="hidden" name="categoryId" id="categoryHidden" value="${esc(defaultCategory||'')}">
          <input type="hidden" name="accountId" id="accountHidden" value="${esc(defaultAccount||'')}">
          <div class="quick-picker quick-category-picker">
            <div class="quick-picker-title"><label>Категория</label><button type="button" class="quick-picker-more" id="toggleAllCategories" aria-expanded="false">Все</button></div>
            <div class="choice-scroller choice-scroller-categories" data-horizontal-scroller>${quickCats.map(c=>`<button type="button" class="choice-chip ${c.id===defaultCategory?'active':''}" data-quick-category="${c.id}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}</div>
            <div class="quick-choice-grid hidden" id="allCategoriesGrid" aria-hidden="true">${quickCats.map(c=>`<button type="button" class="choice-chip ${c.id===defaultCategory?'active':''}" data-quick-category="${c.id}"><span>${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')}</div>
          </div>
          <div class="quick-picker"><label>Оплата</label><div class="choice-scroller choice-scroller-accounts" data-horizontal-scroller>${quickAccounts.map(a=>`<button type="button" class="choice-chip account-choice ${a.id===defaultAccount?'active':''}" data-quick-account="${a.id}">${accountGlyph(a.type)}<span>${esc(a.name)}</span></button>`).join('')}</div></div>
          <details class="advanced-details" ${existing?'open':''}><summary>Дата, комментарий и другие варианты</summary><div class="advanced-body">
            <div class="field"><label>Все категории</label><select id="categorySelectFull">${categoryOptions(type,defaultCategory)}</select></div>
            <div class="field"><label>Все счета</label><select id="accountSelectFull">${accountOptions(defaultAccount)}</select></div>
            <div class="field"><label>Дата</label><input name="date" type="date" max="${todayISO()}" required value="${esc(t.date||todayISO())}"></div>
            <div class="field"><label>Получатель / магазин</label><input name="merchant" maxlength="60" placeholder="Например: REWE" value="${esc(t.merchant||'')}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="100" placeholder="Необязательно" value="${esc(t.note||'')}"></div>
          </div></details>`:`
          <div class="transfer-grid"><div class="field"><label>Откуда</label><select name="accountId" id="transferFrom">${accountOptions(defaultAccount)}</select></div><div class="transfer-arrow">${uiIcon('transfer')}</div><div class="field"><label>Куда</label><select name="toAccountId" id="transferTo">${accountOptions(defaultTo,defaultAccount)}</select></div></div>
          <details class="advanced-details" ${existing?'open':''}><summary>Дата и комментарий</summary><div class="advanced-body"><div class="field"><label>Дата</label><input name="date" type="date" max="${todayISO()}" required value="${esc(t.date||todayISO())}"></div><div class="field"><label>Комментарий</label><input name="note" maxlength="100" value="${esc(t.note||'')}"></div></div></details>`}
        <div class="form-error hidden" role="alert"></div>
        <button class="primary-btn quick-save" type="submit">${existing?'Сохранить':type==='expense'?'Добавить расход':type==='income'?'Добавить доход':'Перевести'}</button>
        ${existing?'<button class="secondary-btn" type="button" id="repeatTx">Повторить</button><button class="danger-btn" type="button" id="deleteTx">Удалить</button>':''}
      </form>`);

    $$('[data-type]').forEach(b=>b.onclick=()=>{
      const nextType=b.dataset.type;
      if(nextType==='transfer'&&state.accounts.length<2){showToast('Для перевода нужны как минимум два счёта');return}
      captureDraft();type=nextType;draft.type=type;build();
    });
    $$('[data-quick-category]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.quickCategory;categoryByType[type]=id;draft.categoryId=id;
      $('#categoryHidden').value=id;$$('[data-quick-category]').forEach(x=>x.classList.toggle('active',x.dataset.quickCategory===id));
      const sel=$('#categorySelectFull');if(sel)sel.value=id;
      revealChoiceInScroller($(`.choice-scroller [data-quick-category="${CSS.escape(id)}"]`));
      // A category chosen from the expanded fallback is now selected, so return
      // to the compact form instead of leaving a very tall grid open.
      if(b.closest('#allCategoriesGrid')){
        const grid=$('#allCategoriesGrid'),more=$('#toggleAllCategories');
        grid?.classList.add('hidden');grid?.setAttribute('aria-hidden','true');
        if(more){more.setAttribute('aria-expanded','false');more.textContent='Все'}
      }
    });
    const toggleAllCategories=$('#toggleAllCategories');
    if(toggleAllCategories)toggleAllCategories.onclick=()=>{
      const grid=$('#allCategoriesGrid');if(!grid)return;
      const opening=grid.classList.contains('hidden');
      grid.classList.toggle('hidden',!opening);grid.setAttribute('aria-hidden',String(!opening));
      toggleAllCategories.setAttribute('aria-expanded',String(opening));
      toggleAllCategories.textContent=opening?'Свернуть':'Все';
    };
    $$('[data-quick-account]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.quickAccount;accountByType[type]=id;draft.accountId=id;
      $('#accountHidden').value=id;$$('[data-quick-account]').forEach(x=>x.classList.toggle('active',x===b));
      const sel=$('#accountSelectFull');if(sel)sel.value=id;revealChoiceInScroller(b);
    });
    const catSel=$('#categorySelectFull');if(catSel)catSel.onchange=e=>{
      const id=e.target.value;categoryByType[type]=id;draft.categoryId=id;$('#categoryHidden').value=id;
      $$('[data-quick-category]').forEach(x=>x.classList.toggle('active',x.dataset.quickCategory===id));
      revealChoiceInScroller($(`.choice-scroller [data-quick-category="${CSS.escape(id)}"]`));
    };
    const accSel=$('#accountSelectFull');if(accSel)accSel.onchange=e=>{
      const id=e.target.value;accountByType[type]=id;draft.accountId=id;$('#accountHidden').value=id;
      $$('[data-quick-account]').forEach(x=>x.classList.toggle('active',x.dataset.quickAccount===id));
      revealChoiceInScroller($(`.choice-scroller [data-quick-account="${CSS.escape(id)}"]`));
    };
    if(isTransfer){
      const from=$('#transferFrom'),to=$('#transferTo');
      const refreshTo=()=>{
        if(!from||!to)return;
        const preferred=to.value||draft.toAccountId||'';
        to.innerHTML=accountOptions(preferred,from.value);
        if(!to.value)to.value=state.accounts.find(a=>a.id!==from.value)?.id||'';
        accountByType.transfer=from.value;draft.accountId=from.value;draft.toAccountId=to.value;
      };
      if(from)from.onchange=refreshTo;
      if(to)to.onchange=()=>{draft.toAccountId=to.value};
      refreshTo();
    }
    requestAnimationFrame(()=>{
      revealChoiceInScroller($('.choice-scroller [data-quick-category].active'));
      revealChoiceInScroller($('.choice-scroller [data-quick-account].active'));
    });
    $('#txForm').onsubmit=e=>{
      e.preventDefault(); const form=e.currentTarget; const fd=new FormData(form); const amount=Number(fd.get('amount'));
      setFormError(form,'');
      if(!amount||amount<=0){setFormError(form,'Введите сумму больше нуля.');$('#txAmount')?.focus();return}
      const obj={id:existing?.id||uid(),type,amount,date:fd.get('date')||todayISO(),accountId:fd.get('accountId'),toAccountId:type==='transfer'?fd.get('toAccountId'):null,categoryId:type==='transfer'?null:fd.get('categoryId'),merchant:type==='transfer'?'':String(fd.get('merchant')||'').trim(),note:String(fd.get('note')||'').trim(),needsReview:false,isAdjustment:Boolean(existing?.isAdjustment),createdAt:existing?.createdAt||Date.now()};
      if(obj.date>todayISO()){setFormError(form,'Фактическая операция не может быть датирована будущим. Для будущих платежей используйте План.');return}
      if(!account(obj.accountId)){setFormError(form,'Выберите существующий счёт.');return}
      if(type!=='transfer'&&(!obj.categoryId||category(obj.categoryId)?.type!==type)){setFormError(form,'Выберите категорию для этого типа операции.');return}
      if(type==='transfer'){
        if(!obj.toAccountId||!account(obj.toAccountId)){setFormError(form,'Выберите счёт назначения.');return}
        if(obj.accountId===obj.toAccountId){setFormError(form,'Для перевода выберите два разных счёта.');return}
      }
      const previous=structuredClone(state);
      if(existing) state.transactions=state.transactions.map(x=>x.id===existing.id?obj:x); else state.transactions.push(obj);
      state.settings.lastAccountByType={...(state.settings.lastAccountByType||{}),[type]:obj.accountId};
      if(type!=='transfer')state.settings.lastCategoryByType={...(state.settings.lastCategoryByType||{}),[type]:obj.categoryId};
      closeSheet();render({motion:'refresh'});showToast(existing?'Операция обновлена':'Операция добавлена');
      persist().catch(()=>{state=previous;render({motion:'none'});showToast('Не удалось сохранить · изменение отменено')});
    };
    const repeat=$('#repeatTx'); if(repeat)repeat.onclick=()=>{captureDraft();openTransactionSheet(null,type,{...existing,...draft,type})};
    const del=$('#deleteTx'); if(del)del.onclick=()=>{closeSheet();deleteTransactionWithUndo(existing)};
    if(!existing&&!template&&window.matchMedia('(pointer: fine)').matches)setTimeout(()=>{try{$('#txAmount')?.focus({preventScroll:true})}catch(_){}},motionMs(180));
  }; build();
}

function openPlanSheet(existing=null,initialDate=null,template=null){
  if(!state.accounts.length){showToast('Сначала добавьте счёт');return}
  let type=existing?.type||template?.type||'expense';
  const source={...(template||{}),...(existing||{})};
  let draft={...source,date:initialDate||source.date||todayISO()};
  const categoryByType={
    expense:category(source.categoryId)?.type==='expense'?source.categoryId:state.settings.lastCategoryByType?.expense,
    income:category(source.categoryId)?.type==='income'?source.categoryId:state.settings.lastCategoryByType?.income
  };
  const captureDraft=()=>{
    const form=$('#planForm');if(!form)return;
    const fd=new FormData(form);
    const cat=String(fd.get('categoryId')||'');if(cat)categoryByType[type]=cat;
    draft={...draft,
      title:String(fd.get('title')??draft.title??''),amount:fd.get('amount')??draft.amount??'',categoryId:cat||draft.categoryId,
      frequency:String(fd.get('frequency')||draft.frequency||'once'),date:String(fd.get('date')||draft.date||todayISO()),
      endDate:String(fd.get('endDate')||''),accountId:String(fd.get('accountId')||draft.accountId||state.accounts[0]?.id||''),
      required:type==='expense'?fd.get('required')==='on':false
    };
  };
  const build=()=>{
    const p=draft;
    const selectedCategory=[categoryByType[type],p.categoryId,state.categories.find(c=>c.type===type)?.id].find(id=>id&&category(id)?.type===type)||'';
    categoryByType[type]=selectedCategory;
    openSheet(`<div class="sheet-head"><h3>${existing?'Изменить план':template?'Создать план из операции':'Новая плановая операция'}</h3><button class="sheet-close">×</button></div>
      <div class="segmented" style="grid-template-columns:1fr 1fr"><button data-plan-type="expense" class="${type==='expense'?'active':''}">Расход</button><button data-plan-type="income" class="${type==='income'?'active':''}">Доход</button></div>
      <form id="planForm"><div class="form-grid">
        <div class="field full"><label>Название</label><input name="title" required placeholder="Например: аренда, зарплата или BAföG" value="${esc(p.title||'')}"></div>
        <div class="field full"><label>Сумма</label><input name="amount" type="number" step="0.01" min="0.01" required inputmode="decimal" value="${esc(p.amount??'')}"></div>
        <div class="field full"><label>Категория</label><select name="categoryId">${categoryOptions(type,selectedCategory)}</select></div>
        ${type==='expense'?`<label class="switch-row full"><input name="required" type="checkbox" ${p.required!==false?'checked':''}><span><strong>Обязательный платёж</strong><small>Если платёж просрочен, он останется обязательством в безопасном расчёте</small></span></label>`:''}
        <div class="field"><label>Повтор</label><select name="frequency" id="planFrequency">${[['once','Один раз'],['weekly','Каждую неделю'],['biweekly','Каждые 2 недели'],['monthly','Каждый месяц'],['quarterly','Каждые 3 месяца'],['yearly','Каждый год']].map(([v,n])=>`<option value="${v}" ${p.frequency===v||(!p.frequency&&v==='once')?'selected':''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label id="planDateLabel">${p.frequency&&p.frequency!=='once'?'Первый платёж':'Дата'}</label><input name="date" type="date" required value="${esc(p.date||todayISO())}"></div>
        <div class="field full ${p.frequency&&p.frequency!=='once'?'':'hidden'}" id="planEndField"><label>Дата окончания <span class="field-hint">необязательно</span></label><input name="endDate" type="date" value="${esc(p.endDate||'')}"><small class="field-help">Оставьте пустым, если платёж идёт без ограничения по времени.</small></div>
        <div class="field full"><label>Счёт</label><select name="accountId">${accountOptions(p.accountId||state.accounts[0]?.id)}</select></div>
      </div><div class="form-error hidden" role="alert"></div><button class="primary-btn" type="submit">${existing?'Сохранить':'Добавить в план'}</button>${existing?'<button class="danger-btn" type="button" id="deletePlan">Удалить план</button>':''}</form>`);
    $$('[data-plan-type]').forEach(b=>b.onclick=()=>{captureDraft();type=b.dataset.planType;draft.type=type;build()});
    const freq=$('#planFrequency');
    if(freq)freq.onchange=()=>{
      const recurring=freq.value!=='once';
      $('#planEndField')?.classList.toggle('hidden',!recurring);
      if($('#planDateLabel'))$('#planDateLabel').textContent=recurring?'Первый платёж':'Дата';
    };
    $('#planForm').onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget;setFormError(form,'');
      const fd=new FormData(form),frequency=fd.get('frequency'),date=fd.get('date'),endDate=frequency!=='once'?String(fd.get('endDate')||''):'';
      const amount=Number(fd.get('amount'));const categoryId=String(fd.get('categoryId')||'');const accountId=String(fd.get('accountId')||'');
      if(!(amount>0)){setFormError(form,'Введите сумму больше нуля.');return}
      if(!date){setFormError(form,'Выберите дату.');return}
      if(endDate&&endDate<date){setFormError(form,'Дата окончания не может быть раньше начала.');return}
      if(!account(accountId)){setFormError(form,'Выберите существующий счёт.');return}
      if(!categoryId||category(categoryId)?.type!==type){setFormError(form,'Выберите категорию для этого типа плана.');return}
      const obj={id:existing?.id||uid(),type,title:String(fd.get('title')).trim(),amount,categoryId,frequency,date,endDate,accountId,required:type==='expense'?fd.get('required')==='on':false};
      if(!obj.title){setFormError(form,'Введите название плана.');return}
      if(existing)state.plans=state.plans.map(x=>x.id===existing.id?obj:x);else state.plans.push(obj);
      await persist();closeSheet();render();showToast('План сохранён');
    };
    const del=$('#deletePlan');if(del)del.onclick=async()=>{
      const removed={...existing};const removedCompletions=state.planCompletions.filter(x=>x.planId===existing.id);
      state.plans=state.plans.filter(x=>x.id!==existing.id);state.planCompletions=state.planCompletions.filter(x=>x.planId!==existing.id);
      await persist();closeSheet();render();
      showToast('План удалён','Отменить',async()=>{state.plans.push(removed);state.planCompletions.push(...removedCompletions);await persist();render();showToast('Удаление отменено')});
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
    const obj={id:existing?.id||uid(),name:String(fd.get('name')).trim(),type:fd.get('type'),icon:existing?.icon||'💳',openingBalance:Number(fd.get('openingBalance')||0),protected:fd.get('protected')==='on',lastReconciledAt:existing?.lastReconciledAt||null};
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
  $('#catForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const obj={id:existing?.id||uid(),name:String(fd.get('name')).trim(),icon:String(fd.get('icon')||'📌').trim(),type:fd.get('type'),preset:existing?.preset||false};if(existing&&obj.type!==existing.type){const used=state.transactions.some(t=>t.categoryId===existing.id)||state.plans.some(p=>p.categoryId===existing.id)||state.budgets.some(b=>b.categoryId===existing.id);if(used){showToast('Нельзя менять тип используемой категории · создайте новую');return}}if(existing)state.categories=state.categories.map(x=>x.id===existing.id?obj:x);else state.categories.push(obj);await persist();closeSheet();render();showToast('Категория сохранена')};
  const del=$('#deleteCat');if(del)del.onclick=async()=>{const used=state.transactions.some(t=>t.categoryId===existing.id)||state.plans.some(p=>p.categoryId===existing.id)||state.budgets.some(b=>b.categoryId===existing.id);if(used){showToast('Категория используется в данных');return}if(confirm('Удалить категорию?')){state.categories=state.categories.filter(x=>x.id!==existing.id);await persist();closeSheet();render()}};
}

function openBudgetSuggestions(){
  const suggestions=budgetSuggestions(3);
  openSheet(`<div class="sheet-head"><div><h3>Подобрать бюджеты</h3><p class="sheet-subtitle">На основе фактических расходов последних полных месяцев. Текущие лимиты не меняются.</p></div><button class="sheet-close">×</button></div>
    ${suggestions.length?`<div class="budget-suggestion-list">${suggestions.map(x=>`<div class="budget-suggestion-row"><span>${esc(x.category?.icon||'•')}</span><div><strong>${esc(x.category?.name||'Категория')}</strong><small>Среднее ${x.months} мес.: ${fmtMajor(x.average)}</small></div><b>${fmtMajor(x.suggested)}</b></div>`).join('')}</div><div class="notice">Предложение — средний расход за доступные полные месяцы, округлённый вверх до 5 €. Это стартовый лимит, а не рекомендация тратить всю сумму.</div><button class="primary-btn" id="applyBudgetSuggestions">Создать ${suggestions.length} бюджет${suggestions.length===1?'':'ов'}</button>`:`<div class="empty-inline"><strong>Пока нечего предложить</strong><span>Нужно минимум два полных месяца расходов в категории без существующего бюджета.</span></div>`}`);
  const apply=$('#applyBudgetSuggestions');if(apply)apply.onclick=async()=>{
    const previous=structuredClone(state);
    suggestions.forEach(x=>{if(!state.budgets.some(b=>b.categoryId===x.categoryId))state.budgets.push({id:uid(),categoryId:x.categoryId,limit:x.suggested})});
    try{await persist();closeSheet();render({motion:'refresh'});showToast('Бюджеты созданы')}catch(_){state=previous;render({motion:'none'});showToast('Не удалось сохранить бюджеты')}
  };
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
  const horizon=safetyHorizonDays();
  openSheet(`<div class="sheet-head"><div><h3>Финансовая подушка</h3><p class="sheet-subtitle">Минимум, который приложение не считает доступным для трат.</p></div><button class="sheet-close">×</button></div><form id="reserveForm"><div class="field"><label>Минимальный остаток</label><input name="reserve" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(state.settings.reserve||0)}"><small class="field-help">Например, сумма на непредвиденные расходы. Защищённые счета учитываются отдельно.</small></div><div class="field"><label>Горизонт безопасного расчёта</label><select name="horizon">${[60,90,120,180].map(v=>`<option value="${v}" ${horizon===v?'selected':''}>${v} дней</option>`).join('')}</select><small class="field-help">Чем длиннее горизонт, тем больше будущих повторяющихся платежей попадает в расчёт.</small></div><div class="notice">«Безопасно доступно» моделирует явные плановые доходы и расходы на выбранный период и оставляет этот минимум нетронутым в самой низкой точке прогноза.</div><button class="primary-btn" type="submit">Сохранить</button></form>`);
  $('#reserveForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);state.settings.reserve=Math.max(0,Number(fd.get('reserve')||0));state.settings.safetyHorizonDays=Math.max(30,Math.min(365,Number(fd.get('horizon')||90)));await persist();closeSheet();render({motion:'refresh'})};
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
  [...state.transactions].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(t=>rows.push([t.date,t.isAdjustment?'adjustment':t.type,t.amount,t.isAdjustment?'':(category(t.categoryId)?.name||''),account(t.accountId)?.name||'',account(t.toAccountId)?.name||'',t.note||'']));
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
  $('#workspaceSwitch')?.addEventListener('click',openWorkspaceSheet);
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
    fab.addEventListener('pointerup',e=>{if(pointerId!==e.pointerId)return;pointerId=null;cancelHold();if(held)return;if(currentWorkspace()==='business')openBusinessOrderSheet();else if(activeTab==='plan')openPlanSheet();else if(activeTab==='more')openQuickAddMenu();else openTransactionSheet(null,'expense')});
    fab.addEventListener('pointercancel',()=>{pointerId=null;cancelHold()});
  }
  $('#sheetBackdrop').onclick=closeSheet;
  $('#privacyToggle').onclick=async()=>{state.settings.privacy=!state.settings.privacy;$('#privacyIcon').innerHTML=uiIcon(state.settings.privacy?'eyeoff':'eye');await persist();render()};
  $('#importInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)handleImport(f);e.target.value=''})
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet()});
  document.addEventListener('dblclick',e=>{if(!isEditableTarget(e.target))e.preventDefault()},{passive:false});
  ['gesturestart','gesturechange','gestureend'].forEach(name=>document.addEventListener(name,e=>{if(!isEditableTarget(e.target))e.preventDefault()},{passive:false}));
  window.addEventListener('pagehide',rememberViewState,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')rememberViewState()},{passive:true});
}

function syncViewportGeometry(){
  const vv=window.visualViewport;
  const width=Math.max(1,Math.round(vv?.width||window.innerWidth||document.documentElement.clientWidth||0));
  const height=Math.max(1,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||0));
  document.documentElement.style.setProperty('--viewport-width',`${width}px`);
  document.documentElement.style.setProperty('--viewport-height',`${height}px`);
  document.documentElement.dataset.viewport=width>=1024?'wide':width>=600?'tablet':'phone';
}
function bindViewportGeometry(){
  syncViewportGeometry();
  let frame=0;
  const schedule=()=>{
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=0;syncViewportGeometry()});
  };
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
}

async function init(){
  bindViewportGeometry();
  loadUIState();
  const saved=await dbGet().catch(()=>null); state=normalizeState(saved||defaultState()); if(!saved)await persist();
  txFilter=uiMemory.txFilter||'all';statsRange=Number(uiMemory.statsRange)||6;planForecastRange=Number(uiMemory.planForecastRange)||12;
  planForecastRange=Math.min(18,Math.max(3,planForecastRange));applyUISettings();
  const now=new Date(); $('#todayLabel').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(now);
  $('#privacyIcon').innerHTML=uiIcon(state.settings.privacy?'eyeoff':'eye'); bindShell(); document.body.classList.add('app-loading'); render(); requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.remove('app-loading')));
  if('serviceWorker' in navigator){
    const registerServiceWorker=async()=>{
      try{
        const reg=await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`,{updateViaCache:'none'});
        navigator.serviceWorker.addEventListener('controllerchange',()=>{
          if(swReloading)return;
          swReloading=true;
          location.reload();
        });
        reg.addEventListener('updatefound',()=>{
          const w=reg.installing;
          if(w)w.addEventListener('statechange',()=>{
            if(w.state==='installed'&&navigator.serviceWorker.controller){
              showToast('Доступна новая версия','Обновить',()=>w.postMessage({type:'SKIP_WAITING'}));
            }
          });
        });
        // Attach lifecycle listeners before requesting an update. The worker
        // calls skipWaiting during install, so controllerchange can otherwise
        // happen before this page is listening for it.
        await reg.update();
        if(reg.waiting){
          showToast('Доступна новая версия','Обновить',()=>{
            reg.waiting?.postMessage({type:'SKIP_WAITING'});
          });
        }
      }catch(_){}
    };
    if(document.readyState==='complete') registerServiceWorker();
    else window.addEventListener('load',registerServiceWorker,{once:true});
  }
}

init();
