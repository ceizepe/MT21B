import { db, auth, firebaseConfig }
from "./firebase-config.js";

import {
initializeApp,
getApps,
deleteApp
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
getAuth,
createUserWithEmailAndPassword,
signOut as secondarySignOut
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
ref,
onValue,
get,
push,
set,
update,
remove
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import {
signOut,
onAuthStateChanged
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const DEFAULT_LINES = [
{ key: "line_1", name: "Linka 1", order: 1 },
{ key: "line_2", name: "Linka 2", order: 2 },
{ key: "line_3", name: "Linka 3", order: 3 },
{ key: "line_4", name: "Linka 4", order: 4 },
{ key: "line_5", name: "Linka 5", order: 5 },
{ key: "line_6", name: "Linka 6", order: 6 },
{ key: "line_7", name: "Linka 7", order: 7 },
{ key: "line_8", name: "Linka 8", order: 8 }
];

let dataLoaded = false;
let linesInitialized = false;
let latestEmployeesData = null;
let latestUsersData = null;
let latestLinesList = [];
let latestLineAssignments = {};
let currentUserRole = "zamestnanec";

const overviewSection = document.getElementById("overviewSection");
const detailSection = document.getElementById("detailSection");
const detailTitle = document.getElementById("detailTitle");
const backToOverviewBtn = document.getElementById("backToOverviewBtn");
const usersCard = document.getElementById("usersCard");
const employeesCard = document.getElementById("employeesCard");
const calendarCard = document.getElementById("calendarCard");
const calendarCardText = document.getElementById("calendarCardText");

const employeesView = document.getElementById("employeesView");
const usersView = document.getElementById("usersView");
const linesView = document.getElementById("linesView");
const absencesView = document.getElementById("absencesView");
const calendarView = document.getElementById("calendarView");

const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeeRoleNotice = document.getElementById("employeeRoleNotice");
const actionColHeader = document.getElementById("actionColHeader");
const employeesTableBody = document.getElementById("employeesTableBody");

const addUserForm = document.getElementById("addUserForm");
const addUserStatus = document.getElementById("addUserStatus");
const usersRoleList = document.getElementById("usersRoleList");

const addLineForm = document.getElementById("addLineForm");
const newLineNameInput = document.getElementById("newLineName");
const linesRoleNotice = document.getElementById("linesRoleNotice");
const linesContainer = document.getElementById("linesContainer");
const roleBadge = document.getElementById("roleBadge");
const absenceForm = document.getElementById("absenceForm");
const absenceTypeInput = document.getElementById("absenceType");
const absenceDateFromInput = document.getElementById("absenceDateFrom");
const absenceDateToInput = document.getElementById("absenceDateTo");
const absenceNoteInput = document.getElementById("absenceNote");
const absenceMessage = document.getElementById("absenceMessage");
const absencesTableBody = document.getElementById("absencesTableBody");
const absenceAdminNotice = document.getElementById("absenceAdminNotice");

let latestAbsencesData = null;
let absencesSubscribedPath = "";
let calendarSubscribedPath = "";
let latestCalendarOverrides = null;
let selectedCalendarUid = "";

const calendarEmployeeWrap = document.getElementById("calendarEmployeeWrap");
const calendarEmployeeSelect = document.getElementById("calendarEmployeeSelect");
const calendarMonthInput = document.getElementById("calendarMonth");
const calendarTodayBtn = document.getElementById("calendarTodayBtn");
const calendarEmployeeNotice = document.getElementById("calendarEmployeeNotice");
const calendarHelp = document.getElementById("calendarHelp");
const workCalendar = document.getElementById("workCalendar");


function normalizeShortcut(raw) {
return raw
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9._-]/g, "");
}

function normalizeRole(rawRole) {
if (rawRole === "majster" || rawRole === "admin") {
return "majster";
}
return "zamestnanec";
}

function isMajster() {
return currentUserRole === "majster";
}

function showAddUserMessage(text, isError = true) {
if (!addUserStatus) return;
addUserStatus.style.display = "block";
addUserStatus.innerText = text;
addUserStatus.classList.remove("msg-error", "msg-success");
addUserStatus.classList.add(isError ? "msg-error" : "msg-success");
}

function backToOverview() {
detailSection.style.display = "none";
overviewSection.style.display = "flex";
}

async function ensureDefaultLinesExist() {
if (linesInitialized) return;
linesInitialized = true;

const linesRef = ref(db, "lines");
const snap = await get(linesRef);

if (!snap.exists()) {
const initialObj = {};
DEFAULT_LINES.forEach((item) => {
initialObj[item.key] = {
name: item.name,
order: item.order
};
});
await set(linesRef, initialObj);
}
}

function parseLinesSnapshot(val) {
if (!val) return [];
return Object.entries(val)
  .map(([key, data], idx) => ({
    key,
    name: data?.name || key,
    order: typeof data?.order === "number" ? data.order : idx + 1
  }))
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "sk"));
}

function getUserAssignedLines(uid) {
const assigned = [];
latestLinesList.forEach((lineObj) => {
const lineMembers = latestLineAssignments?.[lineObj.key];
if (lineMembers && lineMembers[uid]) {
assigned.push(lineObj);
}
});
return assigned;
}

function getUserDisplayName(uid) {
const u = latestUsersData?.[uid];
if (!u) return uid;
return u.name || u.loginId || u.email || uid;
}

