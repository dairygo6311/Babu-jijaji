// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDL7AzbkoI8XXn9TfRwOg9K2T0M-K60p3I",
    authDomain: "dairy-4aee1.firebaseapp.com",
    databaseURL: "https://dairy-4aee1-default-rtdb.firebaseio.com",
    projectId: "dairy-4aee1",
    storageBucket: "dairy-4aee1.firebasestorage.app",
    messagingSenderId: "952312422395",
    appId: "1:952312422395:web:909f176fc2b4530008355e",
    measurementId: "G-J6L08JDM5M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Export the app for other modules
export default app;
