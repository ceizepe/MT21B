import { auth }
from "./firebase-config.js";

import {
signInWithEmailAndPassword
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const form =
document.getElementById("loginForm");

form.addEventListener("submit",
async (e) => {

e.preventDefault();

const username =
document.getElementById("username")
.value.trim();

const password =
document.getElementById("password")
.value;

const email =
`${username}@mt21b.local`;

try {

await signInWithEmailAndPassword(
auth,
email,
password
);

location.href =
"dashboard.html";

}
catch(error){

document.getElementById(
"message"
).innerText =
"Neplatné prihlasovacie údaje";

}

});