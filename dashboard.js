import { db, auth }
from "./firebase-config.js";

import {
ref,
onValue,
push,
set,
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

const overviewSection = document.getElementById("overviewSection");
const detailSection = document.getElementById("detailSection");
const detailTitle = document.getElementById("detailTitle");
const backToOverviewBtn = document.getElementById("backToOverviewBtn");

const employeesView = document.getElementById("employeesView");
const usersView = document.getElementById("usersView");
const groupsView = document.getElementById("groupsView");

const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeesTableBody = document.getElementById("employeesTableBody");

function renderEmployeesTable(employeesObj) {
if (!employeesTableBody) return;

employeesTableBody.innerHTML = "";

if (!employeesObj) {
employeesTableBody.innerHTML = `<tr><td colspan="5">Zatiaľ nie sú pridaní žiadni zamestnanci.</td></tr>`;
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

const tdAction = document.createElement("td");
const deleteBtn = document.createElement("button");
deleteBtn.type = "button";
deleteBtn.className = "delete-btn";
deleteBtn.innerText = "Zmazať";
deleteBtn.addEventListener("click", async () => {
await remove(ref(db, `employees/${id}`));
});

tdAction.appendChild(deleteBtn);
tr.append(tdPersonal, tdFirst, tdLast, tdPhone, tdAction);
employeesTableBody.appendChild(tr);
});
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
const count = val ? Object.keys(val).length : 0;

const countEl = document.getElementById("userCount");
if (countEl) {
countEl.innerText = count;
}

const detailCountEl = document.getElementById("usersDetailCount");
if (detailCountEl) {
detailCountEl.innerText = count;
}
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

onAuthStateChanged(auth, (user) => {
const userEl = document.getElementById("currentUser");

if (user) {
if (userEl) {
userEl.innerText = user.email ? user.email.split("@")[0] : "Používateľ";
}
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
