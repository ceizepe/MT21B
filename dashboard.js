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

const employeesView = document.getElementById("employeesView");
const usersView = document.getElementById("usersView");
const linesView = document.getElementById("linesView");
const groupsView = document.getElementById("groupsView");

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

function renderEmployeesTable(employeesObj) {
if (!employeesTableBody) return;

employeesTableBody.innerHTML = "";
const colSpan = isMajster() ? 5 : 4;

if (!employeesObj) {
employeesTableBody.innerHTML = `<tr><td colspan="${colSpan}">Zatiaľ nie sú pridaní žiadni zamestnanci.</td></tr>`;
return;
}

const entries = Object.entries(employeesObj);

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
const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "delete-btn";
deleteBtn.innerText = "Zmazať";
deleteBtn.addEventListener("click", async () => {
await remove(ref(db, `employees/${id}`));
});

tdAction.appendChild(deleteBtn);
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

function subscribeToData() {
if (dataLoaded) return;
dataLoaded = true;

ensureDefaultLinesExist().catch(() => {});

onValue(ref(db, "lines"), (snapshot) => {
const val = snapshot.exists() ? snapshot.val() : null;
latestLinesList = parseLinesSnapshot(val);

const linesCountEl = document.getElementById("linesCount");
if (linesCountEl) {
linesCountEl.innerText = latestLinesList.length;
}

renderLinesBoard();
renderUsersList(latestUsersData);
});

onValue(ref(db, "employees"), (snapshot) => {
const val = snapshot.exists() ? snapshot.val() : null;
latestEmployeesData = val;

const countEl = document.getElementById("employeeCount");
if (countEl) {
countEl.innerText = val ? Object.keys(val).length : 0;
}

renderEmployeesTable(val);
});

onValue(ref(db, "users"), (snapshot) => {
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
});

onValue(ref(db, "lineAssignments"), (snapshot) => {
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
groupsView.style.display = "none";

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
} else if (sectionName === "groups") {
detailTitle.innerText = "Skupiny";
groupsView.style.display = "block";
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
const phone = phoneInput.value.trim();

if (!personalNumber || !firstName || !lastName || !phone) return;

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

await set(ref(db, `users/${newUid}`), {
email: authEmail,
loginId: cleanShortcut,
name: fullNameWithDiacritics,
role: "zamestnanec"
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

onAuthStateChanged(auth, async (user) => {
const userEl = document.getElementById("currentUser");

if (user) {
if (userEl) {
userEl.innerText = user.email ? user.email.split("@")[0] : "Používateľ";
}
await ensureUserRole(user);
subscribeToData();
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