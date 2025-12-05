// firebase-config.js
// Firebase SDK v9+ (bundled for better performance)

// Import the functions you need from the SDKs (using bundled SDK for reduced network requests)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
         sendPasswordResetEmail, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc,
         setDoc, updateDoc, deleteDoc, query, where, orderBy,
         serverTimestamp, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Your web app's Firebase configuration
// REPLACE THIS WITH YOUR ACTUAL CONFIG FROM FIREBASE CONSOLE
const firebaseConfig = {
    apiKey: "AIzaSyDJoNPpgeddnSBU__ZKXKZ-IOCeXbsiduI",
    authDomain: "interactive-map-app-b485a.firebaseapp.com",
    projectId: "interactive-map-app-b485a",
    storageBucket: "interactive-map-app-b485a.firebasestorage.app",
    messagingSenderId: "961555205525",
    appId: "1:961555205525:web:39fbae54f616a9b044fa9c",
    measurementId: "G-1GSS4PDGW7"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// Initialize Firebase Storage and get a reference to the service
const storage = getStorage(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Export for use in other files
export {
  auth,
  db,
  storage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  googleProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove
};
