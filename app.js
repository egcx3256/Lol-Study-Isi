const STORAGE_KEY = "study_xp_v2";
const BAR_SIZE = 500; // 500 XP = level bar
const XP_PER_MIN = 1;

// Market items
const STORE = [
  { id:"coffee", title:"Kahve", desc:"Kahve yap / iç", cost:50 },
  { id:"yt30", title:"30 dk YouTube", desc:"Ödül: 30 dk video", cost:200 },
  { id:"game30", title:"30 dk Gaming", desc:"Ödül: 30 dk oyun", cost:200 },
];

function dayKey(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function lastNDaysKeys(n){
  const arr = [];
  const now = new Date();
  for(let i=n-1;i>=0;i--){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    arr.push(dayKey(d));
  }
  return arr;
}

function defaultState(){
  const today = dayKey(new Date());
  return {
    totalXp: 0,
    lastDayKey: today,

    // Streak logic uses this
    streak: 0,
    lastActiveDayKey: null, // last day where minutes>0

    // Subjects
    subjects: ["Matematik","Fizik","Kimya","Biyoloji","Paragraf/Türkçe"],
    // Per day data: { "YYYY-MM-DD": { minutesTotal, xpTotal, subjects:{sub:minutes} } }
    days: {
      [today]: { minutesTotal: 0, xpTotal: 0, subjects: {} }
    },

    // Quests
    quests: [
      { id: "q1", title: "Paragraf / Türkçe", done: false },
      { id: "q2", title: "Matematik", done: false },
      { id: "q3", title: "Fizik", done: false },
      { id: "q4", title: "Kimya / Biyoloji", done: false },
    ],
    history: []
  };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    let st = raw ? JSON.parse(raw) : defaultState();

    // migrate old/empty fields
    if(!st.days) st.days = {};
    if(!st.subjects) st.subjects = ["Matematik","Fizik","Kimya","Biyoloji","Paragraf/Türkçe"];
    if(typeof st.streak !== "number") st.streak = 0;

    const today = dayKey(new Date());
    if(st.lastDayKey !== today){
      // new day actions
      st.lastDayKey = today;
      if(!st.days[today]) st.days[today] = { minutesTotal:0, xpTotal:0, subjects:{} };
      st.quests = st.quests.map(q => ({...q, done:false}));
      st.history.unshift(makeLog("Yeni gün başladı", 0));
    }

    // ensure today entry exists
    if(!st.days[today]) st.days[today] = { minutesTotal:0, xpTotal:0, subjects:{} };

    // clamp history
    if(!Array.isArray(st.history)) st.history = [];
    if(st.history.length > 100) st.history = st.history.slice(0,100);

    return st;
  }catch{
    return defaultState();
  }
}

function save(st){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
}

function uid(){
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
}

function makeLog(text, delta){
  return {
    id: uid(),
    time: new Date().toLocaleString("tr-TR"),
    text,
    delta
  };
}

let state = load();

/* ========= UI refs ========= */
const totalXpEl = document.getElementById("totalXp");
const barXpEl = document.getElementById("barXp");
const barSizeEl = document.getElementById("barSize");
const barFillEl = document.getElementById("barFill");
const levelEl = document.getElementById("level");
const levelHintEl = document.getElementById("levelHint");
const streakEl = document.getElementById("streak");

const subjectSelect = document.getElementById("subjectSelect");
const newSubjectInput = document.getElementById("newSubjectInput");
const addSubjectBtn = document.getElementById("addSubjectBtn");

const minutesInput = document.getElementById("minutesInput");
const addWorkBtn = document.getElementById("addWorkBtn");

const questsEl = document.getElementById("quests");
const completeAllBtn = document.getElementById("completeAllBtn");
const newDayBtn = document.getElementById("newDayBtn");

const todayMinutesEl = document.getElementById("todayMinutes");
const todayXpEl = document.getElementById("todayXp");
const todayBySubjectEl = document.getElementById("todayBySubject");
const todayDateEl = document.getElementById("todayDate");

const weekChart = document.getElementById("weekChart");
const weekMinutesEl = document.getElementById("weekMinutes");
const weekXpEl = document.getElementById("weekXp");

const storeEl = document.getElementById("store");
const historyEl = document.getElementById("history");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const resetBtn = document.getElementById("resetBtn");

/* ========= Helpers ========= */
function todayKey(){ return dayKey(new Date()); }

function getDayObj(key){
  if(!state.days[key]) state.days[key] = { minutesTotal:0, xpTotal:0, subjects:{} };
  if(!state.days[key].subjects) state.days[key].subjects = {};
  return state.days[key];
}

function addXp(amount, reason){
  amount = Math.round(amount);
  if(amount === 0) return;
  state.totalXp += amount;
  state.history.unshift(makeLog(reason, amount));
  if(state.history.length > 100) state.history = state.history.slice(0,100);
  save(state);
  render();
}

function spendXp(cost, reason){
  if(state.totalXp < cost) return false;
  state.totalXp -= cost;
  state.history.unshift(makeLog(reason, -cost));
  if(state.history.length > 100) state.history = state.history.slice(0,100);
  save(state);
  render();
  return true;
}

