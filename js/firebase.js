// Firebase initialization
// eslint-disable-next-line no-undef
const firebaseConfig = {
  apiKey: "AIzaSyDh6mnqDYh-QKKMDNluoGzEmXs5yMR9Qmw",
  authDomain: "site-interativo-b-f-marques.firebaseapp.com",
  projectId: "site-interativo-b-f-marques",
  storageBucket: "site-interativo-b-f-marques.firebasestorage.app",
  messagingSenderId: "949242900598",
  appId: "1:949242900598:web:9a88e1efa6033e37606f57",
  measurementId: "G-NNV4RTSZQT"
};

function initFirebase() {
  if (typeof firebase === 'undefined') return null;
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
  return firebase;
}

initFirebase();



