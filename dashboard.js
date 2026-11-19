import { db, auth }
from "./firebase-config.js";

import {
ref,
get
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import {
signOut,
onAuthStateChanged
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

async function loadData(){

const emp=
await get(ref(db,"employees"));

const users=
await get(ref(db,"users"));

document.getElementById(
"employeeCount"
).innerText =
emp.exists()
? Object.keys(emp.val()).length
: 0;

document.getElementById(
"userCount"
).innerText =
users.exists()
? Object.keys(users.val()).length
: 0;
}

onAuthStateChanged(auth, (user) => {
const userEl = document.getElementById("currentUser");

if (user) {
if (userEl) {
userEl.innerText = user.email ? user.email.split("@")[0] : "Používateľ";
}
loadData();
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
