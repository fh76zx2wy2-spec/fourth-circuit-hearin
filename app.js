/**
 * توزيع جلسات الدائرة العامة الرابعة
 * نسخة مستقلة تعمل على GitHub Pages، بلا اعتماد على Lovable.
 * تعديل أساسي: إضافة/حذف جلسة لا يغيّر أي إسناد سابق.
 * متوافقة مع قاعدة بيانات Supabase الحالية عند تسجيل الدخول.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

// Publishable/anon browser credentials only. NEVER add a service-role secret here.
const SUPABASE_URL = 'https://gdqktrvhnnibimgyjncn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_3hUbMea5NvP_QZQyjmJKEw_gFEkGeSl';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const CLERKS = [
  'موسى احمد قاري بصلي',
  'خالد فيصل محمد حكمي',
  'محمد جرادي بداحي عياشي',
  'ماطر يحيى محمد ابوالراس',
  'يحيى علي محمد شعيبي',
];
const STORAGE_KEY = 'fourth-circuit-github-history-v1';
const todayRiyadh = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh'}).format(new Date());
const pad = n => String(n).padStart(2,'0');
const uuid = () => crypto.randomUUID();
const fixed = (n,a,b) => Math.max(a,Math.min(b,n));
const formatTime = row => `${row.h > 12 ? row.h-12 : row.h}:${pad(row.m)} ${row.h<12?'ص':'م'}`;
const safe = text => String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const node = () => document.getElementById('app');
const defaultTime = i => {const minutes=Math.min(480+i*30,840);return {h:Math.floor(minutes/60),m:minutes%60}};
const newRow = i => ({id:uuid(),...defaultTime(i),clerk:null,originalClerk:null});
const blankDay = (count=10) => ({hearings:Array.from({length:count},(_,i)=>newRow(i)),active:[...CLERKS],distributed:false});
const selectedToday = todayRiyadh();
let state = {selectedDate:selectedToday,days:{[selectedToday]:blankDay()}};
let profile = null, employees=[],versions={},statuses={},weekly=[],remoteReady=false;
let errorText = '', successText = '', busy = false, foldHistory=false,foldWeek=false,historyFilter='',swapId=null;
let currentSession = null, allDaysLoaded=false;

// Dates are normalized at noon UTC so calendars never shift across local time zones.
function dateDetails(iso){
  const d = new Date(`${iso}T12:00:00Z`);
  const opts = {timeZone:'Asia/Riyadh'};
  return {
    weekday:new Intl.DateTimeFormat('ar-SA',{...opts,weekday:'long'}).format(d),
    hijri:new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',{...opts,day:'numeric',month:'long',year:'numeric'}).format(d)+' هـ',
    greg:new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{...opts,day:'numeric',month:'long',year:'numeric'}).format(d)+' م'
  };
}
const isWorkday = iso => new Date(`${iso}T12:00:00Z`).getUTCDay() <= 4;
const weekStart = iso => {const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10)};
const getDay = () => state.days[state.selectedDate] || blankDay();
const countsFor = day => Object.fromEntries(CLERKS.map(c=>[c,day.hearings.filter(h=>h.clerk===c).length]));
function dayReady(day){return day.distributed && day.active.length>0 && day.hearings.length>0 && day.hearings.every(h=>h.clerk && day.active.includes(h.clerk))}
function historicalDebt(date){
  const debts=Object.fromEntries(CLERKS.map(c=>[c,0]));
  for(const [d,day] of Object.entries(state.days)){
    if(d>=date || weekStart(d)!==weekStart(date) || !dayReady(day)) continue;
    const expected=day.hearings.length/day.active.length;
    for(const c of day.active) debts[c]-=expected;
    for(const h of day.hearings) debts[h.clerk]+=1;
  }
  return debts;
}
const shuffled = arr=>[...arr].sort(()=>Math.random()-.5);
function fairDistribution(day,date){
  const active=[...new Set(day.active)],debt=historicalDebt(date);
  const ordered=shuffled(active).sort((a,b)=>debt[a]-debt[b]);
  const base=Math.floor(day.hearings.length/active.length),extra=day.hearings.length%active.length;
  const pool=[];
  ordered.forEach((name,i)=>{for(let n=0;n<base+(i<extra?1:0);n++) pool.push(name)});
  return shuffled(pool);
}
/**
 * CRITICAL: assign ONLY new hearings. Retain id, clerk and originalClerk of
 * every existing hearing — including prior manual swaps and apologies.
 */
