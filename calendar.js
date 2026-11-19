import { db, auth } from "./firebase-config.js";

import {
  ref,
  get,
  onValue,
  set,
  remove
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const employeeWrap = document.getElementById("calendarEmployeeWrap");
const employeeSelect = document.getElementById("calendarEmployeeSelect");
const monthInput = document.getElementById("calendarMonth");
const todayBtn = document.getElementById("calendarTodayBtn");
const workCalendar = document.getElementById("workCalendar");
const message = document.getElementById("calendarMessage");
const currentUserLabel = document.getElementById("calendarCurrentUser");

const SHIFT_LABELS = {
  ranna: "Ranná",
  poobedna: "Poobedná",
  nocna: "Nočná",
  volno: "Voľno"
};

let isManager = false;
let selectedUid = "";
let selectedName = "";
let overrides = {};
let absences = {};
let calendarUnsubscribe = null;
let absencesUnsubscribe = null;

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(key) {
  const [year, month, day] = key.split("-");
  return `${day}.${month}.${year}`;
}

function mondayOf(date) {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);

  return result;
}

function defaultShift(date) {
  // Referenčný týždeň od 16. 11. 2026 je poobedná zmena.
  const referenceMonday = new Date(2026, 10, 16);
  const day = date.getDay();

  /*
    Nedeľná nočná patrí k nasledujúcemu pracovnému týždňu.
    Pri nedeli preto určujeme cyklus podľa nasledujúceho pondelka.
  */
  const cycleDate = new Date(date);

  if (day === 0) {
    cycleDate.setDate(cycleDate.getDate() + 1);
  }

  const weeks = Math.round(
    (mondayOf(cycleDate) - referenceMonday) / 604800000
  );

  const cycle = ((weeks % 3) + 3) % 3;

  // Poobedná: pondelok až piatok.
  if (cycle === 0) {
    return day >= 1 && day <= 5
      ? "poobedna"
      : "volno";
  }

  // Ranná: pondelok až piatok, sobota je voľno.
  if (cycle === 1) {
    return day >= 1 && day <= 5
      ? "ranna"
      : "volno";
  }

  /*
    Nočná:
    - prvý nástup je v nedeľu,
    - potom pondelok, utorok, streda,
    - posledný nástup je vo štvrtok,
    - piatok a sobota sú voľno.
  */
  if (cycle === 2) {
    return day === 0 || (day >= 1 && day <= 4)
      ? "nocna"
      : "volno";
  }

  return "volno";
}

function absenceLabel(type) {
  if (type === "dovolenka") return "Dovolenka";
  if (type === "pn") return "PN";
  if (type === "paragraf") return "Paragraf";
  if (type === "nahradne_volno") return "Náhradné voľno";

  return "Neprítomnosť";
}

function absenceClass(type) {
  if (type === "dovolenka") return "absence-dovolenka";
  if (type === "nahradne_volno") return "absence-nahradne-volno";

  return "absence-red";
}

function activeAbsenceForDate(key) {
  return Object.values(absences || {}).find((item) => {
    const requiresApproval =
      item.type === "dovolenka" ||
      item.type === "nahradne_volno";

    const active = requiresApproval
      ? item.status === "approved"
      : item.status === "reported";

    return (
      active &&
      item.dateFrom <= key &&
      item.dateTo >= key
    );
  }) || null;
}

function render() {
  if (!monthInput.value || !selectedUid) return;

  const [year, month] = monthInput.value
    .split("-")
    .map(Number);

  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const start = mondayOf(first);
  const end = new Date(last);
  const endDay = end.getDay() || 7;

  end.setDate(end.getDate() + 7 - endDay);

  workCalendar.innerHTML = "";

  ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].forEach((text) => {
    const element = document.createElement("div");
    element.className = "calendar-weekday";
    element.innerText = text;
    workCalendar.appendChild(element);
  });

  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const day = new Date(cursor);
    const key = dateKey(day);
    const override = overrides[key];
    const shift = override?.shift || defaultShift(day);
    const absence = activeAbsenceForDate(key);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = absence
      ? `calendar-day ${absenceClass(absence.type)}`
      : `calendar-day shift-${shift}`;

    if (day.getMonth() !== month - 1) {
      cell.classList.add("outside-month");
    }

    if (key === dateKey(new Date())) {
      cell.classList.add("today");
    }

    cell.disabled = !isManager;

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.innerText = day.getDate();

    const label = document.createElement("span");
    label.className = "calendar-shift-label";
    label.innerText = absence
      ? absenceLabel(absence.type)
      : SHIFT_LABELS[shift];

    cell.append(number, label);

    if (override?.note && !absence) {
      const note = document.createElement("span");
      note.className = "calendar-day-note";
      note.innerText = override.note;
      cell.appendChild(note);
    }

    if (isManager && !absence) {
      cell.addEventListener("click", () => {
        editDay(key, shift, override?.note || "");
      });
    }

    workCalendar.appendChild(cell);
  }

  message.innerText = isManager
    ? `Kalendár: ${selectedName}`
    : "Tvoj pracovný kalendár";
}

