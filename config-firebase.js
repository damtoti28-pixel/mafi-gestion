// ============================================================
// CONFIGURATION FIREBASE — À COMPLÉTER
// ============================================================
// 1. Va sur https://console.firebase.google.com
// 2. Crée un projet gratuit (ex: "mafii-gestion")
// 3. Dans "Paramètres du projet" > "Général", ajoute une application Web
// 4. Copie les valeurs qu'on te donne et remplace celles ci-dessous
// 5. Active Firestore : menu "Firestore Database" > "Créer une base de données"
//    -> choisir le mode "production" puis mettre ces règles (onglet "Règles") :
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} {
//          allow read, write: if true;
//        }
//      }
//    }
//
//    (Ces règles ouvrent l'accès à tes 3 comptables sans compte à créer.
//    Si tu veux sécuriser davantage plus tard, on pourra ajouter une
//    authentification simple par code d'accès.)
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAUEdGrSSr-iswSA4EYtrgecPn4vpdbQEo",
  authDomain: "mafi-gestion.firebaseapp.com",
  projectId: "mafi-gestion",
  storageBucket: "mafi-gestion.firebasestorage.app",
  messagingSenderId: "504804278277",
  appId: "1:504804278277:web:0eff92fde0237d684c9c6c"
};