function appendHearingOnly(day){
  if(day.hearings.length>=60) return false;
  const row=newRow(day.hearings.length);
  if(day.distributed && day.active.length && day.hearings.every(h=>h.clerk && day.active.includes(h.clerk))){
    const counts=countsFor(day),debts=historicalDebt(state.selectedDate);
    const min=Math.min(...day.active.map(name=>counts[name]));
    const eligible=day.active.filter(name=>counts[name]===min);
    const bestDebt=Math.min(...eligible.map(name=>debts[name]));
    const choices=eligible.filter(name=>debts[name]===bestDebt);
    row.clerk=choices[Math.floor(Math.random()*choices.length)];
    row.originalClerk=row.clerk;
  }
  day.hearings.push(row);
  return true;
}
function resizeDay(number){
  const desired=fixed(Math.round(number||1),1,60),day=getDay();
  if(desired>day.hearings.length){while(day.hearings.length<desired) appendHearingOnly(day)}
  else if(desired<day.hearings.length){day.hearings.length=desired}
  // Deliberately NO distributed=false and NO clearing old clerk assignments.
  persist();render();
}
function setDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T12:00:00Z')))return;
  state.selectedDate=value;if(!state.days[value])state.days[value]=blankDay();
  errorText='';successText='';persist();refreshWeek();render();
}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(e){errorText='تعذّر حفظ نسخة محلية. يرجى التحقق من مساحة الجهاز.'}}
function setNotice(text,type='ok'){errorText=type==='error'?text:'';successText=type==='ok'?text:'';render()}
function normalizeLocal(saved){
  try{
    const parsed=JSON.parse(saved);if(!parsed || !parsed.days||typeof parsed.days!=='object')return null;
    const days={};for(const [date,day] of Object.entries(parsed.days)){
      if(!Array.isArray(day.hearings)||!day.hearings.length)continue;
      days[date]={active:CLERKS.filter(c=>day.active?.includes(c)),distributed:!!day.distributed,
        hearings:day.hearings.slice(0,60).map((h,i)=>({id:typeof h.id==='string'?h.id:uuid(),h:fixed(Number(h.h)||8,8,14),m:fixed(Number(h.m)||0,0,55),clerk:CLERKS.includes(h.clerk)?h.clerk:null,originalClerk:CLERKS.includes(h.originalClerk)?h.originalClerk:(CLERKS.includes(h.clerk)?h.clerk:null)}))};
    }
    return {selectedDate:parsed.selectedDate||selectedToday,days};
  }catch{return null}
}