function applyRoleUI() {
if (roleBadge) {
roleBadge.innerText = currentUserRole;
roleBadge.classList.remove("role-majster", "role-zamestnanec");
roleBadge.classList.add(isMajster() ? "role-majster" : "role-zamestnanec");
}

if (usersCard) {
usersCard.style.display = isMajster() ? "block" : "none";
}
if (employeesCard) {
employeesCard.style.display = isMajster() ? "block" : "none";
}
if (calendarCardText) {
calendarCardText.innerText = isMajster() ? "Kalendáre zamestnancov" : "Moje zmeny";
}
if (calendarEmployeeWrap) calendarEmployeeWrap.style.display = isMajster() ? "flex" : "none";
if (calendarEmployeeNotice) calendarEmployeeNotice.style.display = isMajster() ? "none" : "block";
if (calendarHelp) calendarHelp.style.display = isMajster() ? "block" : "none";

if (!isMajster() && usersView && usersView.style.display === "block") {
backToOverview();
}

if (addEmployeeForm) {
addEmployeeForm.style.display = isMajster() ? "flex" : "none";
}

if (employeeRoleNotice) {
employeeRoleNotice.style.display = isMajster() ? "none" : "block";
}

if (linesRoleNotice) {
linesRoleNotice.style.display = isMajster() ? "none" : "block";
}

if (addLineForm) {
addLineForm.style.display = isMajster() ? "flex" : "none";
}

if (actionColHeader) {
actionColHeader.style.display = isMajster() ? "" : "none";
}

renderEmployeesTable(latestEmployeesData);
renderUsersList(latestUsersData);
renderLinesBoard();
}

async function ensureUserRole(user) {
const userRef = ref(db, `users/${user.uid}`);
const snap = await get(userRef);

if (snap.exists() && snap.val().role) {
currentUserRole = normalizeRole(snap.val().role);
} else {
const defaultRole = user.email === "admin@mt21b.local" ? "majster" : "zamestnanec";
const fallbackShortcut = user.email ? user.email.split("@")[0] : "";
currentUserRole = defaultRole;
await set(userRef, {
email: user.email || "",
loginId: fallbackShortcut,
name: fallbackShortcut || "Používateľ",
role: defaultRole
});
}

applyRoleUI();
}

function setupEmployeesUI() {
const phoneInput = document.getElementById("empPhone");
if (phoneInput) {
phoneInput.required = false;
phoneInput.placeholder = "Telefónne číslo (nepovinné)";
}
}

function renderEmployeesTable(employeesObj) {
if (!employeesTableBody) return;

employeesTableBody.innerHTML = "";
const colSpan = isMajster() ? 5 : 4;

if (!employeesObj) {
employeesTableBody.innerHTML = `<tr><td colspan="${colSpan}">Zatiaľ nie sú pridaní žiadni zamestnanci.</td></tr>`;
return;
}

const entries = Object.entries(employeesObj).sort((a, b) => {
const nameA = `${a[1]?.lastName || ""} ${a[1]?.firstName || ""}`.toLowerCase();
const nameB = `${b[1]?.lastName || ""} ${b[1]?.firstName || ""}`.toLowerCase();
return nameA.localeCompare(nameB, "sk");
});

entries.forEach(([id, emp]) => {
const tr = document.createElement("tr");
const tdPersonal = document.createElement("td");
tdPersonal.innerText = emp.personalNumber || "";
const tdFirst = document.createElement("td");
tdFirst.innerText = emp.firstName || "";
const tdLast = document.createElement("td");
tdLast.innerText = emp.lastName || "";
const tdPhone = document.createElement("td");
tdPhone.innerText = emp.phone || "";
tr.append(tdPersonal, tdFirst, tdLast, tdPhone);

if (isMajster()) {
const tdAction = document.createElement("td");
tdAction.className = "table-actions";
const editBtn = document.createElement("button");
editBtn.type = "button";
editBtn.className = "secondary-btn";
editBtn.innerText = "Upraviť";
editBtn.addEventListener("click", async () => {
const nextPersonalNumber = window.prompt("Osobné číslo:", emp.personalNumber || "");
if (nextPersonalNumber === null) return;
const nextFirstName = window.prompt("Meno:", emp.firstName || "");
if (nextFirstName === null) return;
const nextLastName = window.prompt("Priezvisko:", emp.lastName || "");
if (nextLastName === null) return;
const nextPhone = window.prompt("Telefónne číslo (môže zostať prázdne):", emp.phone || "");
if (nextPhone === null) return;
const personalNumber = nextPersonalNumber.trim();
const firstName = nextFirstName.trim();
const lastName = nextLastName.trim();
const phone = nextPhone.trim();
if (!personalNumber || !firstName || !lastName) {
window.alert("Osobné číslo, meno aj priezvisko musia byť vyplnené.");
return;
}
await update(ref(db, `employees/${id}`), { personalNumber, firstName, lastName, phone });
const linkedUid = emp.userUid || (latestUsersData?.[id] ? id : "");
if (linkedUid && latestUsersData?.[linkedUid]) {
await update(ref(db, `users/${linkedUid}`), {
personalNumber, firstName, lastName, name: `${firstName} ${lastName}`
});
}
});
const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "delete-btn";
deleteBtn.innerText = "Zmazať";
deleteBtn.addEventListener("click", async () => {
if (!window.confirm(`Naozaj chceš odstrániť zamestnanca ${emp.firstName || ""} ${emp.lastName || ""}?`)) return;
await remove(ref(db, `employees/${id}`));
});
tdAction.append(editBtn, deleteBtn);
tr.appendChild(tdAction);
}
employeesTableBody.appendChild(tr);
});
}

