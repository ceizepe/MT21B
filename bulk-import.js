import { db, auth, firebaseConfig } from "./firebase-config.js";

import {
  initializeApp,
  getApps,
  deleteApp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as secondarySignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  ref,
  get,
  set
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const IMPORT_ID = "employees_2026_11_19_v1";
const SECONDARY_APP_NAME = "BulkUserImporter";

const usersToImport = [
  { firstName: "Ružena", lastName: "Danková", loginId: "rdankova", personalNumber: "332043" },
  { firstName: "Rastislav", lastName: "Dvořák", loginId: "rdvorak", personalNumber: "339556" },
  { firstName: "Ján", lastName: "Fabian", loginId: "jfabian", personalNumber: "341775" },
  { firstName: "Ivana", lastName: "Kovarová", loginId: "ikovarova", personalNumber: "329881" },
  { firstName: "Eduard", lastName: "Lipták", loginId: "eliptak", personalNumber: "338948" },
  { firstName: "Darina", lastName: "Mečiarová", loginId: "dmeciarova", personalNumber: "331230" },
  { firstName: "Andrea", lastName: "Némethová", loginId: "anemethova", personalNumber: "337936" },
  { firstName: "Katarína", lastName: "Oršulová", loginId: "korsulova", personalNumber: "330193" },
  { firstName: "Juraj", lastName: "Rosoň", loginId: "jroson", personalNumber: "329885" },
  { firstName: "Alena", lastName: "Svitková", loginId: "asvitkova", personalNumber: "346693" },
  { firstName: "Viera", lastName: "Šandorová", loginId: "vsandorova", personalNumber: "331907" },
  { firstName: "Eva", lastName: "Zviková", loginId: "ezvikova", personalNumber: "330404" },
  { firstName: "Olesia", lastName: "Oleso", loginId: "ooleso", personalNumber: "106379" },
  { firstName: "Šimon", lastName: "Drozd", loginId: "sdrozd", personalNumber: "104621" },
  { firstName: "Ivana", lastName: "Hudecová", loginId: "ihudecova", personalNumber: "107357" },
  { firstName: "Yuliia", lastName: "Tyrpak", loginId: "ytyrpak", personalNumber: "116988" },
  { firstName: "Nadiia", lastName: "Shkriab", loginId: "nshkriab", personalNumber: "121395" },
  { firstName: "Sarah", lastName: "Šnircová", loginId: "ssnircova", personalNumber: "111405" },
  { firstName: "Soňa", lastName: "Halimovičová", loginId: "shalimovicova", personalNumber: "112042" },
  { firstName: "Iryna", lastName: "Silenok", loginId: "isilenok", personalNumber: "121875" },
  { firstName: "Mário", lastName: "Gyöngyös", loginId: "mgyongyos", personalNumber: "120114" },
  { firstName: "Ivanna", lastName: "Loda", loginId: "iloda", personalNumber: "120148" },
  { firstName: "Nikola", lastName: "Madajová", loginId: "nmadajova", personalNumber: "122428" },
  { firstName: "Veronika", lastName: "Chrenová", loginId: "vchrenova", personalNumber: "123001" },
  { firstName: "Denisa", lastName: "Richterová", loginId: "drichterova", personalNumber: "123671" },
  { firstName: "Imrich", lastName: "Gajdoš", loginId: "igajdos", personalNumber: "123673" },
  { firstName: "Michaela", lastName: "Pekár Weisnerová", loginId: "mpekar", personalNumber: "123674" },
  { firstName: "Vadym", lastName: "Zhymchycha", loginId: "vzhymchycha", personalNumber: "124806" },
  { firstName: "Kim Adrian Panganiban", lastName: "Bulaun", loginId: "kbulaun", personalNumber: "830786" },
  { firstName: "Jakub", lastName: "Suja", loginId: "jsuja", personalNumber: "125128" },
  { firstName: "Martin", lastName: "Číž", loginId: "mciz", personalNumber: "125180" },
  { firstName: "John Dexter Berina", lastName: "Mercado", loginId: "jmercado", personalNumber: "831275" },
  { firstName: "Timea", lastName: "Salim Turanská", loginId: "tsalimturanska", personalNumber: "125575" },
  { firstName: "Marek", lastName: "Tavali", loginId: "mtavali", personalNumber: "125571" }
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firebaseMessage(error) {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") return "účet už existuje";
  if (code === "auth/invalid-email") return "neplatná skratka/e-mail";
  if (code === "auth/weak-password") return "heslo nespĺňa podmienky Firebase";
  if (code === "auth/too-many-requests") return "Firebase dočasne zablokoval priveľa požiadaviek";
  if (code === "PERMISSION_DENIED" || code === "database/permission-denied") return "databáza odmietla zápis";
  return error?.message || "neznáma chyba";
}

async function runBulkImport(adminUser) {
  const roleSnapshot = await get(ref(db, `users/${adminUser.uid}/role`));
  const role = roleSnapshot.exists() ? roleSnapshot.val() : "";

  if (role !== "majster" && role !== "admin") {
    alert("Import môže spustiť iba účet s rolou majster alebo admin.");
    return;
  }

  const doneRef = ref(db, `bulkImports/${IMPORT_ID}`);
  const doneSnapshot = await get(doneRef);

  if (doneSnapshot.exists() && doneSnapshot.val()?.completed === true) {
    alert("Tento jednorazový import už bol dokončený. Súbor bulk-import.js môžeš odstrániť a vrátiť pôvodný dashboard.");
    return;
  }

  const confirmed = window.confirm(
    `Vytvorí sa ${usersToImport.length} účtov. Heslom bude osobné číslo. Import spusti iba raz. Pokračovať?`
  );
  if (!confirmed) return;

  let secondaryApp = null;
  const created = [];
  const skipped = [];
  const failed = [];

  try {
    const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
    secondaryApp = existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
    const secondaryAuth = getAuth(secondaryApp);

    for (let index = 0; index < usersToImport.length; index += 1) {
      const person = usersToImport[index];
      const email = `${person.loginId}@mt21b.local`;
      const fullName = `${person.firstName} ${person.lastName}`;

      console.log(`[${index + 1}/${usersToImport.length}] Vytváram: ${fullName} (${person.loginId})`);

      try {
        const credential = await createUserWithEmailAndPassword(
          secondaryAuth,
          email,
          person.personalNumber
        );

        await set(ref(db, `users/${credential.user.uid}`), {
          email,
          loginId: person.loginId,
          name: fullName,
          firstName: person.firstName,
          lastName: person.lastName,
          personalNumber: person.personalNumber,
          line: "Nepriradená",
          role: "zamestnanec"
        });

        created.push(person.loginId);
        await secondarySignOut(secondaryAuth).catch(() => {});
      } catch (error) {
        if (error?.code === "auth/email-already-in-use") {
          skipped.push(person.loginId);
          console.warn(`Preskočené: ${person.loginId}, účet už existuje.`);
        } else {
          failed.push(`${person.loginId}: ${firebaseMessage(error)}`);
          console.error(`Chyba pri ${person.loginId}:`, error);
        }
      }

      // Malá prestávka znižuje riziko Firebase rate limitu.
      await wait(350);
    }

    const completed = failed.length === 0;
    await set(doneRef, {
      completed,
      createdCount: created.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
      created,
      skipped,
      failed,
      finishedAt: new Date().toISOString(),
      startedByUid: adminUser.uid
    });

    const summary = [
      "IMPORT DOKONČENÝ",
      `Vytvorené: ${created.length}`,
      `Už existovali: ${skipped.length}`,
      `Chyby: ${failed.length}`
    ];

    if (failed.length > 0) {
      summary.push("", "Chybné účty:", ...failed);
      summary.push("", "Oprav chyby a obnov stránku. Existujúce účty sa preskočia.");
    } else {
      summary.push("", "Teraz odstráň bulk-import.js z dashboard.html a nahraj späť pôvodnú verziu.");
    }

    console.table({ created, skipped, failed });
    alert(summary.join("\n"));
  } finally {
    if (secondaryApp) {
      await deleteApp(secondaryApp).catch(() => {});
    }
  }
}

let authHandled = false;
onAuthStateChanged(auth, async (user) => {
  if (authHandled) return;
  authHandled = true;

  if (!user) {
    alert("Najprv sa prihlás ako majster/admin a potom otvor dashboard.");
    return;
  }

  try {
    await runBulkImport(user);
  } catch (error) {
    console.error("Bulk import zlyhal:", error);
    alert(`Import sa nepodarilo spustiť: ${firebaseMessage(error)}`);
  }
});