async function fetchRemote(){
  const [p,e,days]=await Promise.all([
    supabase.from('profiles').select('user_id,display_name,role,can_approve').eq('user_id',currentSession.user.id).single(),
    supabase.from('employees').select('id,name,sort_order').eq('active',true).order('sort_order'),
    supabase.from('hearing_days').select('id,hearing_date,status,version,hearings(id,position,starts_at,status,original:employees!hearings_original_assignee_id_fkey(name),actual:employees!hearings_actual_assignee_id_fkey(name)),day_absences(employee:employees(name))').order('hearing_date',{ascending:true})
  ]);
  if(p.error)throw p.error;if(e.error)throw e.error;if(days.error)throw days.error;
  profile=p.data;employees=e.data||[];const clean={};versions={};statuses={};
  for(const raw of days.data||[]){
    const missing=new Set((raw.day_absences||[]).map(a=>a.employee?.name).filter(Boolean));
    const hearings=[...(raw.hearings||[])].sort((a,b)=>a.position-b.position).map(h=>{
      const [hour,minute]=h.starts_at.split(':').map(Number);
      return {id:h.id,h:hour,m:minute,clerk:h.actual?.name||h.original?.name||null,originalClerk:h.original?.name||h.actual?.name||null};
    });
    clean[raw.hearing_date]={hearings:hearings.length?hearings:blankDay().hearings,active:CLERKS.filter(name=>!missing.has(name)),distributed:hearings.length>0&&hearings.every(h=>h.clerk)};
    versions[raw.hearing_date]=Number(raw.version);statuses[raw.hearing_date]=raw.status;
  }
  const currentDate=state.selectedDate;
  // Remote database is authoritative for saved dates; unsaved locally entered dates remain local.
  for(const [date,day] of Object.entries(state.days))if(!clean[date])clean[date]=day;
  if(!clean[currentDate])clean[currentDate]=blankDay();
  state={selectedDate:currentDate,days:clean};
  remoteReady=true;allDaysLoaded=true;persist();await refreshWeek();
}
async function refreshWeek(){
  if(!remoteReady)return;
  try{const r=await supabase.rpc('weekly_summary',{p_date:state.selectedDate});if(!r.error)weekly=(r.data||[]).map(x=>({...x,actual_count:Number(x.actual_count),covered_count:Number(x.covered_count),pending_compensation:Number(x.pending_compensation)}));}catch{}
  render();
}
async function saveRemote(status='draft'){
  if(!remoteReady)throw new Error('لم يكتمل تحميل قاعدة البيانات.');
  if(!isWorkday(state.selectedDate))throw new Error('لا يمكن الحفظ ليوم الجمعة أو السبت.');
  const day=getDay();if(!dayReady(day))throw new Error('يجب توزيع جميع الجلسات قبل الحفظ.');
  const ids=new Map(employees.map(e=>[e.name,e.id]));
  const payload={
    p_date:state.selectedDate,
    p_expected_version:versions[state.selectedDate]??null,
    p_status:status,
    p_absent_employee_ids:CLERKS.filter(c=>!day.active.includes(c)).map(c=>ids.get(c)).filter(Boolean),
    p_hearings:day.hearings.map((h,i)=>({
      id:/^[0-9a-f-]{36}$/i.test(h.id)?h.id:uuid(),
      position:i+1,starts_at:`${pad(h.h)}:${pad(h.m)}:00`,
      original_assignee_id:ids.get(h.originalClerk||h.clerk)||null,
      actual_assignee_id:ids.get(h.clerk)||null,status:'scheduled'
    }))
  };
  const {data,error}=await supabase.rpc('save_complete_day',payload);
  if(error)throw error;
  versions[state.selectedDate]=Number(data.version);
  statuses[state.selectedDate]=data.status;
  persist();await refreshWeek();
  return data;
}
async function guardedSave(status='draft'){
  if(busy)return;busy=true;render();
  try{await saveRemote(status);setNotice(status==='approved'?'تم الحفظ والاعتماد في قاعدة البيانات.':'تم الحفظ في قاعدة البيانات.');}
  catch(e){setNotice(/stale_version/i.test(e.message)?'عُدّلت الجلسات من مستخدم آخر. حدّث الصفحة قبل إعادة المحاولة.':'تعذّر الحفظ: '+(e.message||'تحقق من الاتصال'),'error')}
  finally{busy=false;render()}
}
async function exportImage(share=false){
  if(!dayReady(getDay()))return setNotice('لا يمكن تصدير الصورة قبل توزيع جميع الجلسات.','error');
  if(!window.html2canvas)return setNotice('تعذر تحميل أداة الصور. اتصل بالإنترنت ثم أعد المحاولة.','error');
  try{
    const el=document.getElementById('export-card');
    const canvas=await window.html2canvas(el,{scale:2.5,backgroundColor:'#fffdf7',useCORS:true});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const name=`توزيع-جلسات-الدائرة-الرابعة-${state.selectedDate}.png`;
    if(share && navigator.share && navigator.canShare && navigator.canShare({files:[new File([blob],name,{type:'image/png'})]})){
      await navigator.share({title:'توزيع جلسات اليوم',files:[new File([blob],name,{type:'image/png'})]});
    }else{
      const link=document.createElement('a');const u=URL.createObjectURL(blob);link.href=u;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),12000);
    }
  }catch(e){if(e.name!=='AbortError')setNotice('تعذر إنشاء الصورة: '+e.message,'error')}
}
async function downloadBackup(){
  const tables=['hearing_days','day_absences','hearings','apologies','compensation_adjustments'];
  try{
    const data={};for(const t of tables){const r=await supabase.from(t).select('*');if(r.error)throw r.error;data[t]=r.data||[]}
    downloadJson({format:'fourth-circuit-backup',version:3,exported_at:new Date().toISOString(),data},'fourth-circuit-backup.json');
  }catch(e){ // Local fallback avoids silently losing a copy of the work.
    downloadJson({format:'fourth-circuit-local-export',exported_at:new Date().toISOString(),state},'fourth-circuit-local-backup.json');
    setNotice('تعذّر استخراج النسخة الكاملة من قاعدة البيانات؛ حُفظت نسخة محلية بدلًا منها.','error');
  }
}
function downloadJson(obj,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)
}
async function importBackup(file){
  if(!file)return;
  if(!confirm('استعادة النسخة الاحتياطية تغيّر بيانات قاعدة البيانات. هل أنت متأكد؟'))return;
  try{
    const payload=JSON.parse(await file.text());if(payload.format!=='fourth-circuit-backup')throw new Error('صيغة النسخة غير معروفة');
    const result=await supabase.rpc('restore_backup',{p_payload:payload});if(result.error)throw result.error;
    await fetchRemote();setNotice('تمت استعادة النسخة بنجاح.');
  }catch(e){setNotice('تعذّرت الاستعادة: '+e.message,'error')}
}
async function deleteSavedDay(date){
  if(profile?.role!=='admin')return;
  if(!confirm(`حذف جميع جلسات يوم ${date} من قاعدة البيانات؟ لا يمكن التراجع.`))return;
  const r=await supabase.from('hearing_days').delete().eq('hearing_date',date);
  if(r.error)return setNotice('تعذّر الحذف: '+r.error.message,'error');
  delete state.days[date];delete versions[date];delete statuses[date];
  if(state.selectedDate===date)state.days[date]=blankDay();persist();render();
}
async function submitSwap(){
  const h=getDay().hearings.find(x=>x.id===swapId);const select=document.getElementById('swap-select');
  const replacement=select?.value;if(!h||!h.clerk||!replacement||replacement===h.clerk)return;
  const reason=document.getElementById('swap-reason').value;
  try{
    busy=true;await saveRemote('draft');const ids=new Map(employees.map(e=>[e.name,e.id]));
    const r=await supabase.rpc('record_apology',{p_hearing_id:h.id,p_replacement_id:ids.get(replacement),p_reason:reason,p_expected_version:versions[state.selectedDate]??null});
    if(r.error)throw r.error;
    h.clerk=replacement;
    // Original clerk deliberately unchanged; this is important for compensation.
    swapId=null;persist();await refreshWeek();setNotice('تم تسجيل الاعتذار والتبديل في قاعدة البيانات.');
  }catch(e){setNotice('تعذّر تسجيل الاعتذار: '+e.message,'error')}
  finally{busy=false;render()}
}