function renderUsersList(usersObj) {
if (!usersRoleList) return;

usersRoleList.innerHTML = "";

if (!isMajster() || !usersObj) return;

const currentUid = auth.currentUser?.uid;
const entries = Object.entries(usersObj);
const list = document.createElement("ul");
list.className = "users-list";

entries.forEach(([uid, u]) => {
const li = document.createElement("li");
const displayName = u.name || u.email || uid;
const shortcutText = u.loginId || (u.email ? u.email.split("@")[0] : "");
const roleText = normalizeRole(u.role);
const assignedLines = getUserAssignedLines(uid);
const lineSummary = assignedLines.length > 0
  ? assignedLines.map((l) => l.name).join(", ")
  : "Nepriradená";

const labelSpan = document.createElement("span");
labelSpan.innerText = `${displayName} [skratka: ${shortcutText}] — ${lineSummary} (${roleText})`;
li.appendChild(labelSpan);

const controlsWrap = document.createElement("div");
controlsWrap.style.display = "flex";
controlsWrap.style.gap = "8px";
controlsWrap.style.alignItems = "center";
controlsWrap.style.flexWrap = "wrap";

const select = document.createElement("select");
select.className = "role-select";

const optMajster = document.createElement("option");
optMajster.value = "majster";
optMajster.innerText = "majster";

const optZamestnanec = document.createElement("option");
optZamestnanec.value = "zamestnanec";
optZamestnanec.innerText = "zamestnanec";

select.append(optMajster, optZamestnanec);
select.value = roleText;

select.addEventListener("change", async () => {
await update(ref(db, `users/${uid}`), {
role: select.value
});
});

controlsWrap.appendChild(select);

if (uid !== currentUid) {
const deleteUserBtn = document.createElement("button");
deleteUserBtn.type = "button";
deleteUserBtn.className = "delete-btn";
deleteUserBtn.innerText = "Zmazať";
deleteUserBtn.addEventListener("click", async () => {
await remove(ref(db, `users/${uid}`));
for (const lineObj of latestLinesList) {
if (latestLineAssignments?.[lineObj.key]?.[uid]) {
await remove(ref(db, `lineAssignments/${lineObj.key}/${uid}`));
}
}
showAddUserMessage(
`Záznam používateľa ${displayName} bol zmazaný z databázy. Ak ho chceš úplne zablokovať, zmaž ho aj v Authentication vo Firebase.`,
false
);
});
controlsWrap.appendChild(deleteUserBtn);
}

li.appendChild(controlsWrap);
list.appendChild(li);
});

usersRoleList.appendChild(list);
}

