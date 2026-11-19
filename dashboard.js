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

const LINES = [
"Nepriradená",
"Linka 1",
"Linka 2",
"Linka 3",
"Linka 4",
"Linka 5",
"Linka 6",
"Linka 7",
"Linka 8"
];

let dataLoaded = false;
let latestEmployeesData = null;
let latestUsersData = null;
let currentUserRole = "zamestnanec";

const overviewSection = document.getElementById("overviewSection");
const detailSection = document.getElementById("detailSection");
const detailTitle = document.getElementById("detailTitle");
const backToOverviewBtn = document.getElementById("backToOverviewBtn");
const usersCard = document.getElementById("usersCard");

const employeesView = document.getElementById("employeesView");
const usersView = document.getElementById("usersView");
const groupsView = document.getElementById("groupsView");

const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeeRoleNotice = document.getElementById("employeeRoleNotice");
const actionColHeader = document.getElementById("actionColHeader");
const employeesTableBody = document.getElementById("employeesTableBody");

const addUserForm = document.getElementById("addUserForm");
const addUserStatus = document.getElementById("addUserStatus");
const usersRoleList = document.getElementById("usersRoleList");
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

if (actionColHeader) {
actionColHeader.style.display = isMajster() ? "" : "none";
}

renderEmployeesTable(latestEmployeesData);
renderUsersList(latestUsersData);
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
line: "Nepriradená",
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
const currentLine = u.line || "Nepriradená";

const labelSpan = document.createElement("span");
labelSpan.innerText = `${displayName} [skratka: ${shortcutText}] — ${currentLine} (${roleText})`;
li.appendChild(labelSpan);

const controlsWrap = document.createElement("div");
controlsWrap.style.display = "flex";
controlsWrap.style.gap = "8px";
controlsWrap.style.alignItems = "center";
controlsWrap.style.flexWrap = "wrap";

const lineSelect = document.createElement("select");
lineSelect.className = "role-select";
LINES.forEach((lineName) => {
const opt = document.createElement("option");
opt.value = lineName;
opt.innerText = lineName;
lineSelect.appendChild(opt);
});
lineSelect.value = LINES.includes(currentLine) ? currentLine : "Nepriradená";
lineSelect.addEventListener("change", async () => {
await update(ref(db, `users/${uid}`), {
line: lineSelect.value
});
});

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

controlsWrap.append(lineSelect, select);

if (uid !== currentUid) {
const deleteUserBtn = document.createElement("button");
deleteUserBtn.type = "button";
deleteUserBtn.className = "delete-btn";
deleteUserBtn.innerText = "Zmazať";
deleteUserBtn.addEventListener("click", async () => {
await remove(ref(db, `users/${uid}`));
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

function subscribeToData() {
if (dataLoaded) return;
dataLoaded = true;

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
groupsView.style.display = "none";

if (sectionName === "employees") {
detailTitle.innerText = "Zamestnanci";
employeesView.style.display = "block";
renderEmployeesTable(latestEmployeesData);
} else if (sectionName === "users") {
detailTitle.innerText = "Používatelia";
usersView.style.display = "block";
renderUsersList(latestUsersData);
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
line: "Nepriradená",
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
