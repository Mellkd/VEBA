
import { initializeApp } from "firebase/app";
// Fix: Use the standard firestore modular SDK as lite version might have export resolution issues in this environment.
import { getFirestore, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDlYntuFvy4eAmhAC9rdebOdHPcPv0wfqY",
  authDomain: "veba-d0fb4.firebaseapp.com",
  projectId: "veba-d0fb4",
  storageBucket: "veba-d0fb4.firebasestorage.app",
  messagingSenderId: "354556199260",
  appId: "1:354556199260:web:6e7bdfef48ca00eca34199"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const membersCollection = collection(db, "alliance_members");
