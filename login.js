import { db, auth }
from "./firebase-config.js";

import {
signInWithEmailAndPassword,
createUserWithEmailAndPassword,
onAuthStateChanged
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
ref,
set,
get
}
from
"https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const authTitle = document.getElementById("authTitle");
const authForm = document.getElementById("authForm");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authMessage = document.getElementById("authMessage");

const registerFields = document.getElementById("registerFields");
const confirmPasswordWrap = document.getElementById("confirmPasswordWrap");
const regNameInput = document.getElementById("regName");
const emailInput = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const confirmPasswordInput = document.getElementById("regPasswordConfirm");

let mode = "login";
let isSubmitting = false;

function normalizeShortcut(raw) {
return raw
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9._-]/g, "");
}

function toAuthEmail(inputValue) {
const trimmed = inputValue.trim().toLowerCase();
if (!trimmed) return "";
if (trimmed.includes("@")) return trimmed;
const cleanId = normalizeShortcut(trimmed);
return cleanId ? `${cleanId}@mt21b.local` : "";
}

function showMessage(text, isError = true) {
if (!authMessage) return;
authMessage.style.display = "block";
authMessage.innerText = text;
authMessage.classList.remove("msg-error", "msg-success");
authMessage.classList.add(isError ? "msg-error" : "msg-success");
}

function clearMessage() {
if (!authMessage) return;
authMessage.style.display = "none";
authMessage.innerText = "";
}

function setMode(newMode) {
mode = newMode;
clearMessage();

const isRegister = mode === "register";
tabLogin.classList.toggle("active", !isRegister);
tabRegister.classList.toggle("active", isRegister);
authTitle.innerText = isRegister ? "Registrácia" : "Prihlásenie";
authSubmitBtn.innerText = isRegister ? "Vytvoriť účet" : "Prihlásiť sa";

registerFields.style.display = isRegister ? "block" : "none";
confirmPasswordWrap.style.display = isRegister ? "block" : "none";
confirmPasswordInput.required = isRegister;
emailInput.placeholder = isRegister
  ? "Prihlasovacia skratka (napr. jnovak) alebo e-mail"
  : "Prihlasovacia skratka (napr. jnovak) alebo e-mail";
}

function formatFirebaseError(err) {
const code = err?.code || "";
if (code === "auth/email-already-in-use") return "Táto skratka / e-mail už účet má.";
if (code === "auth/invalid-email") return "Neplatná prihlasovacia skratka alebo e-mail.";
if (code === "auth/weak-password") return "Heslo je príliš slabé (musí mať aspoň 6 znakov).";
if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
return "Nesprávna prihlasovacia skratka alebo heslo.";
}
if (code === "auth/network-request-failed") return "Chyba siete. Skontroluj pripojenie na internet.";
return err?.message || "Nastala neočakávaná chyba.";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

authForm.addEventListener("submit", async (e) => {
e.preventDefault();
clearMessage();

const rawLogin = emailInput.value.trim();
const email = toAuthEmail(rawLogin);
const password = passwordInput.value;
const shortcut = rawLogin.includes("@") ? rawLogin.split("@")[0] : normalizeShortcut(rawLogin);

if (!email || !password) {
showMessage("Zadaj platnú skratku a heslo.");
return;
}

if (mode === "register") {
const confirmPassword = confirmPasswordInput.value;
if (password !== confirmPassword) {
showMessage("Heslá sa nezhodujú.");
return;
}
}

isSubmitting = true;
authSubmitBtn.disabled = true;

try {
if (mode === "login") {
const cred = await signInWithEmailAndPassword(auth, email, password);
const userRef = ref(db, `users/${cred.user.uid}`);
const snap = await get(userRef);

if (!snap.exists()) {
const defaultRole = cred.user.email === "admin@mt21b.local" ? "majster" : "zamestnanec";
await set(userRef, {
email: cred.user.email || email,
loginId: shortcut || (cred.user.email ? cred.user.email.split("@")[0] : ""),
name: shortcut || (cred.user.email ? cred.user.email.split("@")[0] : "Používateľ"),
line: "Nepriradená",
role: defaultRole
});
}

location.href = "dashboard.html";
} else {
const cred = await createUserWithEmailAndPassword(auth, email, password);
const customName = regNameInput.value.trim();
const fallbackName = shortcut || email.split("@")[0] || "Používateľ";
const defaultRole = cred.user.email === "admin@mt21b.local" ? "majster" : "zamestnanec";

await set(ref(db, `users/${cred.user.uid}`), {
email: cred.user.email || email,
loginId: shortcut,
name: customName || fallbackName,
line: "Nepriradená",
role: defaultRole
});

location.href = "dashboard.html";
}
} catch (err) {
showMessage(formatFirebaseError(err), true);
isSubmitting = false;
authSubmitBtn.disabled = false;
}
});

onAuthStateChanged(auth, (user) => {
if (user && !isSubmitting) {
location.href = "dashboard.html";
}
});