function renderLogin(){
  node().innerHTML=`<div class="login-bg"><form class="login-card" id="login-form"><span class="court">المحكمة العامة بأبي عريش</span><h1>الدائرة العامة الرابعة</h1><p>الدخول للقاضي وأميني السر فقط</p><label>اسم المستخدم</label><input required id="username" autocomplete="username" placeholder="اسم المستخدم أو البريد الإلكتروني"><label>كلمة المرور</label><input required id="password" type="password" autocomplete="current-password"><button class="btn btn-primary full-width" type="submit">دخول</button><div id="login-error" class="alert error hidden" style="margin-top:14px"></div></form></div>`;
  document.getElementById('login-form').addEventListener('submit',async e=>{
    e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;
    const name=document.getElementById('username').value.trim(),password=document.getElementById('password').value;
    const email=name.includes('@')?name:`${name}@fourth-circuit.invalid`;
    try{const r=await supabase.auth.signInWithPassword({email,password});if(r.error)throw r.error;currentSession=r.data.session;await fetchRemote();render()}
    catch(err){const area=document.getElementById('login-error');area.textContent='تعذّر تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور، أو من إعداد قاعدة البيانات.';area.classList.remove('hidden')}
    finally{b.disabled=false}
  });
}
const periodLabel = h => h<12?'صباحًا':h===12?'ظهرًا':'مساءً';
function renderRow(h,i,day){
  const hours=Array.from({length:7},(_,n)=>n+8).map(n=>`<option value="${n}" ${n===h.h?'selected':''}>${pad(n)} ${periodLabel(n)}</option>`).join('');
  const minutes=Array.from({length:12},(_,n)=>n*5).map(n=>`<option value="${n}" ${n===h.m?'selected':''} ${h.h===14&&n!==0?'disabled':''}>${pad(n)}</option>`).join('');
  const names=`<option value="">— بدون —</option>`+day.active.map(name=>`<option value="${safe(name)}" ${h.clerk===name?'selected':''}>${safe(name)}</option>`).join('');
  return `<li class="row" data-row="${safe(h.id)}"><span class="row-name">الجلسة ${i+1}</span><select class="select" data-action="hour" aria-label="ساعة الجلسة ${i+1}">${hours}</select><select class="select" data-action="minute" aria-label="دقائق الجلسة ${i+1}">${minutes}</select><div class="assignee">${day.distributed?`<select class="select" data-action="clerk" aria-label="موظف الجلسة ${i+1}">${names}</select>${h.clerk?`<button class="swap-button" data-action="swap">⇄ اعتذار / تبديل</button>`:''}`:'<span class="tiny">لم يُوزَّع بعد</span>'}</div><button type="button" class="delete" aria-label="حذف الجلسة ${i+1}" data-action="delete-row" ${day.hearings.length<=1?'disabled':''}>✕</button></li>`;
}
function renderHistory(){
  const ago=new Date(`${todayRiyadh()}T12:00:00Z`);ago.setUTCFullYear(ago.getUTCFullYear()-1);
  const min=ago.toISOString().slice(0,10);
  const days=Object.entries(state.days).filter(([d,day])=>dayReady(day)&&(historyFilter?d===historyFilter:d>=min&&d<=todayRiyadh())).sort((a,b)=>b[0].localeCompare(a[0]));
  return `<div class="panel"><button class="fold-head" data-action="history-toggle"><span>◷ &nbsp; سجل الأيام السابقة</span><span class="tiny">${Object.values(state.days).filter(dayReady).length} يوم &nbsp; ${foldHistory?'⌃':'⌄'}</span></button>${foldHistory?`<div class="fold-content"><div class="date-line"><label>ابحث بالتاريخ</label><input type="date" id="history-filter" value="${safe(historyFilter)}"><button class="btn mini" data-action="history-clear">إظهار آخر سنة</button></div><div>${days.map(([date,day])=>{const info=dateDetails(date);return `<div class="history-row"><div><b>${safe(info.weekday)}، ${safe(info.greg)}</b><span>${safe(info.hijri)} · ${day.hearings.length} جلسة</span></div><div class="history-buttons"><button class="btn btn-primary mini" data-action="select-history" data-date="${date}">عرض</button>${profile?.role==='admin'?`<button class="btn btn-danger mini" data-action="delete-day" data-date="${date}">حذف</button>`:''}</div></div>`}).join('')||'<p class="note">لا توجد جلسات محفوظة للتاريخ المحدد.</p>'}</div><div class="actions-bar" style="margin-top:12px"><button class="btn mini" data-action="today">العودة لليوم</button><button class="btn mini" data-action="backup">نسخة احتياطية</button>${profile?.role==='admin'?'<button class="btn mini" data-action="restore">استعادة نسخة</button>':''}</div><p class="note" style="margin-top:9px">سجلات الأيام المحفوظة تظهر للحسابات المصرح لها على الأجهزة المختلفة.</p></div>`:''}</div>`;
}
function renderWeek(){
  return `<div class="panel"><button class="fold-head" data-action="week-toggle"><span>⚖ &nbsp; ملخص الأسبوع والتعويضات</span><span>${foldWeek?'⌃':'⌄'}</span></button>${foldWeek?`<div class="fold-content overflow"><table class="weekly-table"><thead><tr><th>الموظف</th><th>الجلسات</th><th>التغطية</th><th>التعويض المعلق</th></tr></thead><tbody>${weekly.map(row=>`<tr><td>${safe(row.employee_name)}</td><td>${row.actual_count}</td><td>${row.covered_count}</td><td>${Math.max(0,row.pending_compensation)}</td></tr>`).join('')}</tbody></table>${weekly.length?'':'<p class="note">لا توجد بيانات محفوظة لهذا الأسبوع.</p>'}</div>`:''}</div>`;
}
function renderPreview(day,info,counts){
  if(!dayReady(day))return `<div class="preview-empty"><div class="scale">⚖</div><h3>أدخل الأوقات ثم اضغط توزيع الجلسات</h3><p>ستظهر هنا الصورة كما ستُحفظ تمامًا.</p></div>`;
  const rows=[...day.hearings].sort((a,b)=>a.h*60+a.m-(b.h*60+b.m));
  return `<div class="export-card" id="export-card"><div class="export-heading"><div class="export-crown">⚖</div><p>المملكة العربية السعودية</p><p>وزارة العدل – المحكمة العامة بأبي عريش</p><h2>توزيع جلسات اليوم</h2><p>${safe(info.weekday)} | ${safe(info.hijri)}</p><p>${safe(info.greg)}</p></div><table class="export-table"><thead><tr><th>م</th><th>موعد الجلسة</th><th>كاتب الضبط</th></tr></thead><tbody>${rows.map((h,i)=>`<tr><td>${i+1}</td><td>${formatTime(h)}</td><td>${safe(h.clerk)}</td></tr>`).join('')}</tbody></table><div class="export-summary"><h3>ملخص التوزيع</h3><div class="chips">${day.active.map(c=>`<span class="chip">${safe(c)}: <b>${counts[c]||0}</b></span>`).join('')}</div></div></div>`;
}
function actionButtons(day,compact=false){
  const ready=dayReady(day),canEdit=isWorkday(state.selectedDate)&&remoteReady;
  return `<button class="btn btn-primary" data-action="distribute" ${!day.active.length||!isWorkday(state.selectedDate)||busy?'disabled':''}>⤨ ${day.distributed?'إعادة التوزيع':'توزيع الجلسات عشوائيًا'}</button><button class="btn ${compact?'subtle-mobile':''}" data-action="save" ${!ready||!canEdit||busy?'disabled':''}>▣ حفظ التوزيع</button>${(profile?.role==='admin'||profile?.can_approve)?`<button class="btn subtle-mobile" data-action="approve" ${!ready||!canEdit||busy?'disabled':''}>✓ اعتماد</button>`:''}<button class="btn" data-action="image" ${!ready||busy?'disabled':''}>⇩ حفظ الصورة</button><button class="btn ${compact?'subtle-mobile':''}" data-action="share" ${!ready||busy?'disabled':''}>↗ مشاركة</button>`;
}
function render(){
  if(!currentSession){renderLogin();return}
  const day=getDay(),date=state.selectedDate,info=dateDetails(date),counts=countsFor(day);
  const values=day.active.map(c=>counts[c]);const balanced=values.length&&Math.max(...values)-Math.min(...values)<=1;
  const ready=dayReady(day),invalid=day.distributed&&!ready;
  node().innerHTML=`<div class="page"><header class="hero"><div class="hero-content"><div class="hero-icon">⚖</div><div class="hero-title"><small>المحكمة العامة بأبي عريش</small><h1>الدائرة العامة الرابعة</h1></div><div class="hero-user">${safe(profile?.display_name||'')}<br><button class="btn mini" style="margin-top:5px" data-action="logout">خروج</button></div><div class="hero-tag">منظّم توزيع الجلسات</div></div><div class="gold-line"></div></header>
  <main class="layout"><section class="column">
  <div class="panel"><div class="panel-head"><h2><span class="ico">▦</span>تاريخ الجلسات</h2></div><div class="panel-body"><div class="date-line"><input type="date" id="date-input" value="${safe(date)}"><div class="date-info"><b>${safe(info.weekday)}</b> الموافق ${safe(info.hijri)} <span class="gold">|</span> ${safe(info.greg)}</div></div>${!isWorkday(date)?'<div class="alert warn" style="margin-top:12px">الجمعة والسبت خارج أيام عمل الدائرة. اختر يومًا من الأحد إلى الخميس للحفظ والتوزيع.</div>':''}</div></div>
  <div class="panel"><div class="panel-head"><h2><span class="ico">◷</span>الجلسات وأوقاتها</h2><div class="count-wrap"><label for="count-input">عدد جلسات اليوم</label><input type="number" id="count-input" min="1" max="60" value="${day.hearings.length}"></div></div><div class="panel-body"><ol class="hearings">${day.hearings.map((h,i)=>renderRow(h,i,day)).join('')}</ol><button class="btn btn-gold" style="margin-top:13px" data-action="add" ${day.hearings.length>=60?'disabled':''}>＋ إضافة جلسة</button></div></div>
  <div class="panel"><div class="panel-head"><h2><span class="ico">♙</span>الموظفون المتاحون اليوم</h2></div><div class="panel-body"><div class="staff">${CLERKS.map(name=>`<button type="button" data-action="toggle-clerk" data-clerk="${safe(name)}" class="staff-item ${day.active.includes(name)?'enabled':''}"><span class="staff-name">${safe(name)}</span><span class="staff-meta">${day.distributed&&day.active.includes(name)?`<span class="pill">${counts[name]||0}</span>`:''}<span class="switch"></span></span></button>`).join('')}</div>${!day.active.length?'<div class="alert error" style="margin-top:10px">لا يوجد موظف متاح للتوزيع.</div>':''}</div></div>
  <div class="stats"><div class="stat"><small>الجلسات</small><strong>${day.hearings.length}</strong></div><div class="stat"><small>الموظفون</small><strong>${day.active.length}</strong></div><div class="stat"><small>التوازن</small><strong style="font-size:19px">${!day.distributed?'—':invalid?'ناقص':balanced?'متوازن':'يدوي'}</strong></div></div>
  <p class="note">✓ العدالة عبر الأيام مفعّلة؛ الجلسات الزائدة للأقل نصيبًا في أيام حضوره. <b>إضافة جلسة جديدة لا تغيّر توزيع الجلسات السابقة.</b></p>
  ${invalid?'<div class="alert warn">هناك جلسات غير مسندة؛ أسندها يدويًا أو استخدم إعادة التوزيع بعد التأكيد.</div>':''}
  ${ready&&!balanced?'<div class="alert warn">توزيع الجلسات ليس متساويًا بالكامل، وقد يكون ذلك نتيجة تعديل يدوي.</div>':''}
  ${!remoteReady?'<div class="alert error">تعذّر الاتصال بقاعدة البيانات. لن يظهر نجاح وهمي للحفظ.</div>':''}
  ${errorText?`<div class="alert error" role="alert">${safe(errorText)}</div>`:''}${successText?`<div class="alert" role="status">${safe(successText)}</div>`:''}
  <div class="actions-bar desktop-actions">${actionButtons(day)}</div>
  ${renderHistory()}${renderWeek()}<button class="btn-plain" data-action="reset">بدء يوم جديد (دون حذف السجل)</button>
  </section><section class="preview-wrap"><h2 class="preview-title">معاينة الصورة المحفوظة</h2>${renderPreview(day,info,counts)}</section></main><div class="mobile-actions">${actionButtons(day,true)}</div>
  <input type="file" id="restore-file" accept=".json,application/json" class="hidden"><div id="dialog-slot"></div></div>`;
  if(swapId)showSwapDialog();
}
function showSwapDialog(){
  const h=getDay().hearings.find(x=>x.id===swapId);if(!h){swapId=null;return}
  const choices=getDay().active.filter(c=>c!==h.clerk);
  document.getElementById('dialog-slot').innerHTML=`<div class="dialog-backdrop"><div class="dialog"><h2>اعتذار / تبديل الجلسة</h2><p class="note">الكاتب الحالي: ${safe(h.clerk)}</p><label>الكاتب البديل</label><select id="swap-select"><option value="">اختر الموظف</option>${choices.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join('')}</select><label>سبب الاعتذار (اختياري)</label><textarea id="swap-reason"></textarea><div class="dialog-actions"><button class="btn" data-action="close-swap">إلغاء</button><button class="btn btn-primary" data-action="confirm-swap" ${busy?'disabled':''}>حفظ التبديل</button></div></div></div>`;
}
function resetForToday(){
  const today=todayRiyadh();
  if(dayReady(state.days[today]||blankDay())&&!confirm('يوجد توزيع محفوظ لهذا اليوم، هل تريد تهيئته من جديد؟ لن تُحذف سجلات الأيام الأخرى.'))return;
  state.selectedDate=today;state.days[today]=blankDay();persist();render();
}
// Event delegation retains handlers across complete UI rerenders.
document.addEventListener('click',async e=>{
  const control=e.target.closest('[data-action]');if(!control)return;
  const action=control.dataset.action,day=getDay();
  switch(action){
    case 'add':appendHearingOnly(day);persist();render();break;
    case 'delete-row':{
      const id=control.closest('[data-row]')?.dataset.row;
      if(day.hearings.length>1){day.hearings=day.hearings.filter(h=>h.id!==id);persist();render()}break;
    }
    case 'toggle-clerk':{
      const clerk=control.dataset.clerk,wasActive=day.active.includes(clerk);
      if(wasActive && day.distributed && day.hearings.some(h=>h.clerk===clerk)){
        if(!confirm('هذا الموظف لديه جلسات موزعة. عند استبعاده ستصبح جلساته فقط دون إسناد، وسيبقى توزيع بقية الموظفين كما هو. هل تريد المتابعة؟'))return;
      }
      day.active=wasActive?day.active.filter(c=>c!==clerk):CLERKS.filter(c=>c===clerk||day.active.includes(c));
      if(wasActive)day.hearings.forEach(h=>{if(h.clerk===clerk){h.clerk=null;h.originalClerk=null}});
      persist();render();break;
    }
    case 'distribute':{
      if(!day.active.length||!isWorkday(state.selectedDate))return;
      if(day.distributed&&!confirm('إعادة التوزيع ستُغيّر أسماء الموظفين في جميع جلسات اليوم. هل تريد المتابعة؟'))return;
      const names=fairDistribution(day,state.selectedDate);
      day.hearings.forEach((h,i)=>{h.clerk=names[i]||null;h.originalClerk=h.clerk});
      day.distributed=true;persist();render();break;
    }
    case 'save':await guardedSave('draft');break;
    case 'approve':await guardedSave('approved');break;
    case 'image':await exportImage(false);break;
    case 'share':await exportImage(true);break;
    case 'history-toggle':foldHistory=!foldHistory;render();break;
    case 'week-toggle':foldWeek=!foldWeek;render();break;
    case 'history-clear':historyFilter='';render();break;
    case 'select-history':setDate(control.dataset.date);break;
    case 'delete-day':await deleteSavedDay(control.dataset.date);break;
    case 'today':setDate(todayRiyadh());break;
    case 'backup':await downloadBackup();break;
    case 'restore':document.getElementById('restore-file').click();break;
    case 'reset':resetForToday();break;
    case 'swap':swapId=control.closest('[data-row]').dataset.row;showSwapDialog();break;
    case 'close-swap':swapId=null;render();break;
    case 'confirm-swap':await submitSwap();break;
    case 'logout':await supabase.auth.signOut();currentSession=null;profile=null;remoteReady=false;renderLogin();break;
  }
});
document.addEventListener('change',async e=>{
  const target=e.target;
  if(target.id==='date-input')return setDate(target.value);
  if(target.id==='history-filter'){historyFilter=target.value;render();return}
  if(target.id==='restore-file')return importBackup(target.files[0]);
  const action=target.dataset.action;
  if(action && target.closest('[data-row]')){
    const row=getDay().hearings.find(h=>h.id===target.closest('[data-row]').dataset.row);if(!row)return;
    if(action==='hour'){row.h=fixed(Number(target.value),8,14);if(row.h===14)row.m=0}
    if(action==='minute'){row.m=row.h===14?0:fixed(Number(target.value),0,55)}
    if(action==='clerk'){row.clerk=target.value||null;row.originalClerk=row.clerk}
    persist();render();
  }
});
document.addEventListener('focusout',e=>{
  if(e.target.id==='count-input')resizeDay(Number(e.target.value));
});
document.addEventListener('keydown',e=>{
  if(e.target.id==='count-input'&&e.key==='Enter'){e.preventDefault();e.target.blur()}
});

async function boot(){
  const cached=normalizeLocal(localStorage.getItem(STORAGE_KEY));
  if(cached)state=cached;
  const {data}=await supabase.auth.getSession();currentSession=data.session;
  if(!currentSession){renderLogin();return}
  try{await fetchRemote()}catch(e){remoteReady=false;errorText='تعذّر تحميل بيانات قاعدة البيانات: '+e.message;}
  render();
}
supabase.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){currentSession=null;remoteReady=false;renderLogin()}
});
boot().catch(e=>{node().innerHTML=`<div class="alert error" style="margin:30px auto;max-width:550px">تعذّر تشغيل الموقع: ${safe(e.message)}</div>`});
