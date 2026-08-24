const STORAGE_KEY='ironlog-telegram-v2';
const LEGACY_KEY='ironlog-telegram-v1';
const telegram=window.Telegram?.WebApp;
const telegramSupports=version=>telegram?.isVersionAtLeast?.(version)===true;
const $=selector=>document.querySelector(selector);
const app=$('#app');
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const weekdayOptions=[
  {value:2,title:'Понедельник'},{value:3,title:'Вторник'},{value:4,title:'Среда'},
  {value:5,title:'Четверг'},{value:6,title:'Пятница'},{value:7,title:'Суббота'},
  {value:1,title:'Воскресенье'}
];
const starterTemplates=[
  {id:uid(),name:'Ноги + плечи',weekday:4,exercises:[]},
  {id:uid(),name:'Грудь + бицепс',weekday:2,exercises:[]},
  {id:uid(),name:'Спина + трицепс',weekday:6,exercises:[]}
];

function rawSaved(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||localStorage.getItem(LEGACY_KEY)||'null')}catch{return null}
}
const saved=rawSaved();
function weekdayFromLegacy(template){
  if(Number.isInteger(template.weekday))return template.weekday;
  if(Number.isInteger(template.scheduledWeekday))return template.scheduledWeekday;
  let note=String(template.note||template.subtitle||'').toLowerCase();
  return weekdayOptions.find(item=>note.includes(item.title.toLowerCase()))?.value??null;
}
function normalizeTemplates(items){
  return (Array.isArray(items)?items:starterTemplates).map(template=>({
    id:template.id||uid(),name:String(template.name||'Программа'),weekday:weekdayFromLegacy(template),
    exercises:(Array.isArray(template.exercises)?template.exercises:[]).map(exercise=>({
      id:exercise.id||uid(),name:String(exercise.name||'Упражнение'),
      sets:Math.max(1,Number(exercise.sets??exercise.targetSets)||1),
      reps:Math.max(0,Number(exercise.reps??exercise.targetReps)||10),
      rir:Math.min(5,Math.max(0,Number(exercise.rir??exercise.defaultRIR)||0))
    }))
  }));
}
const migratedTemplates=normalizeTemplates(saved?.templates);
function normalizeSessions(items,templates=migratedTemplates){
  return (Array.isArray(items)?items:[]).map(session=>{
    let legacyTemplate=Number.isInteger(session.template)?templates[session.template]:null;
    return {
      id:session.id||uid(),templateId:session.templateId||legacyTemplate?.id||null,
      name:String(session.name||legacyTemplate?.name||'Тренировка'),date:session.date||todayISO(),
      done:Boolean(session.done??session.isCompleted),completedAt:session.completedAt||null,
      durationSeconds:Math.max(0,Number(session.durationSeconds)||0),notes:String(session.notes||''),
      exercises:(Array.isArray(session.exercises)?session.exercises:[]).map(exercise=>({
        id:exercise.id||uid(),name:String(exercise.name||'Упражнение'),notes:String(exercise.notes||''),
        sets:(Array.isArray(exercise.sets)?exercise.sets:[]).map((set,index)=>({
          id:set.id||uid(),weight:Math.max(0,Number(set.weight)||0),reps:Math.max(0,Number(set.reps)||0),
          rir:Math.min(5,Math.max(0,Number(set.rir)||0)),done:Boolean(set.done??set.isCompleted),number:index+1
        }))
      }))
    };
  });
}
const state={
  screen:'home',templates:migratedTemplates,sessions:normalizeSessions(saved?.sessions),active:null,
  restEnd:Number(saved?.restEnd)>Date.now()?Number(saved.restEnd):0,restSessionId:saved?.restSessionId||null,
  theme:['system','light','dark'].includes(saved?.theme)?saved.theme:'system',chartProgram:null,chartExercise:null,
  editingCompleted:false,reordering:false,calendarCursor:new Date(),selectedDate:new Date(),sessionOpenedAt:Date.now()
};
state.active=[...state.sessions].reverse().find(session=>!session.done)??null;

