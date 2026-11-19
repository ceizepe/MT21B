import { db, auth }
from "./firebase-config.js";

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

let dataLoaded = false;
let latestEmployeesData = null;
let latestUsersData = null;
let currentUserRole = "zamestnanec";

const overviewSection = document.getElementById("overviewSection");
const detailSection = document.getElementById("detailSection");
const detailTitle = document.getElementById("detailTitle");
const backToOverviewBtn = document.getElementById("backToOverviewBtn");

const employeesView = document.getElementById("employeesView");
const usersView = document.getElementById("usersView");
const groupsView = document.getElementById("groupsView");

const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeeRoleNotice = document.getElementById("employeeRoleNotice");
const actionColHeader = document.getElementById("actionColHeader");
const employeesTableBody = document.getElementById("employeesTableBody");
const usersRoleList = document.getElementById("usersRoleList");
const roleBadge = document.getElementById("roleBadge");

function normalizeRole(rawRole) {
if (rawRole === "majster" || rawRole === "admin") {
return "majster";
}
return "zamestnanec";
}

function isMajster() {
return currentUserRole === "majster";
}

function applyRoleUI() {
if (roleBadge) {
roleBadge.innerText = currentUserRole;
roleBadge.classList.remove("role-majster", "role-zamestnanec");
roleBadge.classList.add(isMajster() ? "role-majster" : "role-zamestnanec");
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
currentUserRole = defaultRole;
await set(userRef, {
email: user.email || "",
name: user.email ? user.email.split("@")[0] : "Používateľ",
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

if (!usersObj) return;

const entries = Object.entries(usersObj);
const list = document.createElement("ul");
list.className = "users-list";

entries.forEach(([uid, u]) => {
const li = document.createElement("li");
const displayName = u.name || u.email || uid;
const roleText = normalizeRole(u.role);

const labelSpan = document.createElement("span");
labelSpan.innerText = `${displayName} (${roleText})`;
li.appendChild(labelSpan);

if (isMajster()) {
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

li.appendChild(select);
}

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
backToOverviewBtn.addEventListener("click", () => {
detailSection.style.display = "none";
overviewSection.style.display = "flex";
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