function renderLinesBoard() {
if (!linesContainer) return;

linesContainer.innerHTML = "";

if (latestLinesList.length === 0) {
const emptyMsg = document.createElement("p");
emptyMsg.innerText = "Zatiaľ nie sú vytvorené žiadne linky.";
linesContainer.appendChild(emptyMsg);
return;
}

const userEntries = latestUsersData
  ? Object.entries(latestUsersData).sort((a, b) => {
      const nameA = (a[1].name || a[1].loginId || "").toLowerCase();
      const nameB = (b[1].name || b[1].loginId || "").toLowerCase();
      return nameA.localeCompare(nameB, "sk");
    })
  : [];

latestLinesList.forEach((lineObj) => {
const card = document.createElement("div");
card.className = "line-box";

const header = document.createElement("div");
header.className = "line-box-header";

const title = document.createElement("h3");
title.innerText = lineObj.name;

const assignedMap = latestLineAssignments?.[lineObj.key] || {};
const assignedUids = Object.keys(assignedMap).filter((uid) => assignedMap[uid]);

const headerRight = document.createElement("div");
headerRight.style.display = "flex";
headerRight.style.gap = "6px";
headerRight.style.alignItems = "center";

const badge = document.createElement("span");
badge.className = "line-count-badge";
badge.innerText = `${assignedUids.length} os.`;
headerRight.appendChild(badge);

if (isMajster()) {
const renameBtn = document.createElement("button");
renameBtn.type = "button";
renameBtn.className = "secondary-btn";
renameBtn.style.padding = "3px 8px";
renameBtn.style.fontSize = "12px";
renameBtn.innerText = "Premenovať";
renameBtn.addEventListener("click", async () => {
const nextName = window.prompt("Zadaj nový názov linky:", lineObj.name);
if (!nextName) return;
const trimmed = nextName.trim();
if (!trimmed || trimmed === lineObj.name) return;
await update(ref(db, `lines/${lineObj.key}`), {
name: trimmed
});
});

const deleteLineBtn = document.createElement("button");
deleteLineBtn.type = "button";
deleteLineBtn.className = "line-remove-btn";
deleteLineBtn.title = "Zmazať linku";
deleteLineBtn.innerText = "Zmazať";
deleteLineBtn.addEventListener("click", async () => {
const confirmed = window.confirm(
`Naozaj chceš zmazať „${lineObj.name}“? Odstránia sa aj priradenia ľudí na tejto linke.`
);
if (!confirmed) return;
await remove(ref(db, `lines/${lineObj.key}`));
await remove(ref(db, `lineAssignments/${lineObj.key}`));
});

headerRight.append(renameBtn, deleteLineBtn);
}

header.append(title, headerRight);
card.appendChild(header);

const membersList = document.createElement("ul");
membersList.className = "line-members-list";

if (assignedUids.length === 0) {
const emptyLi = document.createElement("li");
emptyLi.className = "line-empty-item";
emptyLi.innerText = "Zatiaľ nikto priradený";
membersList.appendChild(emptyLi);
} else {
assignedUids.forEach((uid) => {
const memberLi = document.createElement("li");
memberLi.className = "line-member-item";

const nameSpan = document.createElement("span");
const otherLines = getUserAssignedLines(uid).filter((l) => l.key !== lineObj.key);
nameSpan.innerText = otherLines.length > 0
  ? `${getUserDisplayName(uid)} (aj: ${otherLines.map((l) => l.name).join(", ")})`
  : getUserDisplayName(uid);

memberLi.appendChild(nameSpan);

if (isMajster()) {
const removeBtn = document.createElement("button");
removeBtn.type = "button";
removeBtn.className = "line-remove-btn";
removeBtn.title = "Odobrať z linky";
removeBtn.innerText = "Odobrať";
removeBtn.addEventListener("click", async () => {
await remove(ref(db, `lineAssignments/${lineObj.key}/${uid}`));
});
memberLi.appendChild(removeBtn);
}

membersList.appendChild(memberLi);
});
}

card.appendChild(membersList);

if (isMajster()) {
const assignRow = document.createElement("div");
assignRow.className = "line-assign-row";

const searchWrap = document.createElement("div");
searchWrap.className = "person-search-wrap";

const personSearch = document.createElement("input");
personSearch.type = "search";
personSearch.className = "person-search-input";
personSearch.placeholder = "Napíš meno alebo skratku";
personSearch.autocomplete = "off";
personSearch.setAttribute("aria-label", "Vyhľadať človeka");

const resultsList = document.createElement("div");
resultsList.className = "person-search-results";
resultsList.style.display = "none";

let selectedUid = "";

const availableUsers = userEntries
  .filter(([uid]) => !assignedMap[uid])
  .map(([uid, u]) => {
    const displayName = u.name || u.loginId || u.email || uid;
    const shortcut = u.loginId || (u.email ? u.email.split("@")[0] : "");
    const existingLines = getUserAssignedLines(uid);
    const lineText = existingLines.length > 0
      ? existingLines.map((l) => l.name).join(", ")
      : "Nepriradený";

    return {
      uid,
      displayName,
      shortcut,
      lineText,
      searchText: normalizeShortcut(`${displayName} ${shortcut}`)
    };
  });

function closeSearchResults() {
  resultsList.style.display = "none";
}

function renderSearchResults() {
  const query = normalizeShortcut(personSearch.value);
  resultsList.innerHTML = "";
  selectedUid = "";

  const matches = availableUsers
    .filter((person) => !query || person.searchText.includes(query))
    .slice(0, 12);

  if (matches.length === 0) {
    const emptyResult = document.createElement("div");
    emptyResult.className = "person-search-empty";
    emptyResult.innerText = "Nenašiel sa žiadny človek";
    resultsList.appendChild(emptyResult);
  } else {
    matches.forEach((person) => {
      const resultBtn = document.createElement("button");
      resultBtn.type = "button";
      resultBtn.className = "person-search-option";

      const resultName = document.createElement("span");
      resultName.className = "person-search-name";
      resultName.innerText = person.displayName;

      const resultMeta = document.createElement("span");
      resultMeta.className = "person-search-meta";
      resultMeta.innerText = `${person.shortcut} · ${person.lineText}`;

      resultBtn.append(resultName, resultMeta);
      resultBtn.addEventListener("click", () => {
        selectedUid = person.uid;
        personSearch.value = person.displayName;
        closeSearchResults();
      });

      resultsList.appendChild(resultBtn);
    });
  }

  resultsList.style.display = "block";
}

personSearch.addEventListener("focus", renderSearchResults);
personSearch.addEventListener("input", renderSearchResults);
personSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSearchResults();
});
personSearch.addEventListener("blur", () => {
  window.setTimeout(closeSearchResults, 150);
});

searchWrap.append(personSearch, resultsList);

const addBtn = document.createElement("button");
addBtn.type = "button";
addBtn.className = "primary-btn line-add-btn";
addBtn.innerText = "Pridať";

addBtn.addEventListener("click", async () => {
if (!selectedUid) {
  window.alert("Najprv vyhľadaj a vyber človeka zo zoznamu.");
  personSearch.focus();
  return;
}

if (assignedMap[selectedUid]) return;

const existingOtherLines = getUserAssignedLines(selectedUid).filter(
(l) => l.key !== lineObj.key
);

if (existingOtherLines.length > 0) {
const personName = getUserDisplayName(selectedUid);
const linesText = existingOtherLines.map((l) => l.name).join(", ");
const confirmed = window.confirm(
`Upozornenie: Používateľ „${personName}“ je už priradený na: ${linesText}.\n\nNaozaj ho chceš pridať súčasne aj na ${lineObj.name}?`
);
if (!confirmed) {
return;
}
}

await set(ref(db, `lineAssignments/${lineObj.key}/${selectedUid}`), true);
});

assignRow.append(searchWrap, addBtn);
card.appendChild(assignRow);
}

linesContainer.appendChild(card);
});
}

const SHIFT_LABELS = {
  ranna: "Ranná",
  poobedna: "Poobedná",
  nocna: "Nočná",
  volno: "Voľno"
};

function dateKeyLocal(date) {
const y = date.getFullYear();
const m = String(date.getMonth() + 1).padStart(2, "0");
const d = String(date.getDate()).padStart(2, "0");
return `${y}-${m}-${d}`;
}

