// =============================================
// TRIFT WITH RUTH - Firebase Configuration
// =============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKdCdBCY4_1xMgOyh_gnM-DalsZjykaEE",
  authDomain: "trift-with-ruth.firebaseapp.com",
  projectId: "trift-with-ruth",
  storageBucket: "trift-with-ruth.firebasestorage.app",
  messagingSenderId: "397109844841",
  appId: "1:397109844841:web:0d900711712b5aae777bf8",
  measurementId: "G-53XZ8531SE"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);
export default app;
