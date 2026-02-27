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

function sanitizeForFirestore(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  var out = {};
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      out[k] = sanitizeForFirestore(obj[k]);
    }
  }
  return out;
}

async function saveRepairRequestToFirestore(repairRequest) {
  const db = getFirebaseDb();
  if (!db) return null;
  var clean = sanitizeForFirestore(repairRequest);
  const docRef = await db.collection('repairRequests').add(clean);
  return docRef.id;
}

async function updateRepairRequestInFirestore(repairId, updates) {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await db.collection('repairRequests').where('id', '==', Number(repairId)).limit(1).get();
  if (snapshot.empty) return null;
  await snapshot.docs[0].ref.update({ ...updates, updatedAt: new Date().toISOString() });
  return snapshot.docs[0].id;
}

async function getRepairRequestFromFirestore(repairId) {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await db.collection('repairRequests').where('id', '==', Number(repairId)).limit(1).get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return { firestoreId: snapshot.docs[0].id, ...data };
}

async function getAllRepairRequestsFromFirestore() {
  var db = getFirebaseDb();
  if (!db) return [];
  var snapshot = await db.collection('repairRequests').get();
  return snapshot.docs.map(function(doc) {
    var d = doc.data();
    var out = {};
    for (var k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k]; }
    out.firestoreId = doc.id;
    return out;
  });
}

async function deleteRepairRequestFromFirestore(repairId) {
  const db = getFirebaseDb();
  if (!db) return null;
  const snapshot = await db.collection('repairRequests').where('id', '==', Number(repairId)).limit(1).get();
  if (snapshot.empty) return null;
  await snapshot.docs[0].ref.delete();
  return true;
}

async function saveEmailAuditToFirestore(email) {
  const db = getFirebaseDb();
  if (!db) return null;
  await db.collection('emailAuditLog').add({
    ...email,
    loggedAt: new Date().toISOString()
  });
  return true;
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

async function deletePropertySaleFromFirestore(saleId) {
  const db = getFirebaseDb();
  if (!db) return;
  try {
    const docRef = db.collection('propertySales').doc(String(saleId));
    const snap = await docRef.get();
    if (snap.exists) {
      await docRef.delete();
      return;
    }
    const idNum = Number(saleId);
    if (!isNaN(idNum)) {
      const snapshot = await db.collection('propertySales').where('id', '==', idNum).get();
      await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
    }
  } catch (e) {
    console.warn('Erro ao remover venda do Firestore:', e);
  }
}

/** Busca todas as vendas no Firestore - id = doc.id para delete consistente */
async function getAllPropertySalesFromFirestore() {
  const db = getFirebaseDb();
  if (!db) return [];
  const snapshot = await db.collection('propertySales').get();
  return snapshot.docs.map(doc => {
    const d = doc.data();
    return { id: doc.id, ...d };
  }).sort((a, b) => {
    const ta = (a.createdAt || a.saleDate || 0);
    const tb = (b.createdAt || b.saleDate || 0);
    return new Date(tb) - new Date(ta);
  });
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

async function getClientProfileByEmail(email) {
  const db = getFirebaseDb();
  if (!db || !email) return null;
  const snapshot = await db.collection('clients').where('email', '==', email.trim().toLowerCase()).limit(1).get();
  if (snapshot.empty) return null;
  return { uid: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

/** Cria conta Firebase Auth para cliente e salva perfil. Faz signOut após. Retorna { uid, created, password } ou { created: false, error } */
async function createClientAccountFromSale(clientEmail, clientName, clientCpf, clientPhone, generatedPassword, propertyFromSale) {
  const auth = getFirebaseAuth();
  if (!auth) return { created: false, error: 'Firebase indisponível' };
  const email = (clientEmail || '').trim().toLowerCase();
  if (!email) return { created: false, error: 'Email é obrigatório' };

  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, generatedPassword);
    const uid = userCredential.user.uid;

    const profile = {
      uid,
      name: clientName || 'Cliente',
      cpf: (clientCpf || '').replace(/\D/g, ''),
      email,
      phone: (clientPhone || '').replace(/\D/g, ''),
      address: '',
      properties: propertyFromSale ? [propertyFromSale] : [],
      documents: [],
      history: [],
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    };

    await saveClientProfile(uid, profile);
    await auth.signOut();
    return { uid, created: true, password: generatedPassword };
  } catch (err) {
    if (auth.currentUser) await auth.signOut();
    return { created: false, error: err.code || err.message };
  }
}

function generateRandomPassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  return pwd;
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
    email: (broker.email || '').trim().toLowerCase(),
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
      email: (b.email || '').trim().toLowerCase(),
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
        email: (d.email || '').trim().toLowerCase(),
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
  if (updates.email !== undefined) data.email = (updates.email || '').trim().toLowerCase();
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

async function savePasswordResetToken(brokerId, email, token, type = 'broker') {
  const db = getFirebaseDb();
  if (!db) return null;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora
  const data = {
    type: type || 'broker',
    email,
    token,
    expiresAt,
    used: false,
    createdAt: new Date().toISOString()
  };
  if (type === 'broker') data.brokerId = brokerId;
  else data.clientId = brokerId;
  const docRef = await db.collection(PASSWORD_RESET_COLLECTION).add(data);
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
  return { id: doc.id, ...data, type: data.type || 'broker' };
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
  window.updateRepairRequestInFirestore = updateRepairRequestInFirestore;
  window.getRepairRequestFromFirestore = getRepairRequestFromFirestore;
  window.getAllRepairRequestsFromFirestore = getAllRepairRequestsFromFirestore;
  window.deleteRepairRequestFromFirestore = deleteRepairRequestFromFirestore;
  window.saveEmailAuditToFirestore = saveEmailAuditToFirestore;
  window.savePropertySaleToFirestore = savePropertySaleToFirestore;
  window.getPropertySalesByCPF = getPropertySalesByCPF;
  window.getPropertySalesByEmail = getPropertySalesByEmail;
  window.getAllPropertySalesFromFirestore = getAllPropertySalesFromFirestore;
  window.deletePropertySaleFromFirestore = deletePropertySaleFromFirestore;
  window.saveClientProfile = saveClientProfile;
  window.getClientProfileByUID = getClientProfileByUID;
  window.getClientProfileByEmail = getClientProfileByEmail;
  window.createClientAccountFromSale = createClientAccountFromSale;
  window.generateRandomPassword = generateRandomPassword;
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