function allQuestsDone(){
  return state.quests.every(q => q.done);
}

/* ========= Streak =========
Rule: streak counts consecutive days where minutesTotal > 0
- If today becomes active and yesterday was active => streak++
- If today becomes active and yesterday was NOT active => streak=1
- Only update once per day
*/
function maybeUpdateStreakOnFirstWorkToday(){
  const tKey = todayKey();
  const day = getDayObj(tKey);
  if(day.minutesTotal <= 0) return; // not active yet

  // Already marked active for today?
  if(state.lastActiveDayKey === tKey) return;

  // Check yesterday
  const y = new Date();
  y.setDate(y.getDate()-1);
  const yKey = dayKey(y);
  const yDay = state.days[yKey];

  const yesterdayActive = !!(yDay && yDay.minutesTotal > 0);

  if(yesterdayActive && state.lastActiveDayKey === yKey){
    state.streak = (state.streak || 0) + 1;
  } else {
    state.streak = 1;
  }

  state.lastActiveDayKey = tKey;
  state.history.unshift(makeLog(`Streak güncellendi: ${state.streak} 🔥`, 0));
  save(state);
}

/* ========= Work / Subjects ========= */
function addWork(minutes, subject){
  const m = Math.max(1, Math.floor(minutes));
  const xp = m * XP_PER_MIN;

  const tKey = todayKey();
  const day = getDayObj(tKey);

  day.minutesTotal += m;
  day.xpTotal += xp;
  if(subject){
    day.subjects[subject] = (day.subjects[subject] || 0) + m;
  }

  // streak update if first work today
  maybeUpdateStreakOnFirstWorkToday();

  save(state);
  addXp(xp, `Çalışma (${subject || "Genel"}): ${m} dk (+${xp} XP)`);
}

/* ========= Subjects UI ========= */
function normalizeSubjectName(s){
  return (s || "").trim().replace(/\s+/g, " ");
}

function addSubject(name){
  const n = normalizeSubjectName(name);
  if(!n) return;
  const exists = state.subjects.some(x => x.toLowerCase() === n.toLowerCase());
  if(exists) return;
  state.subjects.push(n);
  state.history.unshift(makeLog(`Ders eklendi: ${n}`, 0));
  save(state);
  render();
}

function fillSubjects(){
  subjectSelect.innerHTML = "";
  state.subjects.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subjectSelect.appendChild(opt);
  });
}

/* ========= Weekly Chart ========= */
function drawWeekChart(){
  const ctx = weekChart.getContext("2d");
  // crisp
  const w = weekChart.width, h = weekChart.height;
  ctx.clearRect(0,0,w,h);

  const keys = lastNDaysKeys(7);
  const vals = keys.map(k => (state.days[k]?.minutesTotal || 0));
  const maxV = Math.max(30, ...vals); // baseline
  const pad = 28;
  const innerW = w - pad*2;
  const innerH = h - pad*2;

  // axes
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.stroke();

  // grid lines (3)
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for(let i=1;i<=3;i++){
    const y = pad + (innerH * (i/4));
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w-pad, y);
    ctx.stroke();
  }

  // bars
  const barGap = 14;
  const barW = (innerW - barGap*(vals.length-1)) / vals.length;

  for(let i=0;i<vals.length;i++){
    const v = vals[i];
    const bh = (v / maxV) * innerH;
    const x = pad + i*(barW+barGap);
    const y = (h-pad) - bh;

    // bar
    ctx.fillStyle = "rgba(110,231,255,0.70)";
    ctx.fillRect(x, y, barW, bh);

    // label day (DD)
    const d = keys[i].slice(-2);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(d, x + barW/2, h - 8);

    // value
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.fillText(String(v), x + barW/2, Math.max(pad+16, y-6));
  }

  // title
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "18px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial";
  ctx.textAlign = "left";
  ctx.fillText("Son 7 Gün (Dakika)", pad, 22);

  // totals
  const weekMin = vals.reduce((a,b)=>a+b,0);
  const weekXp = keys.reduce((a,k)=>a+(state.days[k]?.xpTotal||0),0);
  weekMinutesEl.textContent = weekMin;
  weekXpEl.textContent = weekXp;
}

