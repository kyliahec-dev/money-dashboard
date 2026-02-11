/* Money Dashboard (offline, on-device only) */

const LS_KEY = "moneyDash_v1";

const $ = (id) => document.getElementById(id);

function n(v){
  // Parse currency-ish input safely
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}
function money(x){
  const val = Math.round((x + Number.EPSILON) * 100) / 100;
  return val.toLocaleString(undefined, {style:"currency", currency:"USD"});
}
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateISO, days){
  const d = new Date(dateISO + "T12:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    return {
      balances: { checking: 0, hysa: 5000, house: 0, houseMonth: 0, monthBills: 2329, billsRemaining: 0 },
      goals: { checking: 2000, hysa: 10000, houseMonthly: 1000, paycheck: 2100 },
      wants: [],
      history: [],
      plans:[],
      wizard: { mode: "nonbills" }
    };
  }
  try { return JSON.parse(raw); }
  catch {
    localStorage.removeItem(LS_KEY);
    return loadState();
  }
}

function saveState(state){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

let state = loadState();
state.balances.houseMonth = ("houseMonth" in state.balances) ? n(state.balances.houseMonth) : 0;
state.balances.billsRemaining = ("billsRemaining" in state.balances) ? n(state.balances.billsRemaining) : 0;
state.side = state.side || { velocity: [] }; // for goal velocity tracking
state.balances.houseMonth = n(state.balances.houseMonth);
state.plans = state.plans || [];
state.wizard = state.wizard || { mode: "nonbills" };

/* ---------- UI: initial fill ---------- */
function fillUI(){
  $("checkingNow").value = state.balances.checking || 0;
  $("hysaNow").value = state.balances.hysa || 0;
  $("houseNow").value = state.balances.house || 0;
  $("monthBills").value = state.balances.monthBills ?? 2329;
  $("billsRemaining").value = n(state.balances.billsRemaining);

  $("goalChecking").value = state.goals.checking ?? 2000;
  $("goalHYSA").value = state.goals.hysa ?? 10000;
  $("goalHouseMonthly").value = state.goals.houseMonthly ?? 1000;
  $("paycheckAmount").value = state.goals.paycheck ?? 2100;

  setWizardMode(state.wizard.mode || "nonbills");
  renderProgress();
  renderWants();
  renderHistory();
  renderPlans();
  renderPlanDetails();
  renderSidePanes();
}

function setMsg(text){
  $("saveMsg").textContent = text || "";
  if (text) setTimeout(() => ($("saveMsg").textContent = ""), 1800);
}

/* ---------- Progress ---------- */
function renderProgress(){
  const checkingNow = state.balances.checking;
  const hysaNow = state.balances.hysa;
  const houseNow = n(state.balances.house);         // total balance
  const houseMonth = n(state.balances.houseMonth);

  const gC = state.goals.checking;
  const gH = state.goals.hysa;
  const gHouse = state.goals.houseMonthly;

  const cPct = gC > 0 ? clamp01(checkingNow / gC) : 0;
  const hPct = gH > 0 ? clamp01(hysaNow / gH) : 0;
  const housePct = gHouse > 0 ? clamp01(houseMonth / gHouse) : 0;

  $("progChecking").value = cPct;
  $("progHY").value = hPct;
  $("progHouse").value = housePct;

  $("progCheckingText").textContent = `${money(checkingNow)} / ${money(gC)}`;
  $("progHYText").textContent = `${money(hysaNow)} / ${money(gH)}`;
  $("progHouseText").textContent = `${money(houseMonth)} / ${money(gHouse)} this month`;}

/* ---------- Wizard Mode ---------- */
function setWizardMode(mode){
  state.wizard.mode = mode;
  saveState(state);

  const non = $("pillNonBills");
  const bills = $("pillBills");

  if (mode === "bills") {
    bills.classList.add("active");
    non.classList.remove("active");
  } else {
    non.classList.add("active");
    bills.classList.remove("active");
  }
}

/* ---------- Plan Generation ---------- */
function generatePlan(){
  const paycheck = n(state.goals.paycheck);
  const requiredBills = n($("wizRequiredBills").value);
  const ccPayoff = n($("wizCCPayoff").value);
  const houseThisCheck = n($("wizHouseThisCheck").value);
  const mode = state.wizard.mode;

  let remaining = paycheck;
  const steps = [];

  // Always: cover required bills first
  if (requiredBills > 0) {
    steps.push(`Pay required bills: ${money(requiredBills)}`);
    remaining -= requiredBills;
  }

  // Then: credit cards (if you choose)
  if (ccPayoff > 0) {
    steps.push(`Pay off credit cards: ${money(ccPayoff)}`);
    remaining -= ccPayoff;
  }

  // Then: house savings contribution
  if (houseThisCheck > 0) {
    steps.push(`Transfer to House Savings: ${money(houseThisCheck)}`);
    remaining -= houseThisCheck;
  }

  // Then: build checking buffer to goal, then HYSA
  const checkingGoal = n(state.goals.checking);
  const checkingNow = n(state.balances.checking);
  const needToGoal = Math.max(0, checkingGoal - checkingNow);

  let toChecking = 0;
  let toHYSA = 0;

  if (remaining > 0) {
    toChecking = Math.min(needToGoal, remaining);
    remaining -= toChecking;

    toHYSA = Math.max(0, remaining);
    remaining = 0;
  }

  if (toChecking > 0) steps.push(`Move to Checking buffer: ${money(toChecking)}`);
  if (toHYSA > 0) steps.push(`Move to HYSA: ${money(toHYSA)}`);

  // If negative, show the gap
  let summary = "";
  if (remaining < 0) {
    summary = `⚠️ This plan is short by ${money(Math.abs(remaining))}. Reduce CC/House amount or adjust timing.`;
  } else {
    summary = `Left unassigned: ${money(0)} (everything has a job).`;
  }

  // Helpful hint based on mode
  const hint = (mode === "bills")
    ? `Bills-heavy check tip: treat this check as “spoken for.” Only enter bills that actually leave this check.`
    : `Not-bills check tip: this is your best check for paying off cards + building buffers.`;

  return { steps, summary, hint, alloc: { requiredBills, ccPayoff, houseThisCheck, toChecking, toHYSA }, paycheck };
}

function renderPlan(plan){
  const out = $("planOut");
  if (!plan.steps.length) {
    out.innerHTML = `<div class="hint">Enter amounts above, then tap “Generate plan.”</div>`;
    return;
  }
  const items = plan.steps.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  out.innerHTML = `
    <div><strong>Plan for this paycheck (${money(plan.paycheck)})</strong></div>
    <ul>${items}</ul>
    <div class="hint">${escapeHtml(plan.summary)}</div>
    <div class="hint">${escapeHtml(plan.hint)}</div>
  `;
}
function planId(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function savePlan(plan){
  const scenario = ($("wizScenario")?.value || "").trim();

  state.plans.unshift({
    id: planId(),
    created: todayISO(),
    mode: state.wizard.mode,
    alloc: plan.alloc,
    paycheck: plan.paycheck,
    summary: plan.summary,
    hint: plan.hint,
    steps: plan.steps,
    note: ($("wizNotes").value || "").trim()
  });
  state.wizard.selectedPlanId = state.plans[0].id;
  saveState(state);
  renderPlans();
  renderPlanDetails();
  setMsg("Plan saved ✅");
}

function renderPlans(){
  const wrap = $("planList");
  if (!wrap) return;

  if (!state.plans.length) {
    wrap.innerHTML = `<div class="item"><div class="itemMeta">No saved plans yet.</div></div>`;
    return;
  }

  const selectedId = state.wizard.selectedPlanId;

  wrap.innerHTML = state.plans.slice(0, 20).map(p => {
    const isSel = p.id === selectedId;
    const title = `${p.created} • ${p.mode === "bills" ? "Bills-heavy" : "Not-bills"} • ${money(n(p.paycheck))}`;
    const meta = [
      p.note ? `Note: ${p.note}` : "",
      `Bills: ${money(n(p.alloc.requiredBills))}`,
      `CC: ${money(n(p.alloc.ccPayoff))}`,
      `House: ${money(n(p.alloc.houseThisCheck))}`,
      `To HYSA: ${money(n(p.alloc.toHYSA))}`
    ].filter(Boolean).join(" | ");

    const subtitle = [
      p.scenario ? `Scenario: ${p.scenario}` : "",
      p.note ? `Note: ${p.note}` : ""
    ].filter(Boolean).join(" • ");

    return `
  <div class="item ${isSel ? "selected" : ""}" data-plan-id="${escapeHtml(p.id)}">
    <div class="itemTop">
      <div>
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="itemMeta">${escapeHtml(subtitle)}</div>
      </div>

      <div class="actions">
        <button class="mini ghost" data-action="dup" data-id="${escapeHtml(p.id)}">Duplicate</button>
        <button class="mini ghost danger" data-action="del" data-id="${escapeHtml(p.id)}">Delete</button>
      </div>
    </div>
  </div>
`;
  }).join("");

  // click-to-select
  wrap.onclick = (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      if (action === "del") {
        if (!confirm("Delete this saved plan?")) return;
        deletePlanById(id);
      }
      if (action === "dup") {
        duplicatePlanToWizard(id);
      }
      return; // important: stop here
    }

    const row = e.target.closest("[data-plan-id]");
    if (!row) return;

    const id = row.getAttribute("data-plan-id");
    state.wizard.selectedPlanId = id;
    saveState(state);
    renderPlans();
    renderPlanDetails();
  };
}
function recordVelocitySnapshot(){
  // record once per day max
  const today = todayISO();
  const arr = state.side.velocity || [];
  if (arr.length && arr[0].date === today) return;

  arr.unshift({
    date: today,
    checking: n(state.balances.checking),
    hysa: n(state.balances.hysa),
    house: n(state.balances.house),
    houseMonth: n(state.balances.houseMonth)
  });

  state.side.velocity = arr.slice(0, 14); // keep last 2 weeks
  saveState(state);
}

function velocityPerDay(key){
  const arr = state.side.velocity || [];
  if (arr.length < 2) return null;

  const newest = arr[0];
  // pick the oldest snapshot we have (up to 7 days back if possible)
  const oldest = arr[Math.min(arr.length - 1, 7)];
  const days = Math.max(1, (new Date(newest.date) - new Date(oldest.date)) / (1000*60*60*24));
  const delta = n(newest[key]) - n(oldest[key]);
  return delta / days;
}
function momentumFromHistory(lastN = 3){
  const hist = (state.history || [])
    .filter(h => h && h.type === "Paycheck logged" && h.detail)
    .slice(0, lastN);

  if (hist.length < 2) return null; // need at least 2 to feel meaningful

  const avg = (arr) => arr.reduce((a,b) => a + b, 0) / arr.length;

  const hysaArr = hist.map(h => n(h.detail.toHYSA));
  const houseArr = hist.map(h => n(h.detail.houseThisCheck));
  const keepArr  = hist.map(h => {
    const d = h.detail;
    return n(d.paycheck) - n(d.requiredBills) - n(d.ccPayoff) - n(d.houseThisCheck) - n(d.toHYSA);
  });

  return {
    n: hist.length,
    avgHYSA: avg(hysaArr),
    avgHouse: avg(houseArr),
    avgKeep: avg(keepArr),
  };
}

function renderSidePanes(){
  const left = $("leftPane");
  const right = $("rightPane");
  if (!left || !right) return;

  // --- live values ---
  const checking = n(state.balances.checking);
  const hysa = n(state.balances.hysa);
  const house = n(state.balances.house);
  const houseMonth = n(state.balances.houseMonth);

  const billsRemaining = n(state.balances.billsRemaining);

  // --- safe to spend (this check horizon) ---
  // Safe to Spend = checking - billsRemaining (never below 0)
  const safeToSpend = Math.max(0, checking - billsRemaining);

  // --- cooldown soonest ---
  const wants = (state.wants || []).slice().sort((a,b) => (a.review||"").localeCompare(b.review||""));
  const nextWant = wants[0];
  const nextWantDays = nextWant ? daysUntil(nextWant.review) : null;

  // --- plans ---
  const plans = state.plans || [];
  const sel = plans.find(p => p.id === state.wizard.selectedPlanId) || null;

  // Plan comparison: show top 2 most recent saved plans
  const p1 = plans[0] || null;
  const p2 = plans[1] || null;

  function planImpactLine(p){
    if (!p) return "";
    const a = p.alloc || {};
    const endChecking = n(p.paycheck) - n(a.requiredBills) - n(a.ccPayoff) - n(a.houseThisCheck) - n(a.toHYSA);
    return `${money(endChecking)} in checking • +${money(n(a.toHYSA))} to HYSA`;
  }

  // --- goal velocity ---
  // --- Momentum (per paycheck) ---
  const mom = momentumFromHistory(3);

  // --- Next 3 actions (simple + helpful) ---
  const actions = [];

  if (billsRemaining > 0 && checking < billsRemaining) {
    actions.push(`Move ${money(billsRemaining - checking)} into checking to cover remaining bills.`);
  } else if (billsRemaining > 0) {
    actions.push(`Bills remaining covered: ${money(billsRemaining)}.`);
  } else {
    actions.push(`Set “Bills remaining” for this pay period (even if $0).`);
  }

  if (!sel && plans.length) actions.push(`Select a saved paycheck plan to review + log.`);
  if (!plans.length) actions.push(`Generate + Save a paycheck plan for your next check.`);

  if (nextWant) {
    if (nextWantDays <= 0) actions.push(`Cooldown review today: ${nextWant.item}.`);
    else actions.push(`Cooldown next: ${nextWant.item} (in ${nextWantDays} days).`);
  } else {
    actions.push(`Add a “Big Want” to start a cooldown (keeps impulse buys calmer).`);
  }

  const top3 = actions.slice(0,3);

  // --- LEFT PANE (status) ---
  left.innerHTML = `
    <div class="cardTitle" style="margin-bottom:8px;">Status</div>

    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">Safe to Spend</div>
          <div class="itemMeta">${money(safeToSpend)} (checking ${money(checking)} − bills remaining ${money(billsRemaining)})</div>
        </div>
        <div class="badge ${safeToSpend > 0 ? "good" : ""}">${safeToSpend > 0 ? "OK" : "Tight"}</div>
      </div>
    </div>

    <div class="item"><div class="itemTop">
      <div><div class="itemTitle">Checking</div><div class="itemMeta">${money(checking)}</div></div>
      <div class="badge">Now</div>
    </div></div>

    <div class="item"><div class="itemTop">
      <div><div class="itemTitle">HYSA</div><div class="itemMeta">${money(hysa)}</div></div>
      <div class="badge">Now</div>
    </div></div>

    <div class="item"><div class="itemTop">
      <div><div class="itemTitle">House Savings</div><div class="itemMeta">${money(house)} total • ${money(houseMonth)} this month</div></div>
      <div class="badge">House</div>
    </div></div>

    <div class="hint" style="margin-top:10px;">
      ${
    !mom
      ? `<div class="itemMeta">Momentum will appear after you log at least 2 paychecks.</div>`
      : `
      <div class="itemMeta">
        <strong>Momentum (last ${mom.n} paychecks)</strong><br/>
        On average, you’ve been moving <strong>${money(mom.avgHYSA)}</strong> per paycheck into HYSA and
        <strong>${money(mom.avgHouse)}</strong> per paycheck into House savings.
        After bills and planned transfers, you typically keep about
        <strong>${money(mom.avgKeep)}</strong> in checking as a buffer.
      </div>
    `
  }
    </div>
  `;

  // --- RIGHT PANE (guidance) ---
  right.innerHTML = `
    <div class="cardTitle" style="margin-bottom:8px;">Next 3 actions</div>

    ${top3.map(a => `
      <div class="item"><div class="itemTop">
        <div><div class="itemTitle">${escapeHtml(a)}</div></div>
        <div class="badge">Do</div>
      </div></div>
    `).join("")}

    <div class="cardTitle" style="margin:14px 0 8px;">Cooldown countdown</div>
    <div class="item"><div class="itemTop">
      <div>
        <div class="itemTitle">${nextWant ? escapeHtml(nextWant.item) : "No active cooldowns"}</div>
        <div class="itemMeta">${
    nextWant
      ? `${money(n(nextWant.cost))} • Review ${nextWantDays <= 0 ? "today" : `in ${nextWantDays} days`}`
      : "Add a want to start a cooldown."
  }</div>
      </div>
      <div class="badge ${nextWant && nextWantDays <= 0 ? "good" : ""}">${nextWant ? "Track" : "OK"}</div>
    </div></div>

    <div class="cardTitle" style="margin:14px 0 8px;">Plan comparison preview</div>
    <div class="item"><div class="itemTop">
      <div>
        <div class="itemTitle">${p1 ? escapeHtml(p1.scenario || "Most recent plan") : "No saved plans yet"}</div>
        <div class="itemMeta">${p1 ? escapeHtml(planImpactLine(p1)) : "Save plans to compare them here."}</div>
      </div>
      <div class="badge">P1</div>
    </div></div>

    <div class="item"><div class="itemTop">
      <div>
        <div class="itemTitle">${p2 ? escapeHtml(p2.scenario || "Second plan") : "—"}</div>
        <div class="itemMeta">${p2 ? escapeHtml(planImpactLine(p2)) : ""}</div>
      </div>
      <div class="badge">P2</div>
    </div></div>

    <div class="hint" style="margin-top:10px;">
      Tip: Bills remaining drives Safe to Spend. Update it after bills hit.
    </div>
  `;
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---------- Logging (apply plan) ---------- */
function logPlan(plan){
  const { requiredBills, ccPayoff, houseThisCheck, toHYSA } = plan.alloc;

  const paycheck = plan.paycheck;
  const deltaChecking = paycheck - requiredBills - ccPayoff - houseThisCheck - toHYSA;

  state.balances.checking = n(state.balances.checking) + deltaChecking;
  state.balances.hysa = n(state.balances.hysa) + toHYSA;
  state.balances.house = n(state.balances.house) + houseThisCheck;
  state.balances.houseMonth = n(state.balances.houseMonth) + houseThisCheck;

  // History entry
  const note = $("wizNotes").value?.trim() || "";
  state.history.unshift({
    date: todayISO(),
    type: "Paycheck logged",
    detail: {
      paycheck,
      requiredBills,
      ccPayoff,
      houseThisCheck,
      toHYSA,
      note
    }
  });

  saveState(state);
  fillUI();
  setMsg("Logged ✅");
}

function deletePlanById(id){
  const idx = state.plans.findIndex(p => p.id === id);
  if (idx === -1) return;

  const wasSelected = state.wizard.selectedPlanId === id;
  state.plans.splice(idx, 1);

  if (wasSelected) {
    state.wizard.selectedPlanId = state.plans[0]?.id || null;
  }

  saveState(state);
  renderPlans();
  renderPlanDetails();
}

function duplicatePlanToWizard(id){
  const p = state.plans.find(x => x.id === id);
  if (!p) return;

  // Set mode pills + state
  setWizardMode(p.mode || "nonbills");

  // Prefill inputs
  $("wizRequiredBills").value = n(p.alloc?.requiredBills);
  $("wizCCPayoff").value = n(p.alloc?.ccPayoff);
  $("wizHouseThisCheck").value = n(p.alloc?.houseThisCheck);
  $("wizNotes").value = p.note ? `${p.note} (dup)` : "";
  if ($("wizScenario")) $("wizScenario").value = p.scenario || "";

  // Generate a fresh draft from current inputs
  const plan = generatePlan();
  renderPlan(plan);
  window.__latestPlan = plan;

  // Optional: scroll draft into view
  $("planOut")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Wants / Cooldown ---------- */
function cooldownDaysFor(cost){
  // New rule set:
  // <= 200  => 7 days
  // 202-500 => 21 days
  // 501-999 => 30 days
  // >= 1000 => 45 days
  const c = n(cost);

  if (c <= 200) return 7;
  if (c >= 201 && c <= 500) return 21;
  if (c >= 501 && c <= 999) return 30;
  return 45; // >= 1000
}

function addWant(item, cost){
  const today = todayISO();
  const days = cooldownDaysFor(cost);
  const review = addDays(today, days);

  state.wants.unshift({
    id: cryptoRandomId(),
    item,
    cost,
    created: today,
    review,
    decided: null
  });

  saveState(state);
  renderWants();
}

function cryptoRandomId(){
  // simple unique id
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function daysUntil(dateISO){
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(dateISO + "T00:00:00");
  const ms = target - today;
  return Math.ceil(ms / (1000*60*60*24));
}

function renderWants(){
  const wrap = $("wantList");
  if (!wrap) return;

  if (!state.wants || !state.wants.length) {
    wrap.innerHTML = `<div class="item"><div class="itemMeta">No active cooldowns.</div></div>`;
    return;
  }

  const today = todayISO();

  wrap.innerHTML = state.wants.map(w => {
    const dleft = daysUntil(w.review);
    const countdown = dleft <= 0
      ? "Review today"
      : `Review in ${dleft} day${dleft === 1 ? "" : "s"}`;

    const ready = (w.review || "") <= today;

    return `
      <div class="item">
        <div class="itemTop">
          <div>
            <div class="itemTitle">${escapeHtml(w.item || "Unnamed Want")} — ${money(n(w.cost))}</div>
            <div class="itemMeta">Started: ${escapeHtml(w.created)} • Review: ${escapeHtml(w.review)} • ${escapeHtml(countdown)}</div>
          </div>
          <div class="badge ${ready ? "good" : ""}">${ready ? "Review day" : "Cooling"}</div>
        </div>
      </div>
    `;
  }).join("");
}

function clearWants(){
  state.wants = [];
  saveState(state);
  renderWants();
}

/* ---------- History ---------- */
function renderHistory(){
  const wrap = $("historyList");
  if (!state.history.length) {
    wrap.innerHTML = `<div class="item"><div class="itemMeta">No history yet.</div></div>`;
    return;
  }

  wrap.innerHTML = state.history.slice(0, 30).map(h => {
    const d = h.detail || {};
    const lines = [];
    if (d.paycheck) lines.push(`Paycheck: ${money(n(d.paycheck))}`);
    if (d.requiredBills) lines.push(`Bills: ${money(n(d.requiredBills))}`);
    if (d.ccPayoff) lines.push(`Credit cards: ${money(n(d.ccPayoff))}`);
    if (d.houseThisCheck) lines.push(`House: ${money(n(d.houseThisCheck))}`);
    if (d.toHYSA) lines.push(`To HYSA: ${money(n(d.toHYSA))}`);
    if (d.note) lines.push(`Note: ${d.note}`);

    return `
      <div class="item">
        <div class="itemTop">
          <div>
            <div class="itemTitle">${escapeHtml(h.type)}</div>
            <div class="itemMeta">${escapeHtml(h.date)}${lines.length ? " • " + escapeHtml(lines.join(" | ")) : ""}</div>
          </div>
          <div class="badge">Log</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderPlanDetails(){
  const box = $("planDetails");
  if (!box) return;

  const selId = state.wizard.selectedPlanId;
  const p = state.plans?.find(x => x.id === selId);

  if (!p) {
    box.innerHTML = `<div class="hint">Select a plan to preview it here.</div>`;
    return;
  }

  const a = p.alloc || {};
  const lines = [
    `Mode: ${p.mode === "bills" ? "Bills-heavy" : "Not-bills"}`,
    `Paycheck: ${money(n(p.paycheck))}`,
    `Bills: ${money(n(a.requiredBills))}`,
    `Credit cards: ${money(n(a.ccPayoff))}`,
    `House: ${money(n(a.houseThisCheck))}`,
    `Move to Checking buffer: ${money(n(a.toChecking))}`,
    `Move to HYSA: ${money(n(a.toHYSA))}`,
  ];

  const steps = (p.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");

  box.innerHTML = `
    <div><strong>${escapeHtml(p.created)} Plan</strong></div>
    ${p.note ? `<div class="hint">Note: ${escapeHtml(p.note)}</div>` : ""}
    <ul>${steps}</ul>
    <div class="hint">${escapeHtml(p.summary || "")}</div>
    <div class="hint">${escapeHtml(p.hint || "")}</div>
    <div class="hint">${escapeHtml(lines.join(" • "))}</div>
  `;
}
function renderPlanDetails(){
  const box = $("planDetails");
  if (!box) return;

  const selId = state.wizard.selectedPlanId;
  const p = state.plans?.find(x => x.id === selId);

  if (!p) {
    box.innerHTML = `<div class="hint">Select a plan to preview it here.</div>`;
    return;
  }

  const a = p.alloc || {};
  const lines = [
    `Mode: ${p.mode === "bills" ? "Bills-heavy" : "Not-bills"}`,
    `Paycheck: ${money(n(p.paycheck))}`,
    `Bills: ${money(n(a.requiredBills))}`,
    `Credit cards: ${money(n(a.ccPayoff))}`,
    `House: ${money(n(a.houseThisCheck))}`,
    `Move to Checking buffer: ${money(n(a.toChecking))}`,
    `Move to HYSA: ${money(n(a.toHYSA))}`,
  ];

  const steps = (p.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join("");

  box.innerHTML = `
    <div><strong>${escapeHtml(p.created)} Plan</strong></div>
    ${p.note ? `<div class="hint">Note: ${escapeHtml(p.note)}</div>` : ""}
    <ul>${steps}</ul>
    <div class="hint">${escapeHtml(p.summary || "")}</div>
    <div class="hint">${escapeHtml(p.hint || "")}</div>
    <div class="hint">${escapeHtml(lines.join(" • "))}</div>
  `;
}

function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `money-dashboard-export-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearHistory(){
  state.history = [];
  saveState(state);
  renderHistory();
}

/* ---------- Save buttons ---------- */
function saveBalancesFromUI(){
  state.balances.checking = n($("checkingNow").value);
  state.balances.hysa = n($("hysaNow").value);
  state.balances.house = n($("houseNow").value);
  state.balances.monthBills = n($("monthBills").value);
  state.balances.billsRemaining = n($("billsRemaining").value);

  saveState(state);
  renderProgress();
  setMsg("Saved ✅");
}

function saveGoalsFromUI(){
  state.goals.checking = n($("goalChecking").value);
  state.goals.hysa = n($("goalHYSA").value);
  state.goals.houseMonthly = n($("goalHouseMonthly").value);
  state.goals.paycheck = n($("paycheckAmount").value);

  saveState(state);
  renderProgress();
  setMsg("Saved ✅");
}

function resetAll(){
  if (!confirm("Reset ALL data? This cannot be undone.")) return;
  localStorage.removeItem(LS_KEY);

  state = loadState();
  fillUI();
  setMsg("Reset ✅");
}
function resetHouseMonth(){
  if (!confirm("Reset this month’s house contributions back to 0?")) return;
  state.balances.houseMonth = 0;
  saveState(state);
  fillUI();
  setMsg("House month reset ✅");
}

/* ---------- Service Worker registration ---------- */
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (e) {
    // ignore
  }
}

/* ---------- “Add to Home Screen” hint ---------- */
function showInstallHint(){
  alert("On iPhone: open this in Safari → Share → Add to Home Screen.");
}

/* ---------- Wire up events ---------- */
function bind(){
  $("btnSaveBalances").addEventListener("click", saveBalancesFromUI);
  $("btnSaveGoals").addEventListener("click", saveGoalsFromUI);
  $("btnReset").addEventListener("click", resetAll);
  $("btnResetHouseMonth")?.addEventListener("click", resetHouseMonth);
  $("pillNonBills").addEventListener("click", () => setWizardMode("nonbills"));
  $("pillBills").addEventListener("click", () => setWizardMode("bills"));

  $("btnGeneratePlan").addEventListener("click", () => {
    const plan = generatePlan();
    renderPlan(plan);
    // stash latest plan for logging
    window.__latestPlan = plan;
  });

  $("btnLogPlan")?.addEventListener("click", () => {
    const selId = state.wizard.selectedPlanId;
    const chosen = state.plans.find(p => p.id === selId);

    if (!chosen) {
      alert("Select a saved plan on the right first.");
      return;
    }

    // reuse existing logPlan() by shaping object like generatePlan() output
    const planLike = {
      paycheck: chosen.paycheck,
      alloc: chosen.alloc,
      steps: chosen.steps,
      summary: chosen.summary,
      hint: chosen.hint
    };

    const shortBy = planLike.summary.includes("short by");
    if (shortBy) {
      alert("This plan is short. Adjust amounts before logging.");
      return;
    }
    if (!confirm("Log this selected plan and update balances?")) return;

    logPlan(planLike);

    // keep saved plans; or optionally mark as used in history only
  });

  $("btnAddWant").addEventListener("click", () => {
    const item = $("wantItem").value.trim();
    const cost = n($("wantCost").value);
    if (!item) { alert("Enter an item."); return; }
    addWant(item, cost);
    $("wantItem").value = "";
    $("wantCost").value = "";
  });

  $("btnClearWants").addEventListener("click", () => {
    if (!confirm("Clear all cooldowns?")) return;
    clearWants();
  });

  $("btnExport").addEventListener("click", exportData);
  $("btnClearHistory").addEventListener("click", () => {
    if (!confirm("Clear history?")) return;
    clearHistory();
  });

  $("btnInstallHint").addEventListener("click", showInstallHint);

  $("btnSavePlan")?.addEventListener("click", () => {
    const plan = window.__latestPlan;
    if (!plan || !plan.steps?.length) {
      alert("Generate a plan first.");
      return;
    }
    const shortBy = plan.summary.includes("short by");
    if (shortBy) {
      alert("This plan is short. Adjust amounts before saving.");
      return;
    }
    savePlan(plan);
  });

}

/* ---------- Init ---------- */
fillUI();
bind();
registerSW();
renderPlan({steps:[], summary:"", hint:""});