function mondayOfWeek(date) {
const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
const day = result.getDay() || 7;
result.setDate(result.getDate() - day + 1);
result.setHours(0, 0, 0, 0);
return result;
}

function defaultShiftForDate(date) {
// Referenčný týždeň 16. 11. 2026 je poobedná zmena.
const anchorMonday = new Date(2026, 10, 16);
const weekMonday = mondayOfWeek(date);
const weekDiff = Math.round((weekMonday - anchorMonday) / 604800000);
const cycle = ((weekDiff % 3) + 3) % 3;
const day = date.getDay();

if (cycle === 0) return day >= 1 && day <= 5 ? "poobedna" : "volno";
if (cycle === 1) return day >= 1 && day <= 5 ? "ranna" : "volno";
// Nočná: prvý nástup v nedeľu, posledný nástup vo štvrtok.
return (day === 0 || (day >= 1 && day <= 4)) ? "nocna" : "volno";
}

function absenceForDate(uid, key) {
const raw = isMajster() ? latestAbsencesData?.[uid] : latestAbsencesData;
if (!raw) return null;
return Object.values(raw).find((item) => {
const active = item.type === "dovolenka" ? item.status === "approved" : item.status === "reported";
return active && item.dateFrom <= key && item.dateTo >= key;
}) || null;
}

function fillCalendarEmployeeSelect() {
if (!calendarEmployeeSelect || !isMajster()) return;
const previous = selectedCalendarUid || calendarEmployeeSelect.value;
calendarEmployeeSelect.innerHTML = "";
const entries = latestUsersData ? Object.entries(latestUsersData).sort((a, b) => {
return getUserDisplayName(a[0]).localeCompare(getUserDisplayName(b[0]), "sk");
}) : [];
entries.forEach(([uid]) => {
const option = document.createElement("option");
option.value = uid;
option.innerText = getUserDisplayName(uid);
calendarEmployeeSelect.appendChild(option);
});
selectedCalendarUid = entries.some(([uid]) => uid === previous) ? previous : (entries[0]?.[0] || "");
calendarEmployeeSelect.value = selectedCalendarUid;
}

function subscribeToCalendar(uid) {
if (!uid) return;
const path = `workCalendars/${uid}`;
if (calendarSubscribedPath === path) {
renderWorkCalendar();
return;
}
calendarSubscribedPath = path;
onValue(ref(db, path), (snapshot) => {
latestCalendarOverrides = snapshot.exists() ? snapshot.val() : null;
renderWorkCalendar();
});
}

async function editCalendarDay(uid, key, currentShift) {
if (!isMajster()) return;
const answer = window.prompt(
`Zmena pre ${getUserDisplayName(uid)} dňa ${formatDateSk(key)}:\n\nNapíš: ranna, poobedna, nocna, volno alebo predvolena`,
currentShift
);
if (answer === null) return;
const normalized = normalizeShortcut(answer);
if (normalized === "predvolena" || normalized === "predvolene" || normalized === "default") {
await remove(ref(db, `workCalendars/${uid}/${key}`));
return;
}
if (!Object.prototype.hasOwnProperty.call(SHIFT_LABELS, normalized)) {
window.alert("Použi hodnotu: ranna, poobedna, nocna, volno alebo predvolena.");
return;
}
const note = window.prompt("Poznámka k zmene (nepovinné):", latestCalendarOverrides?.[key]?.note || "");
if (note === null) return;
await set(ref(db, `workCalendars/${uid}/${key}`), {
shift: normalized,
note: note.trim(),
updatedAt: Date.now(),
updatedBy: auth.currentUser.uid
});
}

function renderWorkCalendar() {
if (!workCalendar || !calendarMonthInput?.value) return;
const uid = isMajster() ? selectedCalendarUid : auth.currentUser?.uid;
if (!uid) {
workCalendar.innerHTML = "<p>Nie je vybraný žiadny zamestnanec.</p>";
return;
}
const [year, month] = calendarMonthInput.value.split("-").map(Number);
const first = new Date(year, month - 1, 1);
const last = new Date(year, month, 0);
const gridStart = mondayOfWeek(first);
const gridEnd = new Date(last);
const endDay = gridEnd.getDay() || 7;
gridEnd.setDate(gridEnd.getDate() + (7 - endDay));

workCalendar.innerHTML = "";
["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].forEach((label) => {
const head = document.createElement("div");
head.className = "calendar-weekday";
head.innerText = label;
workCalendar.appendChild(head);
});

for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
const dayDate = new Date(cursor);
const key = dateKeyLocal(dayDate);
const override = latestCalendarOverrides?.[key];
const shift = override?.shift || defaultShiftForDate(dayDate);
const absence = absenceForDate(uid, key);
const cell = document.createElement("button");
cell.type = "button";
cell.className = `calendar-day shift-${absence ? "nepritomnost" : shift}`;
if (dayDate.getMonth() !== month - 1) cell.classList.add("outside-month");
if (key === dateKeyLocal(new Date())) cell.classList.add("today");
if (!isMajster()) cell.disabled = true;

const number = document.createElement("span");
number.className = "calendar-day-number";
number.innerText = dayDate.getDate();
const label = document.createElement("span");
label.className = "calendar-shift-label";
label.innerText = absence ? absenceTypeLabel(absence.type) : SHIFT_LABELS[shift];
cell.append(number, label);
if (override?.note) {
const note = document.createElement("span");
note.className = "calendar-day-note";
note.innerText = override.note;
cell.appendChild(note);
}
if (isMajster()) cell.addEventListener("click", () => editCalendarDay(uid, key, shift));
workCalendar.appendChild(cell);
}
}