/* ========= Render ========= */
function render(){
  // top numbers
  totalXpEl.textContent = state.totalXp;
  barSizeEl.textContent = BAR_SIZE;

  const level = Math.floor(state.totalXp / BAR_SIZE) + 1;
  const inBar = state.totalXp % BAR_SIZE;
  const pct = (inBar / BAR_SIZE) * 100;

  levelEl.textContent = level;
  barXpEl.textContent = inBar;
  barFillEl.style.width = `${pct}%`;

  const need = BAR_SIZE - inBar;
  levelHintEl.textContent = `Level ${level} → ${level+1} için ${need} XP kaldi.`;
  streakEl.textContent = state.streak || 0;

  // subjects
  fillSubjects();

  // today stats
  const tKey = todayKey();
  const day = getDayObj(tKey);
  todayMinutesEl.textContent = day.minutesTotal;
  todayXpEl.textContent = day.xpTotal;
  todayDateEl.textContent = tKey;

  // today by subject
  todayBySubjectEl.innerHTML = "";
  const entries = Object.entries(day.subjects || {}).sort((a,b)=>b[1]-a[1]);
  if(entries.length === 0){
    todayBySubjectEl.innerHTML = `<div class="muted small">Bugün ders bazinda kayit yok. (Ders seçip dakika ekle)</div>`;
  } else {
    entries.forEach(([sub, min]) => {
      const row = document.createElement("div");
      row.className = "li";
      row.innerHTML = `<div><b>${sub}</b></div><div class="mono">${min} dk</div>`;
      todayBySubjectEl.appendChild(row);
    });
  }

  // quests
  questsEl.innerHTML = "";
  state.quests.forEach(q => {
    const row = document.createElement("div");
    row.className = "quest";

    const left = document.createElement("div");
    left.className = "left";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = q.done;
    check.addEventListener("change", () => {
      q.done = check.checked;
      save(state);
      render();
    });

    const title = document.createElement("div");
    title.innerHTML = `<div style="font-weight:800">${q.title}</div><div class="muted small">Günlük görev</div>`;

    left.appendChild(check);
    left.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "badge " + (q.done ? "done" : "");
    badge.textContent = q.done ? "Bitti" : "Bekliyor";

    row.appendChild(left);
    row.appendChild(badge);
    questsEl.appendChild(row);
  });

  completeAllBtn.disabled = !allQuestsDone();

  // store
  storeEl.innerHTML = "";
  STORE.forEach(item => {
    const row = document.createElement("div");
    row.className = "item";

    const left = document.createElement("div");
    left.innerHTML = `<div class="item-title">${item.title}</div><div class="item-desc">${item.desc}</div>`;

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "10px";

    const price = document.createElement("div");
    price.className = "price mono";
    price.textContent = `${item.cost} XP`;

    const btn = document.createElement("button");
    btn.className = "buy primary";
    btn.textContent = "Satin Al";
    btn.disabled = state.totalXp < item.cost;
    btn.addEventListener("click", () => {
      const ok = spendXp(item.cost, `Ödül alindi: ${item.title}`);
      if(!ok) alert("Yetersiz XP :(");
    });

    right.appendChild(price);
    right.appendChild(btn);

    row.appendChild(left);
    row.appendChild(right);

    storeEl.appendChild(row);
  });

  // history
  historyEl.innerHTML = "";
  if(state.history.length === 0){
    historyEl.innerHTML = `<div class="muted small">Henüz kayit yok.</div>`;
  } else {
    state.history.slice(0, 30).forEach(log => {
      const row = document.createElement("div");
      row.className = "log";
      const deltaClass = log.delta >= 0 ? "pos" : "neg";
      const sign = log.delta >= 0 ? "+" : "";
      row.innerHTML = `
        <div>
          <div style="font-weight:800">${log.text}</div>
          <div class="muted small">${log.time}</div>
        </div>
        <div class="delta ${deltaClass} mono">${sign}${log.delta}</div>
      `;
      historyEl.appendChild(row);
    });
  }

  // weekly chart
  drawWeekChart();
}

/* ========= Events ========= */
document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    const m = Number(btn.dataset.min || "0");
    minutesInput.value = String(m);
  });
});

addSubjectBtn.addEventListener("click", () => {
  addSubject(newSubjectInput.value);
  newSubjectInput.value = "";
});

addWorkBtn.addEventListener("click", () => {
  const m = Number(minutesInput.value);
  if(!m || m <= 0){
    alert("Dakika gir (ör: 30).");
    return;
  }
  const sub = subjectSelect.value;
  addWork(m, sub);
  minutesInput.value = "";
});

completeAllBtn.addEventListener("click", () => {
  if(!allQuestsDone()){
    alert("Bonus için tüm günlük görevleri bitirmen lazım.");
    return;
  }
  const flagKey = "dailyBonusGiven_" + todayKey();
  const bonusGiven = localStorage.getItem(flagKey) === "1";
  if(bonusGiven){
    alert("Bugün bonusu zaten aldin.");
    return;
  }
  localStorage.setItem(flagKey, "1");
  addXp(100, "Günlük görev bonusu (+100 XP)");
});

newDayBtn.addEventListener("click", () => {
  const tKey = todayKey();
  state.days[tKey] = { minutesTotal:0, xpTotal:0, subjects:{} };
  state.quests = state.quests.map(q => ({...q, done:false}));
  localStorage.removeItem("dailyBonusGiven_" + tKey);
  state.history.unshift(makeLog("Yeni gün (manuel)", 0));
  save(state);
  render();
});

clearHistoryBtn.addEventListener("click", () => {
  state.history = [];
  save(state);
  render();
});

resetBtn.addEventListener("click", () => {
  const ok = confirm("Her şeyi sifirlayayim mi? (XP, streak, dersler, günler, geçmiş)");
  if(!ok) return;
  state = defaultState();
  save(state);
  render();
});

// first render
render();

// redraw on resize (chart scale)
window.addEventListener("resize", () => {
  // canvas css responsive ama width/height sabit; istersen burada daha advanced scaling yaparız
  render();
});