function snapshot(){return {version:2,app:'IronLog Telegram',exportedAt:new Date().toISOString(),templates:state.templates,sessions:state.sessions,restEnd:state.restEnd,restSessionId:state.restSessionId,theme:state.theme}}
function persist(){
  let data=JSON.stringify(snapshot());localStorage.setItem(STORAGE_KEY,data);
  if(telegramSupports('9.0'))try{telegram.DeviceStorage.setItem(STORAGE_KEY,data,()=>{})}catch{}
}
function escapeHTML(value){return String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')}
function todayISO(){return localISO(new Date())}
function localISO(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function dateFromISO(value){let [year,month,day]=String(value||todayISO()).split('-').map(Number);return new Date(year,month-1,day,12)}
function ruDate(date,options){return new Intl.DateTimeFormat('ru-RU',options).format(date).replace(/^./,char=>char.toUpperCase())}
function weekdayNumber(date){return date.getDay()+1}
function weekdayTitle(value){return weekdayOptions.find(item=>item.value===value)?.title||'Без расписания'}
function countDone(session){return session.exercises.flatMap(exercise=>exercise.sets).filter(set=>set.done).length}
function totalVolume(sessions){return Math.round(sessions.flatMap(session=>session.exercises).flatMap(exercise=>exercise.sets).filter(set=>set.done).reduce((sum,set)=>sum+(Number(set.weight)||0)*(Number(set.reps)||0),0))}
function sessionDuration(session){return session.durationSeconds+(session.done?0:Math.max(0,Math.floor((Date.now()-state.sessionOpenedAt)/1000)))}
function timeCode(seconds){seconds=Math.max(0,Math.floor(seconds));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function workoutWord(count){let n=Math.abs(count)%100,last=n%10;return n>=11&&n<=14?'тренировок':last===1?'тренировка':last>=2&&last<=4?'тренировки':'тренировок'}
function templateById(id){return state.templates.find(template=>template.id===id)}
function applyTheme(){document.documentElement.dataset.theme=state.theme==='system'?'':state.theme}

const navIcons={
  home:'<svg viewBox="0 0 24 24"><path d="M3 11.2 12 4l9 7.2v8.3a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  calendar:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v4M17 3v4M3.5 10h17"/></svg>',
  workouts:'<svg viewBox="0 0 24 24"><path d="M2.5 9v6M5.5 7v10M8.5 10v4M15.5 10v4M18.5 7v10M21.5 9v6M8.5 12h7"/></svg>',
  history:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
};
function nav(active){return `<nav>${[['home','Сегодня'],['calendar','Календарь'],['workouts','Тренировки'],['history','История']].map(([id,title])=>`<button data-nav="${id}" class="${active===id?'active':''}"><span class="navicon">${navIcons[id]}</span>${title}</button>`).join('')}</nav>`}
function header(kicker,title,actions=''){return `<div class="row spread"><div><div class="eyebrow">${kicker}</div><div class="title">${title}</div></div>${actions}</div>`}

function home(){
  let now=new Date(),today=todayISO(),todaySession=[...state.sessions].reverse().find(session=>session.date===today),todayPlan=state.templates.find(template=>template.weekday===weekdayNumber(now)),todayPlanName=todaySession?.name||todayPlan?.name;
  let completedWeek=state.sessions.filter(session=>session.done&&Math.abs((dateFromISO(session.date)-now)/86400000)<7).length;
  let days=Array.from({length:7},(_,index)=>{let date=new Date(now);date.setDate(now.getDate()+index-3);let iso=localISO(date),trained=state.sessions.some(session=>session.date===iso&&session.done),planned=state.sessions.some(session=>session.date===iso&&!session.done)||state.templates.some(template=>template.weekday===weekdayNumber(date));return `<button class="day ${index===3?'active':''} ${trained?'done':''}" data-week-date="${iso}">${ruDate(date,{weekday:'narrow'}).toUpperCase()}<b>${date.getDate()}</b>${trained?'✓':planned?'<i class="dot"></i>':''}</button>`}).join('');
  let current=todaySession?`<button class="card history-row" id="openToday"><span class="session-symbol">${todaySession.done?'✓':'▶'}</span><span><span class="eyebrow">${todaySession.done?'ГОТОВО':'ТРЕНИРОВКА СЕГОДНЯ'}</span><b>${escapeHTML(todaySession.name)}</b><small class="muted">${todaySession.exercises.length} упражнений · ${countDone(todaySession)} подходов</small></span><span class="open-arrow">›</span></button>`:`<div class="card row spread"><div><b>${todayPlan?escapeHTML(todayPlan.name):'Сегодня свободно'}</b><span class="muted">${todayPlan?'Запланировано на сегодня':state.templates.length?'Можно выбрать любую программу':'Создай первую программу'}</span></div><button class="addbtn" id="homeStart">+</button></div>`;
  return `<section class="screen"><div class="row spread"><div><div class="eyebrow">TRAINING / LOG</div><div class="title" style="margin:5px 0 0;font-size:29px">${ruDate(now,{weekday:'long',day:'numeric',month:'long'}).replace(/^./,char=>char.toLowerCase())}</div></div><button class="iconbtn" id="theme" aria-label="Тема приложения">${state.theme==='light'?'☀':state.theme==='dark'?'☾':'◐'}</button></div><div class="hero"><h1>${todayPlanName?`СЕГОДНЯ<br>${escapeHTML(todayPlanName.toUpperCase())}`:'СЕГОДНЯ<br>ОТДЫХ'}</h1><p>${todayPlanName?'Тренировка определена автоматически по дню недели.':'День восстановления. Следующая тренировка уже в плане.'}</p></div><div class="card week">${days}</div>${current}<div class="section">ЭТА НЕДЕЛЯ</div><div class="card"><div class="metric"><b>${completedWeek}</b><small>${workoutWord(completedWeek)}</small></div></div></section>${nav('home')}`;
}

function workouts(){
  let actions=`<div class="row gap">${state.templates.length>1?`<button class="iconbtn" id="toggleReorder" aria-label="${state.reordering?'Закончить сортировку':'Изменить порядок'}">${state.reordering?'✓':'↕'}</button>`:''}<button class="addbtn" id="addTemplate" aria-label="Создать программу">+</button></div>`;
  let cards=state.templates.map((template,index)=>`<article class="card template"><div class="row spread"><span class="index">${String(index+1).padStart(2,'0')}</span><div class="action-menu">${state.reordering?`<button class="iconbtn moveTemplate" data-index="${index}" data-dir="-1" ${index===0?'disabled':''}>↑</button><button class="iconbtn moveTemplate" data-index="${index}" data-dir="1" ${index===state.templates.length-1?'disabled':''}>↓</button>`:`<button class="iconbtn editTemplate" data-index="${index}" aria-label="Редактировать">•••</button>`}</div></div><h2>${escapeHTML(template.name.toUpperCase())}</h2><span class="muted schedule-label">▣ ${weekdayTitle(template.weekday)}</span><div class="chips">${template.exercises.length?template.exercises.slice(0,3).map(exercise=>`<span class="chip">${escapeHTML(exercise.name)}</span>`).join(''):'<span class="muted">Упражнения добавишь сам</span>'}</div><button class="primary full start" data-index="${index}" ${state.reordering?'disabled':''}>НАЧАТЬ <span style="float:right">↗</span></button></article>`).join('');
  return `<section class="screen">${header('ПРОГРАММЫ','Тренировки',actions)}${state.templates.length?cards:`<div class="card empty"><div style="font-size:34px;color:var(--ink)">·—·—·</div><h3 style="color:var(--ink)">Собери первую программу</h3><p>Добавь упражнения, число подходов, повторения и целевой RIR.</p><button class="primary" id="emptyAdd">СОЗДАТЬ ПРОГРАММУ</button></div>`}</section>${nav('workouts')}`;
}

function editor(editing=false){
  return `<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="cancel">×</button><b>${editing?'Редактировать программу':'Новая программа'}</b><button class="primary" id="saveTemplate">СОХРАНИТЬ</button></div><div class="card"><div class="label" style="margin-top:0">НАЗВАНИЕ ПРОГРАММЫ</div><input class="field" id="tname" placeholder="Например: Спина + бицепс"><div class="label">ДЕНЬ ТРЕНИРОВКИ</div><select class="field" id="tweekday"><option value="">Без расписания</option>${weekdayOptions.map(option=>`<option value="${option.value}">${option.title}</option>`).join('')}</select><small class="muted" style="margin-top:10px">В выбранный день приложение само покажет эту программу в блоке «Сегодня». Запустить её можно на любую дату.</small></div>${editing?'<div class="editor-note"><span>◇</span><span>Изменения применятся к будущим тренировкам. История останется без изменений.</span></div>':''}<div class="section">УПРАЖНЕНИЯ</div><div id="drafts"></div><button class="primary full" id="addExercise" style="background:#3bd67b;color:#0b1710">+ ДОБАВИТЬ УПРАЖНЕНИЕ</button></div>`;
}
function draft(exercise={name:'',sets:3,reps:10,rir:2},index=0){return `<div class="exercise-draft"><div class="row spread"><span class="eyebrow">УПРАЖНЕНИЕ ${index+1}</span><button class="iconbtn danger removeDraft" aria-label="Удалить упражнение">×</button></div><input class="field ename" placeholder="Название упражнения" value="${escapeHTML(exercise.name)}" style="margin-top:10px"><div class="triples"><label>ПОДХОДЫ<input class="sets" type="number" min="1" max="10" value="${exercise.sets??3}"></label><label>ПОВТОРЫ<input class="reps" type="number" min="1" max="50" value="${exercise.reps??10}"></label><label>RIR<input class="rir" type="number" min="0" max="5" value="${exercise.rir??2}"></label></div></div>`}

function calendar(){
  let cursor=state.calendarCursor,year=cursor.getFullYear(),month=cursor.getMonth(),first=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate(),selectedISO=localISO(state.selectedDate);
  let doneDates=new Set(state.sessions.filter(session=>session.done).map(session=>session.date));
  let plannedDates=new Set(state.sessions.filter(session=>!session.done).map(session=>session.date));
  let cells=Array.from({length:days},(_,index)=>{let day=index+1,date=new Date(year,month,day),iso=localISO(date),done=doneDates.has(iso),planned=plannedDates.has(iso)||state.templates.some(template=>template.weekday===weekdayNumber(date));return `<button class="calday ${iso===selectedISO?'active':''} ${done?'done':''}" data-cal-date="${iso}">${day}${done?' ✓':planned?'<i class="planned-dot"></i>':''}</button>`}).join('');
  let daySessions=state.sessions.map((session,index)=>({session,index})).filter(item=>item.session.date===selectedISO);
  let existingIds=new Set(daySessions.map(item=>item.session.templateId));
  let scheduled=state.templates.map((template,index)=>({template,index})).filter(item=>item.template.weekday===weekdayNumber(state.selectedDate)&&!existingIds.has(item.template.id));
  let details=daySessions.map(({session,index})=>`<div class="day-session"><button class="session-main openCalendarSession" data-session="${index}"><span class="session-symbol">${session.done?'✓':'▶'}</span><span><b>${escapeHTML(session.name)}</b><small class="muted">${session.done?`${countDone(session)} подходов`:'В процессе'}</small></span><span class="open-arrow">›</span></button>${session.done?'':`<button class="iconbtn danger removeCalendarSession" data-session="${index}" aria-label="Убрать тренировку">•••</button>`}</div>`).join('')+scheduled.map(({template,index})=>`<button class="day-session session-main scheduledStart" data-index="${index}"><span class="session-symbol">◷</span><span><b>${escapeHTML(template.name)}</b><small class="muted">По расписанию · ${template.exercises.length} упражнений</small></span><span class="open-arrow">▶</span></button>`).join('');
  return `<section class="screen"><div class="eyebrow">КАЛЕНДАРЬ</div><div class="row spread" style="margin:12px 8px 17px"><button class="iconbtn" id="prevMonth">‹</button><div class="title" style="font-size:27px;margin:0">${ruDate(cursor,{month:'long',year:'numeric'})}</div><button class="iconbtn" id="nextMonth">›</button></div><div class="card calendar">${['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС'].map(day=>`<span class="eyebrow" style="font-size:8px">${day}</span>`).join('')}${'<i></i>'.repeat(first)}${cells}</div><div class="card"><div class="row spread"><div><b style="font-size:19px">${ruDate(state.selectedDate,{weekday:'long'})}</b><span class="muted">${ruDate(state.selectedDate,{day:'numeric',month:'long'})}</span></div><button class="addbtn" id="calendarAdd" ${state.templates.length?'':'disabled'}>+</button></div>${details||`<div class="empty">${state.templates.length?'На этот день ничего не запланировано':'Сначала создай программу во вкладке «Тренировки»'}${state.templates.length?'<br><button class="primary" id="calendarEmptyAdd" style="margin-top:15px">+ ДОБАВИТЬ ТРЕНИРОВКУ</button>':''}</div>`}</div></section>${nav('calendar')}`;
}

function session(){
  let session=state.active,canEdit=!session.done||state.editingCompleted,status=session.done?(state.editingCompleted?'РЕДАКТИРОВАНИЕ ТРЕНИРОВКИ':'ТРЕНИРОВКА ЗАВЕРШЕНА'):'РАБОЧАЯ СЕССИЯ';
  let exercises=session.exercises.map((exercise,exerciseIndex)=>`<div class="card exercise"><div class="row spread"><h2>${escapeHTML(exercise.name.toUpperCase())}</h2><div class="row gap"><button class="iconbtn history-alert exerciseHistory" data-e="${exerciseIndex}" aria-label="Прошлые подходы">!</button><span class="index">${exercise.sets.filter(set=>set.done).length}/${exercise.sets.length}</span>${canEdit?`<button class="iconbtn danger deleteSessionExercise" data-e="${exerciseIndex}" aria-label="Удалить упражнение">•••</button>`:''}</div></div><div class="sethead"><span>#</span><span>КГ</span><span>ПОВТ</span><span>RIR</span><span></span><span></span></div>${exercise.sets.map((set,setIndex)=>`<div class="setrow"><b>${setIndex+1}</b><input ${canEdit?'':'disabled'} data-e="${exerciseIndex}" data-s="${setIndex}" data-k="weight" inputmode="decimal" value="${set.weight}"><input ${canEdit?'':'disabled'} data-e="${exerciseIndex}" data-s="${setIndex}" data-k="reps" inputmode="numeric" value="${set.reps}"><input ${canEdit?'':'disabled'} data-e="${exerciseIndex}" data-s="${setIndex}" data-k="rir" inputmode="numeric" value="${set.rir}"><button ${canEdit?'':'disabled'} class="check ${set.done?'done':''}" data-check="${exerciseIndex},${setIndex}">${set.done?'✓':'○'}</button>${canEdit&&exercise.sets.length>1?`<button class="delete-set" data-delete-set="${exerciseIndex},${setIndex}">−</button>`:'<span></span>'}</div>`).join('')}${canEdit?`<textarea class="field note-field exercise-note" data-exercise-note="${exerciseIndex}" placeholder="Заметка к упражнению">${escapeHTML(exercise.notes)}</textarea><button class="iconbtn addSet" data-e="${exerciseIndex}" style="width:100%;height:38px">+ Ещё подход</button>`:exercise.notes?`<span class="muted">▤ ${escapeHTML(exercise.notes)}</span>`:''}</div>`).join('');
  let footer=session.done?(state.editingCompleted?'<button class="primary finish" id="saveCompleted">СОХРАНИТЬ ИЗМЕНЕНИЯ <span style="float:right">✓</span></button>':'<button class="primary finish" id="editCompleted">РЕДАКТИРОВАТЬ <span style="float:right">✎</span></button>'):'<button class="primary finish" id="finish">ЗАВЕРШИТЬ ТРЕНИРОВКУ <span style="float:right">→</span></button>';
  return `<section class="screen" style="padding-top:48px"><div class="row spread session-top"><button class="iconbtn" id="closeSession">×</button><b>${escapeHTML(session.name)}</b>${canEdit?'<button class="iconbtn" id="addSessionExercise">+</button>':'<span style="width:44px"></span>'}</div><div class="card" style="margin-top:18px"><div class="row spread"><div><div class="eyebrow">${status}</div><h3 style="margin:8px 0">${ruDate(dateFromISO(session.date),{day:'numeric',month:'long',weekday:'long'})}</h3></div><span class="session-duration">${timeCode(sessionDuration(session))}</span></div><hr style="border:0;border-top:1px solid var(--line)">${session.done?'':`<button class="primary full" id="restTimer" style="margin-bottom:14px"><span>${state.restEnd&&state.restSessionId===session.id?'◷ ОТДЫХ':'▶ ТАЙМЕР ОТДЫХА'}</span><span class="resttime" style="float:right">${restText()}</span></button>`}<span>${countDone(session)} подходов</span></div>${exercises}${canEdit?'<button class="iconbtn" id="addSessionExerciseBottom" style="width:100%;height:50px">+ Добавить упражнение</button>':''}<div class="card"><div class="label" style="margin-top:0">ЗАМЕТКА</div><textarea class="field note-field" id="sessionNotes" ${canEdit?'':'disabled'} placeholder="Как прошла тренировка?">${escapeHTML(session.notes)}</textarea></div>${session.done&&state.editingCompleted?'<button class="iconbtn danger" id="deleteCompleted" style="width:100%;height:50px">Удалить тренировку</button>':''}<div style="height:65px"></div></section>${footer}`;
}

function historyProgramKey(session){return session.templateId?`template:${session.templateId}`:`name:${session.name.toLowerCase()}`}
function history(){
  let done=state.sessions.filter(session=>session.done).sort((a,b)=>String(b.completedAt||b.date).localeCompare(String(a.completedAt||a.date))),programs=[];
  done.forEach(session=>{let key=historyProgramKey(session);if(!programs.some(program=>program.key===key))programs.push({key,name:session.name})});
  if(!programs.some(program=>program.key===state.chartProgram))state.chartProgram=programs[0]?.key??null;
  let programSessions=done.filter(session=>historyProgramKey(session)===state.chartProgram).reverse(),names=[...new Set(programSessions.flatMap(session=>session.exercises.map(exercise=>exercise.name)))];
  if(!names.includes(state.chartExercise))state.chartExercise=names[0]??null;
  let rows=done.map(session=>{let index=state.sessions.indexOf(session),date=dateFromISO(session.date);return `<button class="card history-row openHistory" data-session="${index}"><span class="datebox">${date.getDate()}<small>${ruDate(date,{month:'short'}).replace('.','').toUpperCase()}</small></span><span><b>${escapeHTML(session.name)}</b><span class="muted">${countDone(session)} подходов</span></span><span class="open-arrow">›</span></button>`}).join('');
  return `<section class="screen">${header('ПРОГРЕСС','История')}<div class="card metric-grid"><div class="metric-big"><b>${done.length}</b><span class="muted">${workoutWord(done.length)}</span></div><div class="metric-big"><b>${totalVolume(done)}</b><span class="muted">общий тоннаж, кг</span></div></div><button class="card file-export" id="openFiles"><span class="file-box">⇩</span><span><b>ФАЙЛЫ И РЕЗЕРВНАЯ КОПИЯ</b><small class="muted">JSON, CSV и восстановление данных</small></span><span class="share-arrow">›</span></button>${programs.length?weightProgress(programs,names,programSessions):''}<div class="section">ПОСЛЕДНИЕ ТРЕНИРОВКИ</div>${rows||'<div class="card empty">Заверши первую тренировку — здесь появится история и график прогресса.</div>'}</section>${nav('history')}`;
}
function weightProgress(programs,names,sessions){
  let selected=state.chartExercise,program=programs.find(item=>item.key===state.chartProgram),points=sessions.map((session,index)=>{let exercise=session.exercises.find(item=>item.name===selected),sets=exercise?.sets.filter(set=>set.done)??[];return sets.length?{weight:Math.max(...sets.map(set=>Number(set.weight)||0)),label:`#${index+1}`}:null}).filter(Boolean),weights=points.map(point=>point.weight),latest=weights.at(-1)??0,delta=weights.length>1?latest-weights.at(-2):0,rawMin=Math.min(...weights),rawMax=Math.max(...weights),min=rawMin===rawMax?Math.max(0,rawMin-5):rawMin,max=rawMin===rawMax?rawMax+5:rawMax,range=Math.max(1,max-min),coords=points.map((point,index)=>({x:points.length===1?160:18+index*(284/(points.length-1)),y:145-((point.weight-min)/range)*112,...point})),polyline=coords.map(point=>`${point.x},${point.y}`).join(' ');
  return `<div class="card"><div class="row spread"><div><div class="eyebrow">ПРОГРЕСС ВЕСА</div><b>${escapeHTML(program?.name||'Программа')}</b><span class="muted">${escapeHTML(selected||'')}</span></div><div style="text-align:right"><b style="font-size:22px">${latest} кг</b>${weights.length>1?`<span class="muted delta-up">${delta>=0?'+':''}${delta} кг</span>`:''}</div></div><div class="label">ПРОГРАММА</div><div class="chart-tabs">${programs.map((item,index)=>`<button class="chart-tab ${item.key===state.chartProgram?'active':''}" data-chart-program="${index}">${escapeHTML(item.name)}</button>`).join('')}</div><div class="label">УПРАЖНЕНИЕ</div><div class="chart-tabs">${names.map((name,index)=>`<button class="chart-tab ${name===selected?'active':''}" data-chart-exercise="${index}">${escapeHTML(name)}</button>`).join('')}</div>${points.length?`<svg class="weight-chart" viewBox="0 0 320 175"><line class="grid" x1="18" y1="33" x2="302" y2="33"/><line class="grid" x1="18" y1="89" x2="302" y2="89"/><line class="grid" x1="18" y1="145" x2="302" y2="145"/><polyline class="line" points="${polyline}"/>${coords.map(point=>`<circle class="point" cx="${point.x}" cy="${point.y}" r="6"/><text x="${point.x}" y="${point.y-12}" text-anchor="middle">${point.weight}</text><text x="${point.x}" y="164" text-anchor="middle">${point.label}</text>`).join('')}</svg><span class="muted">Максимальный выполненный вес по каждой тренировке.</span>`:'<div class="empty">Нет выполненных подходов с этим упражнением.</div>'}</div>`;
}

function persistentRestBar(){
  if(!state.restEnd||state.screen==='session')return '';
  let session=state.sessions.find(item=>item.id===state.restSessionId);
  return `<div class="restbar"><span style="color:#3bd67b">◷</span><span><span class="eyebrow" style="font-size:9px">ОТДЫХ</span><small class="muted">${escapeHTML(session?.name||'Тренировка')}</small></span><b class="resttime">${restText()}</b><button id="stopRest">×</button></div>`;
}
function render(){
  applyTheme();app.innerHTML=state.screen==='home'?home():state.screen==='workouts'?workouts():state.screen==='calendar'?calendar():state.screen==='history'?history():session();app.insertAdjacentHTML('beforeend',persistentRestBar());bind();
}

function bind(){
  document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>{state.screen=button.dataset.nav;render()});
  $('#theme')?.addEventListener('click',openThemePicker);$('#homeStart')?.addEventListener('click',()=>{state.screen='workouts';render()});
  document.querySelectorAll('[data-week-date]').forEach(button=>button.onclick=()=>{state.selectedDate=dateFromISO(button.dataset.weekDate);state.calendarCursor=new Date(state.selectedDate.getFullYear(),state.selectedDate.getMonth(),1);state.screen='calendar';render()});
  $('#openToday')?.addEventListener('click',()=>{let session=[...state.sessions].reverse().find(item=>item.date===todayISO());openSession(state.sessions.indexOf(session))});
  $('#toggleReorder')?.addEventListener('click',()=>{state.reordering=!state.reordering;render()});
  $('#addTemplate')?.addEventListener('click',()=>openEditor());$('#emptyAdd')?.addEventListener('click',()=>openEditor());
  document.querySelectorAll('.editTemplate').forEach(button=>button.onclick=()=>openTemplateMenu(Number(button.dataset.index)));
  document.querySelectorAll('.moveTemplate').forEach(button=>button.onclick=()=>moveTemplate(Number(button.dataset.index),Number(button.dataset.dir)));
  document.querySelectorAll('.start').forEach(button=>button.onclick=()=>startTemplate(Number(button.dataset.index),todayISO()));
  $('#prevMonth')?.addEventListener('click',()=>shiftMonth(-1));$('#nextMonth')?.addEventListener('click',()=>shiftMonth(1));
  document.querySelectorAll('[data-cal-date]').forEach(button=>button.onclick=()=>{state.selectedDate=dateFromISO(button.dataset.calDate);render()});
  $('#calendarAdd')?.addEventListener('click',openTemplatePicker);$('#calendarEmptyAdd')?.addEventListener('click',openTemplatePicker);
  document.querySelectorAll('.scheduledStart').forEach(button=>button.onclick=()=>startTemplate(Number(button.dataset.index),localISO(state.selectedDate)));
  document.querySelectorAll('.openCalendarSession').forEach(button=>button.onclick=()=>openSession(Number(button.dataset.session)));
  document.querySelectorAll('.removeCalendarSession').forEach(button=>button.onclick=()=>confirmRemoveCalendar(Number(button.dataset.session)));
  document.querySelectorAll('.openHistory').forEach(button=>button.onclick=()=>openSession(Number(button.dataset.session)));
  $('#openFiles')?.addEventListener('click',openFileManager);
  bindChart();bindSession();
  $('#stopRest')?.addEventListener('click',stopRestTimer);
}

function bindChart(){
  document.querySelectorAll('[data-chart-program]').forEach(button=>button.onclick=()=>{let done=state.sessions.filter(session=>session.done),programs=[];done.forEach(session=>{let key=historyProgramKey(session);if(!programs.some(item=>item.key===key))programs.push({key,name:session.name})});state.chartProgram=programs[Number(button.dataset.chartProgram)]?.key??null;state.chartExercise=null;render()});
  document.querySelectorAll('[data-chart-exercise]').forEach(button=>button.onclick=()=>{let sessions=state.sessions.filter(session=>session.done&&historyProgramKey(session)===state.chartProgram),names=[...new Set(sessions.flatMap(session=>session.exercises.map(exercise=>exercise.name)))];state.chartExercise=names[Number(button.dataset.chartExercise)];render()});
}

function bindSession(){
  if(state.screen!=='session'||!state.active)return;
  $('#closeSession')?.addEventListener('click',closeSession);$('#editCompleted')?.addEventListener('click',()=>{state.editingCompleted=true;render()});
  $('#saveCompleted')?.addEventListener('click',()=>{state.editingCompleted=false;persist();state.screen='history';render();toast('Изменения сохранены')});
  $('#finish')?.addEventListener('click',confirmFinish);$('#deleteCompleted')?.addEventListener('click',confirmDeleteCompleted);
  $('#restTimer')?.addEventListener('click',()=>state.restEnd&&state.restSessionId===state.active.id?stopRestTimer():startRestTimer());
  $('#addSessionExercise')?.addEventListener('click',openSessionExerciseEditor);$('#addSessionExerciseBottom')?.addEventListener('click',openSessionExerciseEditor);
  document.querySelectorAll('.exerciseHistory').forEach(button=>button.onclick=()=>openPreviousWorkouts(Number(button.dataset.e)));
  document.querySelectorAll('.deleteSessionExercise').forEach(button=>button.onclick=()=>confirmDeleteExercise(Number(button.dataset.e)));
  document.querySelectorAll('[data-check]').forEach(button=>button.onclick=()=>{let [exerciseIndex,setIndex]=button.dataset.check.split(',').map(Number),set=state.active.exercises[exerciseIndex].sets[setIndex],willComplete=!set.done;set.done=willComplete;if(willComplete)startRestTimer();persist();render()});
  document.querySelectorAll('[data-delete-set]').forEach(button=>button.onclick=()=>{let [exerciseIndex,setIndex]=button.dataset.deleteSet.split(',').map(Number),sets=state.active.exercises[exerciseIndex].sets;if(sets.length>1)sets.splice(setIndex,1);persist();render()});
  document.querySelectorAll('.addSet').forEach(button=>button.onclick=()=>{let exercise=state.active.exercises[Number(button.dataset.e)],last=exercise.sets.at(-1)||{weight:0,reps:10,rir:2};exercise.sets.push({id:uid(),weight:last.weight,reps:last.reps,rir:last.rir,done:false,number:exercise.sets.length+1});persist();render()});
  document.querySelectorAll('.setrow input').forEach(input=>input.oninput=()=>{let exercise=state.active.exercises[Number(input.dataset.e)],set=exercise.sets[Number(input.dataset.s)],value=Number(String(input.value).replace(',','.'))||0;set[input.dataset.k]=input.dataset.k==='weight'?Math.max(0,value):input.dataset.k==='rir'?Math.min(5,Math.max(0,Math.round(value))):Math.max(0,Math.round(value));persist()});
  document.querySelectorAll('[data-exercise-note]').forEach(field=>field.oninput=()=>{state.active.exercises[Number(field.dataset.exerciseNote)].notes=field.value;persist()});
  $('#sessionNotes')?.addEventListener('input',event=>{state.active.notes=event.target.value;persist()});
}

function openThemePicker(){
  app.insertAdjacentHTML('beforeend',`<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="closeTheme">×</button><b>Тема приложения</b><span class="index">ВИД</span></div><div class="theme-options">${[['system','◐','Как на iPhone'],['light','☀','Светлая'],['dark','☾','Тёмная']].map(([value,icon,title])=>`<button class="theme-option ${state.theme===value?'active':''}" data-theme-choice="${value}"><span>${icon} &nbsp;${title}</span><span>${state.theme===value?'✓':''}</span></button>`).join('')}</div></div>`);$('#closeTheme').onclick=()=>$('.modal').remove();document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{state.theme=button.dataset.themeChoice;persist();$('.modal').remove();render()})
}
function openEditor(editIndex=null){
  let editing=editIndex!==null,existing=editing?state.templates[editIndex]:null;app.insertAdjacentHTML('beforeend',editor(editing));$('#tname').value=existing?.name||'';$('#tweekday').value=existing?.weekday||'';let source=existing?.exercises?.length?existing.exercises:[{name:'',sets:3,reps:10,rir:2}];$('#drafts').innerHTML=source.map((item,index)=>draft(item,index)).join('');
  let refreshDrafts=()=>document.querySelectorAll('.removeDraft').forEach(button=>button.onclick=()=>{let cards=[...document.querySelectorAll('.exercise-draft')];if(cards.length===1){toast('Оставь хотя бы одно поле упражнения');return}button.closest('.exercise-draft').remove()});refreshDrafts();
  $('#addExercise').onclick=()=>{$('#drafts').insertAdjacentHTML('beforeend',draft({},document.querySelectorAll('.exercise-draft').length));refreshDrafts()};$('#cancel').onclick=()=>$('.modal').remove();
  $('#saveTemplate').onclick=()=>{let name=$('#tname').value.trim();if(!name){toast('Добавь название программы');return}let exercises=[...document.querySelectorAll('.exercise-draft')].map(card=>({id:uid(),name:card.querySelector('.ename').value.trim(),sets:Math.min(10,Math.max(1,Number(card.querySelector('.sets').value)||1)),reps:Math.min(50,Math.max(0,Number(card.querySelector('.reps').value)||0)),rir:Math.min(5,Math.max(0,Number(card.querySelector('.rir').value)||0))})).filter(item=>item.name);let updated={id:existing?.id||uid(),name,weekday:Number($('#tweekday').value)||null,exercises};if(editing)state.templates[editIndex]=updated;else state.templates.push(updated);persist();$('.modal').remove();render();toast(editing?'Программа обновлена':'Программа сохранена')};
}
function openTemplateMenu(index){let template=state.templates[index];app.insertAdjacentHTML('beforeend',`<div class="modal" style="display:grid;align-content:center"><div class="card confirm-card"><div class="eyebrow">${escapeHTML(template.name)}</div><h2>Действия с программой</h2><button class="primary full" id="menuEdit">РЕДАКТИРОВАТЬ</button><button class="iconbtn danger" id="menuDelete" style="width:100%;margin-top:10px">Удалить программу</button><button class="iconbtn" id="menuCancel" style="width:100%;margin-top:10px">Отмена</button></div></div>`);$('#menuEdit').onclick=()=>{$('.modal').remove();openEditor(index)};$('#menuDelete').onclick=()=>{state.templates.splice(index,1);persist();$('.modal').remove();render();toast('Программа удалена')};$('#menuCancel').onclick=()=>$('.modal').remove()}
function moveTemplate(index,direction){let target=index+direction;if(target<0||target>=state.templates.length)return;[state.templates[index],state.templates[target]]=[state.templates[target],state.templates[index]];persist();render()}
function shiftMonth(amount){state.calendarCursor=new Date(state.calendarCursor.getFullYear(),state.calendarCursor.getMonth()+amount,1);state.selectedDate=new Date(state.calendarCursor);render()}
function openTemplatePicker(){app.insertAdjacentHTML('beforeend',`<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="closePicker">×</button><b>Выбрать программу</b><span class="index">${ruDate(state.selectedDate,{day:'numeric',month:'short'})}</span></div><div class="picker-list">${state.templates.map((template,index)=>`<button class="picker-row pickTemplate" data-index="${index}"><span class="session-symbol">▣</span><span><b>${escapeHTML(template.name)}</b><small class="muted">${template.exercises.length} упражнений · ${weekdayTitle(template.weekday)}</small></span></button>`).join('')}</div></div>`);$('#closePicker').onclick=()=>$('.modal').remove();document.querySelectorAll('.pickTemplate').forEach(button=>button.onclick=()=>{let index=Number(button.dataset.index);$('.modal').remove();startTemplate(index,localISO(state.selectedDate))})}
function startTemplate(index,date){
  let template=state.templates[index],existing=state.sessions.find(session=>session.templateId===template.id&&!session.done&&session.date===date);if(existing){openSession(state.sessions.indexOf(existing));return}
  let previous=[...state.sessions].reverse().find(session=>session.templateId===template.id&&session.done),exercises=template.exercises.map(item=>({id:uid(),name:item.name,notes:'',sets:Array.from({length:item.sets},(_,setIndex)=>{let old=previous?.exercises.find(exercise=>exercise.name.toLowerCase()===item.name.toLowerCase())?.sets[setIndex];return {id:uid(),weight:old?.weight||0,reps:old?.reps??item.reps,rir:old?.rir??item.rir,done:false,number:setIndex+1}})}));
  let session={id:uid(),templateId:template.id,name:template.name,date,done:false,completedAt:null,durationSeconds:0,notes:'',exercises};state.sessions.push(session);state.active=session;state.sessionOpenedAt=Date.now();state.editingCompleted=false;state.screen='session';persist();if(telegramSupports('6.1'))telegram.HapticFeedback.impactOccurred('medium');render();
}
function openSession(index){let session=state.sessions[index];if(!session)return;state.active=session;state.sessionOpenedAt=Date.now();state.editingCompleted=false;state.screen='session';render()}
function closeSession(){if(state.active&&!state.active.done){state.active.durationSeconds=sessionDuration(state.active);state.sessionOpenedAt=Date.now();persist()}state.screen=state.active?.done?'history':'home';render()}
function confirmRemoveCalendar(index){let session=state.sessions[index];app.insertAdjacentHTML('beforeend',confirmModal('Убрать тренировку с этого дня?','Сохранённая программа останется доступна, а история не изменится.','УБРАТЬ','confirmRemove'));$('#cancelConfirm').onclick=()=>$('.modal').remove();$('#confirmRemove').onclick=()=>{state.sessions.splice(index,1);if(state.active===session)state.active=null;persist();$('.modal').remove();render();toast('Тренировка убрана с этого дня')}}
function confirmModal(title,message,action,id){return `<div class="modal" style="display:grid;align-content:center"><div class="card confirm-card"><div class="eyebrow">ПОДТВЕРЖДЕНИЕ</div><h2>${title}</h2><p class="muted" style="font-size:13px;margin-bottom:20px">${message}</p><div class="row gap"><button class="iconbtn" id="cancelConfirm" style="flex:1;width:auto">Отмена</button><button class="primary" id="${id}" style="flex:1;background:#e33d4f;color:white">${action}</button></div></div></div>`}
function confirmFinish(){app.insertAdjacentHTML('beforeend',confirmModal('Завершить тренировку?',`Отмечено подходов: ${countDone(state.active)}.`,'ЗАВЕРШИТЬ','confirmFinish'));$('#cancelConfirm').onclick=()=>$('.modal').remove();$('#confirmFinish').onclick=()=>{let session=state.active;session.durationSeconds=sessionDuration(session);session.done=true;session.completedAt=new Date().toISOString();state.sessionOpenedAt=Date.now();stopRestTimer(false);state.editingCompleted=false;state.screen='history';persist();$('.modal')?.remove();render();toast('Тренировка сохранена')}}
function confirmDeleteCompleted(){app.insertAdjacentHTML('beforeend',confirmModal('Удалить эту тренировку?','Запись исчезнет из истории и графика. Программа останется.','УДАЛИТЬ','confirmDelete'));$('#cancelConfirm').onclick=()=>$('.modal').remove();$('#confirmDelete').onclick=()=>{let index=state.sessions.indexOf(state.active);if(index>=0)state.sessions.splice(index,1);state.active=null;state.screen='history';persist();render();toast('Тренировка удалена')}}
function confirmDeleteExercise(index){app.insertAdjacentHTML('beforeend',confirmModal('Удалить упражнение?','Все его подходы исчезнут из этой тренировки.','УДАЛИТЬ','confirmExerciseDelete'));$('#cancelConfirm').onclick=()=>$('.modal').remove();$('#confirmExerciseDelete').onclick=()=>{state.active.exercises.splice(index,1);persist();$('.modal').remove();render();toast('Упражнение удалено')}}

function startRestTimer(){state.restEnd=Date.now()+90000;state.restSessionId=state.active?.id||null;persist();render()}
function stopRestTimer(shouldRender=true){state.restEnd=0;state.restSessionId=null;persist();if(shouldRender)render()}
function restText(){let left=Math.max(0,Math.ceil((state.restEnd-Date.now())/1000));return `${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`}

function openPreviousWorkouts(exerciseIndex){
  let current=state.active,exercise=current.exercises[exerciseIndex],previous=state.sessions.filter(session=>session!==current&&session.done&&(session.templateId===current.templateId||session.name.toLowerCase()===current.name.toLowerCase())&&session.exercises.some(item=>item.name.toLowerCase()===exercise.name.toLowerCase())).sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt))).slice(0,2);
  let body=previous.length?`<div class="segmented">${previous.map((session,index)=>`<button class="segment ${index===0?'active':''}" data-previous-tab="${index}">${index===0?'ПОСЛЕДНЯЯ':'ПРЕДЫДУЩАЯ'}<br><b>${ruDate(dateFromISO(session.date),{day:'numeric',month:'short'})}</b></button>`).join('')}</div><div id="previousContent"></div>`:`<div class="card empty"><div style="font-size:38px">◷</div><h3 style="color:var(--ink)">Записей по упражнению пока нет</h3><p>После завершения тренировки здесь появятся две последние записи для «${escapeHTML(exercise.name)}».</p></div>`;
  app.insertAdjacentHTML('beforeend',`<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="closePrevious">×</button><b>${escapeHTML(exercise.name)}</b><span class="index">ИСТОРИЯ</span></div>${body}</div>`);$('#closePrevious').onclick=()=>$('.modal').remove();
  let draw=index=>{let session=previous[index],old=session?.exercises.find(item=>item.name.toLowerCase()===exercise.name.toLowerCase());if(!old)return;$('#previousContent').innerHTML=`<div class="card" style="margin-top:14px"><div class="eyebrow">${index===0?'ПРОШЛАЯ ТРЕНИРОВКА':'ДВЕ ТРЕНИРОВКИ НАЗАД'}</div><h2>${ruDate(dateFromISO(session.date),{day:'numeric',month:'long',year:'numeric'})}</h2><span>${old.sets.length} подходов</span></div><div class="card"><div class="row spread"><b>${escapeHTML(old.name.toUpperCase())}</b><span class="index">${old.sets.length} подх.</span></div><div class="previous-row previous-head"><span>#</span><span>ВЕС</span><span>ПОВТ</span><span>RIR</span></div>${old.sets.map((set,setIndex)=>`<div class="previous-row"><span>${setIndex+1}</span><span>${set.weight}</span><span>${set.reps}</span><span>${set.rir}</span></div>`).join('')}${old.notes?`<span class="muted">▤ ${escapeHTML(old.notes)}</span>`:''}</div>`};if(previous.length)draw(0);document.querySelectorAll('[data-previous-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-previous-tab]').forEach(item=>item.classList.toggle('active',item===button));draw(Number(button.dataset.previousTab))});
}
function openSessionExerciseEditor(){
  app.insertAdjacentHTML('beforeend',`<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="cancelSessionExercise">×</button><b>Добавить упражнение</b><button class="primary" id="saveSessionExercise">ДОБАВИТЬ</button></div><div class="exercise-draft"><div class="label" style="margin-top:0">НОВОЕ УПРАЖНЕНИЕ</div><input class="field" id="sessionExerciseName" placeholder="Название упражнения"><div class="triples"><label>ПОДХОДЫ<input id="sessionExerciseSets" type="number" min="1" max="10" value="3"></label><label>ПОВТОРЫ<input id="sessionExerciseReps" type="number" min="0" max="50" value="10"></label><label>RIR<input id="sessionExerciseRir" type="number" min="0" max="5" value="2"></label></div></div>${state.active.templateId?'<button class="program-option" id="saveExerciseToTemplate" role="checkbox" aria-checked="true"><span><b>Добавить в программу</b><small class="muted">Сохранить для следующего запуска</small></span><span class="greencheck">✓</span></button>':''}</div>`);let choice=$('#saveExerciseToTemplate');choice?.addEventListener('click',()=>choice.setAttribute('aria-checked',choice.getAttribute('aria-checked')==='true'?'false':'true'));$('#cancelSessionExercise').onclick=()=>$('.modal').remove();$('#saveSessionExercise').onclick=()=>{let name=$('#sessionExerciseName').value.trim(),sets=Math.min(10,Math.max(1,Number($('#sessionExerciseSets').value)||1)),reps=Math.min(50,Math.max(0,Number($('#sessionExerciseReps').value)||0)),rir=Math.min(5,Math.max(0,Number($('#sessionExerciseRir').value)||0));if(!name){toast('Введи название упражнения');return}state.active.exercises.push({id:uid(),name,notes:'',sets:Array.from({length:sets},(_,index)=>({id:uid(),weight:0,reps,rir,done:false,number:index+1}))});if(choice?.getAttribute('aria-checked')==='true'){let template=templateById(state.active.templateId);template?.exercises.push({id:uid(),name,sets,reps,rir})}persist();$('.modal').remove();render();toast('Упражнение добавлено')};
}
async function deliverFile(file,title){if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title});return}catch(error){if(error?.name==='AbortError')return}}let url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportCompletedWorkouts(){let done=state.sessions.filter(session=>session.done),csvEscape=value=>`"${String(value??'').replaceAll('"','""')}"`,rows=[];done.forEach(session=>session.exercises.forEach(exercise=>exercise.sets.forEach((set,index)=>{if(set.done)rows.push([session.date,session.name,exercise.name,index+1,set.weight,set.reps,set.rir,Math.round(session.durationSeconds/60),session.notes,exercise.notes].map(csvEscape).join(','))})));let csv='\uFEFFДата,Тренировка,Упражнение,Подход,Вес (кг),Повторы,RIR,Длительность (мин),Заметка тренировки,Заметка упражнения\n'+rows.join('\n');await deliverFile(new File([csv],`IronLog-history-${todayISO()}.csv`,{type:'text/csv;charset=utf-8'}),'IronLog — история тренировок');toast('Файл CSV готов')}
async function exportBackup(){await deliverFile(new File([JSON.stringify(snapshot(),null,2)],`IronLog-backup-${todayISO()}.json`,{type:'application/json'}),'IronLog — резервная копия');toast('Резервная копия готова')}
function openFileManager(){let user=telegram?.initDataUnsafe?.user,userBlock=user?`<div class="telegram-user"><span class="file-icon">◇</span><span>${escapeHTML([user.first_name,user.last_name].filter(Boolean).join(' '))}</span></div>`:'';app.insertAdjacentHTML('beforeend',`<div class="modal"><div class="modalhead row spread"><button class="iconbtn" id="closeFiles">×</button><b>Файлы IronLog</b><span class="index">LOCAL</span></div>${userBlock}<button class="card file-action" id="exportBackup"><span class="file-icon">⇩</span><span><strong>Резервная копия</strong><small>Все программы, заметки и тренировки в JSON</small></span></button><button class="card file-action" id="exportCsv"><span class="file-icon">≡</span><span><strong>История CSV</strong><small>Вес, повторы, RIR, длительность и заметки</small></span></button><label class="card file-action" for="importBackup"><span class="file-icon">⇧</span><span><strong>Восстановить из файла</strong><small>Выбери IronLog-backup.json</small></span></label><input id="importBackup" type="file" accept="application/json,.json" hidden><p class="privacy-note">Тренировочные данные хранятся локально. При запуске Telegram передаёт владельцу бота имя, username, ID и время входа.</p></div>`);$('#closeFiles').onclick=()=>$('.modal').remove();$('#exportBackup').onclick=exportBackup;$('#exportCsv').onclick=exportCompletedWorkouts;$('#importBackup').onchange=importBackupFile}
async function importBackupFile(event){let file=event.target.files?.[0];if(!file)return;try{let data=JSON.parse(await file.text());if(!Array.isArray(data.templates)||!Array.isArray(data.sessions))throw new Error('invalid');if(!confirm('Заменить текущие данные данными из файла?'))return;state.templates=normalizeTemplates(data.templates);state.sessions=normalizeSessions(data.sessions,state.templates);state.active=[...state.sessions].reverse().find(session=>!session.done)??null;state.screen='home';persist();render();toast('Данные восстановлены')}catch{alert('Не удалось прочитать файл IronLog.')}}
function toast(text){document.querySelector('.toast')?.remove();let element=document.createElement('div');element.className='toast';element.textContent=text;$('#phone').append(element);setTimeout(()=>element.remove(),1800)}
const VISIT_ENDPOINT='https://trainapp-telegram-bot.gxbycc.chatgpt.site/api/visit';
async function notifyOwnerOfVisit(){if(!telegram?.initData||sessionStorage.getItem('trainapp-visit-notified'))return;try{let response=await fetch(VISIT_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:telegram.initData}),keepalive:true});if(response.ok)sessionStorage.setItem('trainapp-visit-notified','1')}catch{}}
function initTelegram(){if(!telegram)return;telegram.ready();telegram.expand();notifyOwnerOfVisit();if(telegramSupports('7.7'))telegram.disableVerticalSwipes();if(telegramSupports('6.1')){telegram.setHeaderColor('bg_color');telegram.setBackgroundColor('bg_color')}document.addEventListener('click',event=>{if(telegramSupports('6.1')&&event.target.closest('button,label[for]'))telegram.HapticFeedback.selectionChanged()},{passive:true});if(!saved&&telegramSupports('9.0'))try{telegram.DeviceStorage.getItem(STORAGE_KEY,(error,value)=>{if(error||!value)return;try{let data=JSON.parse(value);state.templates=normalizeTemplates(data.templates);state.sessions=normalizeSessions(data.sessions,state.templates);render();toast('Данные Telegram загружены')}catch{}})}catch{}}

setInterval(()=>{
  let duration=document.querySelector('.session-duration');if(duration&&state.active)duration.textContent=timeCode(sessionDuration(state.active));
  if(!state.restEnd)return;let left=Math.max(0,Math.ceil((state.restEnd-Date.now())/1000));document.querySelectorAll('.resttime').forEach(element=>element.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`);if(left===0){state.restEnd=0;state.restSessionId=null;persist();render();toast('Пора начинать следующий подход')}
},250);

persist();render();initTelegram();