function formatDateSk(value) {
if (!value) return "";
const [year, month, day] = value.split("-");
return `${day}.${month}.${year}`;
}

function absenceTypeLabel(type) {
if (type === "dovolenka") return "Dovolenka";
if (type === "pn") return "PN";
if (type === "paragraf") return "Paragraf";
return type || "";
}

function absenceStatusLabel(status) {
if (status === "pending") return "Čaká na schválenie";
if (status === "approved") return "Schválené";
if (status === "rejected") return "Zamietnuté";
if (status === "reported") return "Nahlásené";
return status || "";
}

function flattenAbsences(raw) {
if (!raw) return [];
if (!isMajster()) {
return Object.entries(raw).map(([requestId, item]) => ({ requestId, ...item }));
}
const result = [];
Object.entries(raw).forEach(([uid, requests]) => {
Object.entries(requests || {}).forEach(([requestId, item]) => {
result.push({ uid, requestId, ...item });
});
});
return result;
}

function renderAbsences() {
if (!absencesTableBody) return;
absencesTableBody.innerHTML = "";
if (absenceAdminNotice) absenceAdminNotice.style.display = isMajster() ? "block" : "none";

const rows = flattenAbsences(latestAbsencesData).sort((a, b) => {
return (b.createdAt || 0) - (a.createdAt || 0);
});

if (rows.length === 0) {
const tr = document.createElement("tr");
const td = document.createElement("td");
td.colSpan = isMajster() ? 7 : 6;
td.innerText = "Zatiaľ nie sú evidované žiadne neprítomnosti.";
tr.appendChild(td);
absencesTableBody.appendChild(tr);
return;
}

rows.forEach((item) => {
const tr = document.createElement("tr");
if (isMajster()) {
const tdName = document.createElement("td");
tdName.innerText = item.employeeName || getUserDisplayName(item.uid);
tr.appendChild(tdName);
}
const tdType = document.createElement("td");
tdType.innerText = absenceTypeLabel(item.type);
const tdTerm = document.createElement("td");
tdTerm.innerText = item.dateFrom === item.dateTo
  ? formatDateSk(item.dateFrom)
  : `${formatDateSk(item.dateFrom)} – ${formatDateSk(item.dateTo)}`;
const tdNote = document.createElement("td");
tdNote.innerText = item.note || "";
const tdStatus = document.createElement("td");
const badge = document.createElement("span");
badge.className = `absence-status status-${item.status || "pending"}`;
badge.innerText = absenceStatusLabel(item.status);
tdStatus.appendChild(badge);
const tdDecision = document.createElement("td");
tdDecision.innerText = item.decisionNote || "";
tr.append(tdType, tdTerm, tdNote, tdStatus, tdDecision);

const tdAction = document.createElement("td");
if (isMajster() && item.type === "dovolenka" && item.status === "pending") {
const approveBtn = document.createElement("button");
approveBtn.type = "button";
approveBtn.className = "approve-btn";
approveBtn.innerText = "Schváliť";
approveBtn.addEventListener("click", async () => {
await update(ref(db, `absences/${item.uid}/${item.requestId}`), {
status: "approved",
decisionNote: "",
decidedAt: Date.now(),
decidedBy: auth.currentUser.uid
});
});
const rejectBtn = document.createElement("button");
rejectBtn.type = "button";
rejectBtn.className = "delete-btn";
rejectBtn.innerText = "Zamietnuť";
rejectBtn.addEventListener("click", async () => {
const reason = window.prompt("Napíš dôvod zamietnutia:", "");
if (reason === null) return;
if (!reason.trim()) {
window.alert("Pri zamietnutí musíš uviesť dôvod.");
return;
}
await update(ref(db, `absences/${item.uid}/${item.requestId}`), {
status: "rejected",
decisionNote: reason.trim(),
decidedAt: Date.now(),
decidedBy: auth.currentUser.uid
});
});
tdAction.className = "table-actions";
tdAction.append(approveBtn, rejectBtn);
} else {
tdAction.innerText = "";
}
tr.appendChild(tdAction);
absencesTableBody.appendChild(tr);
});

const headerPerson = document.getElementById("absencePersonHeader");
if (headerPerson) headerPerson.style.display = isMajster() ? "" : "none";
}

function subscribeToAbsences(user) {
const path = isMajster() ? "absences" : `absences/${user.uid}`;
if (absencesSubscribedPath === path) return;
absencesSubscribedPath = path;
onValue(ref(db, path), (snapshot) => {
latestAbsencesData = snapshot.exists() ? snapshot.val() : null;
renderAbsences();
});
}

async function syncUsersToEmployees(usersObj, employeesObj) {
if (!isMajster() || !usersObj) return;
const writes = [];
Object.entries(usersObj).forEach(([uid, userData]) => {
if (employeesObj?.[uid]) return;
const fullName = (userData.name || "").trim();
let firstName = (userData.firstName || "").trim();
let lastName = (userData.lastName || "").trim();
if (!firstName && fullName) {
const parts = fullName.split(/\s+/).filter(Boolean);
firstName = parts.shift() || "";
lastName = lastName || parts.join(" ");
}
writes.push(set(ref(db, `employees/${uid}`), {
personalNumber: userData.personalNumber || "",
firstName: firstName || userData.loginId || "Používateľ",
lastName,
phone: "",
userUid: uid
}));
});
if (writes.length) await Promise.all(writes);
}