async function editDay(key, currentShift, currentNote) {
  const value = window.prompt(
    `Zmena pre ${selectedName}, ${formatDate(key)}.\n\n` +
    "Napíš: ranna, poobedna, nocna, volno alebo predvolena",
    currentShift
  );

  if (value === null) return;

  const shift = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["predvolena", "predvolene", "default"].includes(shift)) {
    await remove(ref(db, `workCalendars/${selectedUid}/${key}`));
    return;
  }

  if (!SHIFT_LABELS[shift]) {
    window.alert(
      "Použi: ranna, poobedna, nocna, volno alebo predvolena."
    );
    return;
  }

  const note = window.prompt(
    "Poznámka k zmene (nepovinné):",
    currentNote
  );

  if (note === null) return;

  await set(ref(db, `workCalendars/${selectedUid}/${key}`), {
    shift,
    note: note.trim(),
    updatedAt: Date.now(),
    updatedBy: auth.currentUser.uid
  });
}

function subscribeCalendar(uid, name) {
  if (calendarUnsubscribe) {
    calendarUnsubscribe();
  }

  if (absencesUnsubscribe) {
    absencesUnsubscribe();
  }

  selectedUid = uid;
  selectedName = name;
  overrides = {};
  absences = {};
  message.innerText = "Načítavam kalendár...";

  calendarUnsubscribe = onValue(
    ref(db, `workCalendars/${uid}`),
    (snapshot) => {
      overrides = snapshot.exists()
        ? snapshot.val()
        : {};

      render();
    }
  );

  absencesUnsubscribe = onValue(
    ref(db, `absences/${uid}`),
    (snapshot) => {
      absences = snapshot.exists()
        ? snapshot.val()
        : {};

      render();
    }
  );
}

async function loadManagerPeople() {
  const snapshot = await get(ref(db, "users"));
  const users = snapshot.exists()
    ? snapshot.val()
    : {};

  const entries = Object.entries(users).sort((a, b) => {
    const nameA = a[1].name || a[1].loginId || "";
    const nameB = b[1].name || b[1].loginId || "";

    return nameA.localeCompare(nameB, "sk");
  });

  employeeSelect.innerHTML = "";

  entries.forEach(([uid, user]) => {
    const option = document.createElement("option");
    option.value = uid;
    option.innerText =
      user.name ||
      user.loginId ||
      user.email ||
      uid;

    employeeSelect.appendChild(option);
  });

  if (entries.length > 0) {
    const [uid, user] = entries[0];
    const name =
      user.name ||
      user.loginId ||
      user.email ||
      uid;

    employeeSelect.value = uid;
    subscribeCalendar(uid, name);
  } else {
    message.innerText = "Nenašiel sa žiadny používateľ.";
  }

  employeeSelect.addEventListener("change", () => {
    const option =
      employeeSelect.options[employeeSelect.selectedIndex];

    subscribeCalendar(
      option.value,
      option.textContent
    );
  });
}

monthInput.value = dateKey(new Date()).slice(0, 7);

monthInput.addEventListener("change", render);

todayBtn.addEventListener("click", () => {
  monthInput.value = dateKey(new Date()).slice(0, 7);
  render();
});

document
  .getElementById("backDashboardBtn")
  .addEventListener("click", () => {
    location.href = "dashboard.html";
  });

document
  .getElementById("calendarLogoutBtn")
  .addEventListener("click", async () => {
    await signOut(auth);
    location.href = "index.html";
  });

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "index.html";
    return;
  }

  currentUserLabel.innerText = user.email
    ? user.email.split("@")[0]
    : "Používateľ";

  const roleSnapshot = await get(
    ref(db, `users/${user.uid}/role`)
  );

  const role = roleSnapshot.exists()
    ? roleSnapshot.val()
    : "zamestnanec";

  isManager = role === "majster" || role === "admin";

  if (isManager) {
    employeeWrap.style.display = "flex";
    await loadManagerPeople();
  } else {
    subscribeCalendar(
      user.uid,
      currentUserLabel.innerText
    );
  }
});
