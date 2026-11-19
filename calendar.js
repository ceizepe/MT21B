import { db, auth } from "./firebase-config.js";
import { ref, get, onValue, set, remove } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const employeeWrap = document.getElementById("calendarEmployeeWrap");
const employeeSelect = document.getElementById("calendarEmployeeSelect");
const monthInput = document.getElementById("calendarMonth");
const todayBtn = document.getElementById("calendarTodayBtn");
const workCalendar = document.getElementById("workCalendar");
const message = document.getElementById("calendarMessage");
const currentUserLabel = document.getElementById("calendarCurrentUser");

const SHIFT_LABELS = { ranna: "Ranná", poobedna: "Poobedná", nocna: "Nočná", volno: "Voľno" };
let isManager = false;
let selectedUid = "";
let selectedName = "";
let overrides = {};
let calendarUnsubscribe = null;

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDate(key) {
  const [y,m,d] = key.split("-");
  return `${d}.${m}.${y}`;
}
function mondayOf(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0,0,0,0);
  return result;
}
function defaultShift(date) {
  const referenceMonday = new Date(2026, 10, 16); // 16.11.2026 = poobedná
  const weeks = Math.round((mondayOf(date) - referenceMonday) / 604800000);
  const cycle = ((weeks % 3) + 3) % 3;
  const day = date.getDay();
  if (cycle === 0) return day >= 1 && day <= 5 ? "poobedna" : "volno";
  if (cycle === 1) return day >= 1 && day <= 5 ? "ranna" : "volno";
  return day === 0 || (day >= 1 && day <= 4) ? "nocna" : "volno";
}
function render() {
  if (!monthInput.value || !selectedUid) return;
  const [year, month] = monthInput.value.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const start = mondayOf(first);
  const end = new Date(last);
  const endDay = end.getDay() || 7;
  end.setDate(end.getDate() + 7 - endDay);
  workCalendar.innerHTML = "";
  ["Po","Ut","St","Št","Pi","So","Ne"].forEach((text) => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.innerText = text;
    workCalendar.appendChild(el);
  });
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate()+1)) {
    const day = new Date(cursor);
    const key = dateKey(day);
    const override = overrides[key];
    const shift = override?.shift || defaultShift(day);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `calendar-day shift-${shift}`;
    if (day.getMonth() !== month - 1) cell.classList.add("outside-month");
    if (key === dateKey(new Date())) cell.classList.add("today");
    cell.disabled = !isManager;
    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.innerText = day.getDate();
    const label = document.createElement("span");
    label.className = "calendar-shift-label";
    label.innerText = SHIFT_LABELS[shift];
    cell.append(number,label);
    if (override?.note) {
      const note = document.createElement("span");
      note.className = "calendar-day-note";
      note.innerText = override.note;
      cell.appendChild(note);
    }
    if (isManager) cell.addEventListener("click", () => editDay(key, shift, override?.note || ""));
    workCalendar.appendChild(cell);
  }
  message.innerText = isManager ? `Kalendár: ${selectedName}` : "Tvoj pracovný kalendár";
}
async function editDay(key, currentShift, currentNote) {
  const value = window.prompt(`Zmena pre ${selectedName}, ${formatDate(key)}. Napíš: ranna, poobedna, nocna, volno alebo predvolena`, currentShift);
  if (value === null) return;
  const shift = value.trim().toLowerCase();
  if (["predvolena","predvolene","default"].includes(shift)) {
    await remove(ref(db, `workCalendars/${selectedUid}/${key}`));
    return;
  }
  if (!SHIFT_LABELS[shift]) {
    window.alert("Použi: ranna, poobedna, nocna, volno alebo predvolena.");
    return;
  }
  const note = window.prompt("Poznámka (nepovinné):", currentNote);
  if (note === null) return;
  await set(ref(db, `workCalendars/${selectedUid}/${key}`), {
    shift, note: note.trim(), updatedAt: Date.now(), updatedBy: auth.currentUser.uid
  });
}
function subscribeCalendar(uid, name) {
  if (calendarUnsubscribe) calendarUnsubscribe();
  selectedUid = uid;
  selectedName = name;
  overrides = {};
  message.innerText = "Načítavam kalendár...";
  calendarUnsubscribe = onValue(ref(db, `workCalendars/${uid}`), (snapshot) => {
    overrides = snapshot.exists() ? snapshot.val() : {};
    render();
  });
}
async function loadManagerPeople() {
  const snapshot = await get(ref(db, "users"));
  const users = snapshot.exists() ? snapshot.val() : {};
  const entries = Object.entries(users).sort((a,b) => (a[1].name || "").localeCompare(b[1].name || "", "sk"));
  employeeSelect.innerHTML = "";
  entries.forEach(([uid,user]) => {
    const option = document.createElement("option");
    option.value = uid;
    option.innerText = user.name || user.loginId || user.email || uid;
    employeeSelect.appendChild(option);
  });
  if (entries.length) {
    const [uid,user] = entries[0];
    employeeSelect.value = uid;
    subscribeCalendar(uid, user.name || user.loginId || uid);
  } else {
    message.innerText = "Nenašiel sa žiadny používateľ.";
  }
  employeeSelect.addEventListener("change", () => {
    const option = employeeSelect.options[employeeSelect.selectedIndex];
    subscribeCalendar(option.value, option.textContent);
  });
}
monthInput.value = dateKey(new Date()).slice(0,7);
monthInput.addEventListener("change", render);
todayBtn.addEventListener("click", () => { monthInput.value = dateKey(new Date()).slice(0,7); render(); });
document.getElementById("backDashboardBtn").addEventListener("click", () => { location.href = "dashboard.html"; });
document.getElementById("calendarLogoutBtn").addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "index.html"; return; }
  currentUserLabel.innerText = user.email ? user.email.split("@")[0] : "Používateľ";
  const roleSnapshot = await get(ref(db, `users/${user.uid}/role`));
  const role = roleSnapshot.exists() ? roleSnapshot.val() : "zamestnanec";
  isManager = role === "majster" || role === "admin";
  if (isManager) {
    employeeWrap.style.display = "flex";
    await loadManagerPeople();
  } else {
    subscribeCalendar(user.uid, currentUserLabel.innerText);
  }
});