function subscribeToData() {
if (dataLoaded) return;
dataLoaded = true;
console.time("MT21B načítanie dát");
let initialDataParts = 0;
const markInitialPartLoaded = () => {
initialDataParts += 1;
if (initialDataParts === 4) console.timeEnd("MT21B načítanie dát");
};

let linesLoadedOnce = false;
onValue(ref(db, "lines"), (snapshot) => {
if (!linesLoadedOnce) { linesLoadedOnce = true; markInitialPartLoaded(); }
const val = snapshot.exists() ? snapshot.val() : null;
latestLinesList = parseLinesSnapshot(val);

const linesCountEl = document.getElementById("linesCount");
if (linesCountEl) {
linesCountEl.innerText = latestLinesList.length;
}

renderLinesBoard();
renderUsersList(latestUsersData);
});

let employeesLoadedOnce = false;
onValue(ref(db, "employees"), (snapshot) => {
if (!employeesLoadedOnce) { employeesLoadedOnce = true; markInitialPartLoaded(); }
const val = snapshot.exists() ? snapshot.val() : null;
latestEmployeesData = val;

const countEl = document.getElementById("employeeCount");
if (countEl) {
countEl.innerText = val ? Object.keys(val).length : 0;
}

renderEmployeesTable(val);
});

let usersLoadedOnce = false;
onValue(ref(db, "users"), (snapshot) => {
if (!usersLoadedOnce) { usersLoadedOnce = true; markInitialPartLoaded(); }
const val = snapshot.exists() ? snapshot.val() : null;
latestUsersData = val;
const count = val ? Object.keys(val).length : 0;

const countEl = document.getElementById("userCount");
if (countEl) {
countEl.innerText = count;
}

const detailCountEl = document.getElementById("usersDetailCount");
if (detailCountEl) {
detailCountEl.innerText = count;
}

const currentAuthUser = auth.currentUser;
if (currentAuthUser && val && val[currentAuthUser.uid] && val[currentAuthUser.uid].role) {
const updatedRole = normalizeRole(val[currentAuthUser.uid].role);
if (updatedRole !== currentUserRole) {
currentUserRole = updatedRole;
applyRoleUI();
return;
}
}

renderUsersList(val);
renderLinesBoard();
fillCalendarEmployeeSelect();
});

let assignmentsLoadedOnce = false;
onValue(ref(db, "lineAssignments"), (snapshot) => {
if (!assignmentsLoadedOnce) { assignmentsLoadedOnce = true; markInitialPartLoaded(); }
latestLineAssignments = snapshot.exists() ? snapshot.val() : {};
renderLinesBoard();
renderUsersList(latestUsersData);
});
}

function openSection(sectionName) {
if (sectionName === "users" && !isMajster()) {
return;
}

overviewSection.style.display = "none";
detailSection.style.display = "block";

employeesView.style.display = "none";
usersView.style.display = "none";
linesView.style.display = "none";
absencesView.style.display = "none";
calendarView.style.display = "none";

if (sectionName === "employees") {
detailTitle.innerText = "Zamestnanci";
employeesView.style.display = "block";
renderEmployeesTable(latestEmployeesData);
} else if (sectionName === "users") {
detailTitle.innerText = "Používatelia";
usersView.style.display = "block";
renderUsersList(latestUsersData);
} else if (sectionName === "lines") {
detailTitle.innerText = "Linky";
linesView.style.display = "block";
renderLinesBoard();
} else if (sectionName === "calendar") {
detailTitle.innerText = isMajster() ? "Pracovné kalendáre" : "Môj pracovný kalendár";
calendarView.style.display = "block";
if (!calendarMonthInput.value) calendarMonthInput.value = dateKeyLocal(new Date()).slice(0, 7);
if (isMajster()) fillCalendarEmployeeSelect();
selectedCalendarUid = isMajster() ? calendarEmployeeSelect.value : auth.currentUser.uid;
subscribeToCalendar(selectedCalendarUid);
} else if (sectionName === "absences") {
detailTitle.innerText = "Neprítomnosti";
absencesView.style.display = "block";
renderAbsences();
}
}

document.querySelectorAll(".clickable-card").forEach((card) => {
card.addEventListener("click", () => {
const target = card.getAttribute("data-section");
openSection(target);
});
});

if (backToOverviewBtn) {
backToOverviewBtn.addEventListener("click", backToOverview);
}

if (addLineForm) {
addLineForm.addEventListener("submit", async (e) => {
e.preventDefault();

if (!isMajster()) return;

const rawName = newLineNameInput?.value.trim() || "";
if (!rawName) return;

const nextOrder = latestLinesList.length > 0
  ? Math.max(...latestLinesList.map((l) => l.order)) + 1
  : 1;

const newLineRef = push(ref(db, "lines"));
await set(newLineRef, {
name: rawName,
order: nextOrder
});

addLineForm.reset();
newLineNameInput.focus();
});
}

if (addEmployeeForm) {
addEmployeeForm.addEventListener("submit", async (e) => {
e.preventDefault();

if (!isMajster()) return;

const personalInput = document.getElementById("empPersonalNumber");
const firstInput = document.getElementById("empFirstName");
const lastInput = document.getElementById("empLastName");
const phoneInput = document.getElementById("empPhone");

const personalNumber = personalInput.value.trim();
const firstName = firstInput.value.trim();
const lastName = lastInput.value.trim();
const phone = phoneInput ? phoneInput.value.trim() : "";

if (!personalNumber || !firstName || !lastName) return;

const newEmpRef = push(ref(db, "employees"));
await set(newEmpRef, {
personalNumber,
firstName,
lastName,
phone
});

addEmployeeForm.reset();
personalInput.focus();
});
}

