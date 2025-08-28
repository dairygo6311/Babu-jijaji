// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBMCYSn55b_n6cn8a4RRGnWu3EaAg7IUtg",
  authDomain: "babul-ji.firebaseapp.com",
  databaseURL: "https://babul-ji-default-rtdb.firebaseio.com",
  projectId: "babul-ji",
  storageBucket: "babul-ji.firebasestorage.app",
  messagingSenderId: "860046675062",
  appId: "1:860046675062:web:1e4e4000deec9286e3e357",
  measurementId: "G-YW0VG1QMMB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Export the app for other modules
export default app;
