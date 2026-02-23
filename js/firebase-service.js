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

const BROKERS_COLLECTION = 'brokers';

async function saveBrokerToFirestore(broker) {
  const db = getFirebaseDb();
  if (!db) return null;
  const data = {
    name: broker.name,
    cpf: broker.cpf || '',
    email: broker.email,
    phone: broker.phone || '',
    creci: broker.creci || '',
    password: broker.password || '',
    isActive: broker.isActive !== undefined ? broker.isActive : false,
    createdAt: broker.createdAt ? (broker.createdAt.toISOString ? broker.createdAt.toISOString() : broker.createdAt) : new Date().toISOString()
  };
  const docRef = await db.collection(BROKERS_COLLECTION).add(data);
  return docRef.id;
}

const FUNCTIONS_BASE = 'https://us-central1-site-interativo-b-f-marques.cloudfunctions.net';
const GET_BROKERS_API = FUNCTIONS_BASE + '/getBrokers';
const REGISTER_BROKER_API = FUNCTIONS_BASE + '/registerBroker';

async function registerBrokerAPI(broker) {
  try {
    const res = await fetch(REGISTER_BROKER_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: broker.name,
        cpf: broker.cpf,
        email: broker.email,
        phone: broker.phone,
        creci: broker.creci,
        password: broker.password
      })
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    return data.id || null;
  } catch (err) {
    console.warn('registerBrokerAPI:', err);
    return null;
  }
}

async function getBrokersFromAPI() {
  try {
    const res = await fetch(GET_BROKERS_API);
    if (!res.ok) throw new Error('API erro ' + res.status);
    const list = await res.json();
    return (list || []).map(b => ({
      ...b,
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date()
    }));
  } catch (err) {
    console.warn('getBrokersFromAPI falhou:', err);
    return null;
  }
}

async function getBrokersFromFirestore() {
  const fromApi = await getBrokersFromAPI();
  if (fromApi !== null) return fromApi;
  const db = getFirebaseDb();
  if (!db) return [];
  try {
    const snapshot = await db.collection(BROKERS_COLLECTION).get();
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        name: d.name,
        cpf: d.cpf,
        email: d.email,
        phone: d.phone,
        creci: d.creci,
        password: d.password,
        isActive: d.isActive !== undefined ? d.isActive : false,
        isAdmin: d.isAdmin || false,
        createdAt: d.createdAt ? new Date(d.createdAt) : new Date()
      };
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (err) {
    console.warn('getBrokersFromFirestore falhou:', err);
    return [];
  }
}

async function updateBrokerInFirestore(brokerId, updates) {
  const db = getFirebaseDb();
  if (!db) return false;
  const ref = db.collection(BROKERS_COLLECTION).doc(brokerId);
  const data = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.cpf !== undefined) data.cpf = updates.cpf;
  if (updates.email !== undefined) data.email = updates.email;
  if (updates.phone !== undefined) data.phone = updates.phone;
  if (updates.creci !== undefined) data.creci = updates.creci;
  if (updates.password !== undefined) data.password = updates.password;
  if (updates.isActive !== undefined) data.isActive = updates.isActive;
  await ref.update(data);
  return true;
}

async function deleteBrokerFromFirestore(brokerId) {
  const db = getFirebaseDb();
  if (!db) return false;
  try {
    await db.collection(BROKERS_COLLECTION).doc(brokerId).delete();
    return true;
  } catch (err) {
    console.warn('deleteBrokerFromFirestore:', err);
    return false;
  }
}

const PASSWORD_RESET_COLLECTION = 'passwordResetTokens';

async function savePasswordResetToken(brokerId, email, token) {
  const db = getFirebaseDb();
  if (!db) return null;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora
  const docRef = await db.collection(PASSWORD_RESET_COLLECTION).add({
    brokerId,
    email,
    token,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString()
  });
  return docRef.id;
}

async function getPasswordResetToken(token) {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await db.collection(PASSWORD_RESET_COLLECTION)
    .where('token', '==', token)
    .where('used', '==', false)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const data = doc.data();
  if (new Date(data.expiresAt) < new Date()) return null;
  return { id: doc.id, ...data };
}

async function markPasswordResetTokenUsed(tokenDocId) {
  const db = getFirebaseDb();
  if (!db) return false;
  try {
    await db.collection(PASSWORD_RESET_COLLECTION).doc(tokenDocId).update({ used: true });
    return true;
  } catch (err) {
    console.warn('markPasswordResetTokenUsed:', err);
    return false;
  }
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
  window.saveBrokerToFirestore = saveBrokerToFirestore;
  window.getBrokersFromFirestore = getBrokersFromFirestore;
  window.updateBrokerInFirestore = updateBrokerInFirestore;
  window.deleteBrokerFromFirestore = deleteBrokerFromFirestore;
  window.savePasswordResetToken = savePasswordResetToken;
  window.getPasswordResetToken = getPasswordResetToken;
  window.markPasswordResetTokenUsed = markPasswordResetTokenUsed;
  window.registerBrokerAPI = registerBrokerAPI;
}