if (addUserForm) {
addUserForm.addEventListener("submit", async (e) => {
e.preventDefault();

if (!isMajster()) return;

const nameInput = document.getElementById("newUserName");
const shortcutInput = document.getElementById("newUserShortcut");
const passwordInput = document.getElementById("newUserPassword");
const submitBtn = addUserForm.querySelector("button[type='submit']");

const fullNameWithDiacritics = nameInput.value.trim();
const cleanShortcut = normalizeShortcut(shortcutInput.value);
const password = passwordInput.value;

if (!fullNameWithDiacritics || !cleanShortcut || !password) {
showAddUserMessage("Vyplň meno s diakritikou, skratku aj heslo.", true);
return;
}

if (password.length < 6) {
showAddUserMessage("Heslo musí mať aspoň 6 znakov.", true);
return;
}

const authEmail = `${cleanShortcut}@mt21b.local`;

if (submitBtn) submitBtn.disabled = true;

let secondaryApp = null;

try {
const existingSecondary = getApps().find((a) => a.name === "SecondaryUserCreator");
secondaryApp = existingSecondary || initializeApp(firebaseConfig, "SecondaryUserCreator");
const secondaryAuth = getAuth(secondaryApp);

const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
const newUid = cred.user.uid;

const nameParts = fullNameWithDiacritics.split(/\s+/).filter(Boolean);
const firstName = nameParts.shift() || fullNameWithDiacritics;
const lastName = nameParts.join(" ");
await set(ref(db, `users/${newUid}`), {
email: authEmail,
loginId: cleanShortcut,
name: fullNameWithDiacritics,
firstName,
lastName,
personalNumber: password,
role: "zamestnanec"
});
await set(ref(db, `employees/${newUid}`), {
personalNumber: password,
firstName,
lastName,
phone: "",
userUid: newUid
});

await secondarySignOut(secondaryAuth);
addUserForm.reset();
showAddUserMessage(
`Používateľ „${fullNameWithDiacritics}“ (prihlasovacia skratka: ${cleanShortcut}) bol pridaný s rolou zamestnanec.`,
false
);
} catch (err) {
const code = err?.code || "";
let msg = err?.message || "Nepodarilo sa vytvoriť používateľa.";
if (code === "auth/email-already-in-use") msg = "Táto prihlasovacia skratka už existuje.";
else if (code === "auth/invalid-email") msg = "Neplatná prihlasovacia skratka.";
else if (code === "auth/weak-password") msg = "Heslo je príliš slabé (min. 6 znakov).";
showAddUserMessage(msg, true);
} finally {
if (secondaryApp) {
await deleteApp(secondaryApp).catch(() => {});
}
if (submitBtn) submitBtn.disabled = false;
}
});
}

if (calendarMonthInput) {
calendarMonthInput.value = dateKeyLocal(new Date()).slice(0, 7);
calendarMonthInput.addEventListener("change", renderWorkCalendar);
}
if (calendarTodayBtn) {
calendarTodayBtn.addEventListener("click", () => {
calendarMonthInput.value = dateKeyLocal(new Date()).slice(0, 7);
renderWorkCalendar();
});
}
if (calendarEmployeeSelect) {
calendarEmployeeSelect.addEventListener("change", () => {
selectedCalendarUid = calendarEmployeeSelect.value;
calendarSubscribedPath = "";
latestCalendarOverrides = null;
subscribeToCalendar(selectedCalendarUid);
});
}

if (absenceForm) {
absenceForm.addEventListener("submit", async (e) => {
e.preventDefault();
const user = auth.currentUser;
if (!user) return;
const type = absenceTypeInput.value;
const dateFrom = absenceDateFromInput.value;
const dateTo = absenceDateToInput.value;
const note = absenceNoteInput.value.trim();
if (!type || !dateFrom || !dateTo) return;
if (dateTo < dateFrom) {
absenceMessage.style.display = "block";
absenceMessage.className = "auth-message msg-error";
absenceMessage.innerText = "Dátum do nemôže byť skôr ako dátum od.";
return;
}
const userData = latestUsersData?.[user.uid] || {};
const requestRef = push(ref(db, `absences/${user.uid}`));
await set(requestRef, {
uid: user.uid,
employeeName: userData.name || user.email?.split("@")[0] || "Používateľ",
type,
dateFrom,
dateTo,
note,
status: type === "dovolenka" ? "pending" : "reported",
decisionNote: "",
createdAt: Date.now()
});
absenceForm.reset();
absenceMessage.style.display = "block";
absenceMessage.className = "auth-message msg-success";
absenceMessage.innerText = type === "dovolenka" ? "Žiadosť o dovolenku bola odoslaná." : "Neprítomnosť bola nahlásená.";
});
}

setupEmployeesUI();

onAuthStateChanged(auth, async (user) => {
const userEl = document.getElementById("currentUser");

if (user) {
if (userEl) {
userEl.innerText = user.email ? user.email.split("@")[0] : "Používateľ";
}
await ensureUserRole(user);
subscribeToData();
subscribeToAbsences(user);
selectedCalendarUid = user.uid;
subscribeToCalendar(user.uid);
} else {
location.href = "index.html";
}
});

document
.getElementById("logoutBtn")
.addEventListener(
"click",
async ()=>{

await signOut(auth);

location.href =
"index.html";

});