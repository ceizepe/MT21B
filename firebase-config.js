import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_meCanxxKAIRhzJ0HikuO5pl6SKE0O1s",
  authDomain: "mt21b-8d371.firebaseapp.com",
  databaseURL: "https://mt21b-8d371-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mt21b-8d371",
  storageBucket: "mt21b-8d371.firebasestorage.app",
  messagingSenderId: "947214886834",
  appId: "1:947214886834:web:ffe51a821d820a047ca6ab"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
