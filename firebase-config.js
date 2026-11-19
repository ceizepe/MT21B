// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA_meCanxxKAIRhzJ0HikuO5pl6SKE0O1s",
  authDomain: "mt21b-8d371.firebaseapp.com",
  databaseURL: "https://mt21b-8d371-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mt21b-8d371",
  storageBucket: "mt21b-8d371.firebasestorage.app",
  messagingSenderId: "947214886834",
  appId: "1:947214886834:web:ffe51a821d820a047ca6ab",
  measurementId: "G-9PGP2QHYJR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);