// Firebase service helpers (Auth, Firestore, Storage)

function firebaseAvailable() {
  return typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0;
}

function getFirebaseAuth() {
  if (!firebaseAvailable()) return null;
  return firebase.auth();
}

function getFirebaseDb() {
  if (!firebaseAvailable()) return null;
  return firebase.firestore();
}

function getFirebaseStorage() {
  if (!firebaseAvailable()) return null;
  return firebase.storage();
}

async function uploadRepairAttachmentsToFirebase(files, folder = 'repair-attachments') {
  const storage = getFirebaseStorage();
  if (!storage) throw new Error('Storage indisponível');
  const uploaded = [];
  for (const file of files) {
    const filePath = `${folder}/${Date.now()}-${file.name}`;
    const ref = storage.ref().child(filePath);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    uploaded.push({
      name: file.name,
      type: file.type,
      size: file.size,
      url,
      path: filePath
    });
  }
  return uploaded;
}

async function saveRepairRequestToFirestore(repairRequest) {
  const db = getFirebaseDb();
  if (!db) return null;
  const docRef = await db.collection('repairRequests').add(repairRequest);
  return docRef.id;
}

async function savePropertySaleToFirestore(sale) {
  const db = getFirebaseDb();
  if (!db) return null;
  const docRef = await db.collection('propertySales').add(sale);
  return docRef.id;
}

async function getPropertySalesByCPF(cpf) {
  const db = getFirebaseDb();
  if (!db) return [];
  const cleanCpf = cpf.replace(/\D/g, '');
  const snapshot = await db.collection('propertySales').where('clientCPF', '==', cleanCpf).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPropertySalesByEmail(email) {
  const db = getFirebaseDb();
  if (!db) return [];
  const snapshot = await db.collection('propertySales').where('clientEmail', '==', email).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function saveClientProfile(uid, profile) {
  const db = getFirebaseDb();
  if (!db) return null;
  await db.collection('clients').doc(uid).set(profile, { merge: true });
}

async function getClientProfileByUID(uid) {
  const db = getFirebaseDb();
  if (!db) return null;
  const doc = await db.collection('clients').doc(uid).get();
  return doc.exists ? doc.data() : null;
}

async function queueEmailInFirestore(payload) {
  const db = getFirebaseDb();
  if (!db) return null;
  const docRef = await db.collection('emailQueue').add({
    ...payload,
    createdAt: new Date().toISOString(),
    status: 'queued'
  });
  return docRef.id;
}

if (typeof window !== 'undefined') {
  window.firebaseAvailable = firebaseAvailable;
  window.getFirebaseAuth = getFirebaseAuth;
  window.getFirebaseDb = getFirebaseDb;
  window.getFirebaseStorage = getFirebaseStorage;
  window.uploadRepairAttachmentsToFirebase = uploadRepairAttachmentsToFirebase;
  window.saveRepairRequestToFirestore = saveRepairRequestToFirestore;
  window.savePropertySaleToFirestore = savePropertySaleToFirestore;
  window.getPropertySalesByCPF = getPropertySalesByCPF;
    window.getPropertySalesByEmail = getPropertySalesByEmail;
  window.saveClientProfile = saveClientProfile;
  window.getClientProfileByUID = getClientProfileByUID;
  window.queueEmailInFirestore = queueEmailInFirestore;
}

