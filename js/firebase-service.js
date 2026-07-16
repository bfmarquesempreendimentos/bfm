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

function getFirebaseServiceFunctionsBase() {
  if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
  if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
    return CONFIG.cloudFunctions.baseURL;
  }
  return '';
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

async function callPatchRepairAPI(repairId, updates) {
  var payload = Object.assign({ id: Number(repairId) }, updates || {});
  var headers = { 'Content-Type': 'application/json' };
  var token = null;
  if (typeof getAdminIdToken === 'function') {
    token = await getAdminIdToken();
  }
  if (!token && typeof getClientIdToken === 'function') {
    token = await getClientIdToken();
  }
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(getFirebaseServiceFunctionsBase() + '/patchRepair', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!res.ok) return null;
  var j = await res.json();
  return (j && j.success) ? true : null;
}

async function saveRepairRequestToFirestore(repairRequest) {
  var token = null;
  if (typeof getClientIdToken === 'function') token = await getClientIdToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var body = repairRequest || {};
  if (token) body.idToken = token;
  var res = await fetch(getFirebaseServiceFunctionsBase() + '/createRepair', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!res.ok) return null;
  var j = await res.json();
  return (j && j.firestoreId) ? j.firestoreId : null;
}

async function updateRepairRequestInFirestore(repairId, updates) {
  return callPatchRepairAPI(repairId, updates);
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
  if (typeof adminFetchJson === 'function') {
    var data = await adminFetchJson('/getRepairs');
    if (Array.isArray(data)) return data;
  }
  return [];
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
  if (typeof adminPostJson === 'function') {
    var r = await adminPostJson('/adminBrokerMutate', {
      action: 'create',
      name: broker.name,
      cpf: broker.cpf || '',
      email: (broker.email || '').trim().toLowerCase(),
      phone: broker.phone || '',
      creci: broker.creci || '',
      password: broker.password || '',
      isActive: broker.isActive === true,
      whatsappCampaignOptOut: broker.whatsappCampaignOptOut === true,
      isAdmin: broker.isAdmin === true
    });
    return (r && r.id) ? r.id : null;
  }
  return null;
}

async function registerBrokerAPI(broker) {
  try {
    const res = await fetch(getFirebaseServiceFunctionsBase() + '/registerBroker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: broker.name,
        cpf: broker.cpf,
        email: broker.email,
        phone: broker.phone,
        creci: broker.creci,
        password: broker.password,
        isActive: broker.isActive === true
      })
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var msg = (data && data.error) ? data.error : ('API ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (data && data.id && data.isActive === true) broker.isActive = true;
    if (data && data.isActive === false) broker.isActive = false;
    return (data && data.id) || null;
  } catch (err) {
    console.warn('registerBrokerAPI:', err);
    throw err;
  }
}

function mapBrokerApiRow(b) {
  return {
    ...b,
    email: (b.email || '').trim().toLowerCase(),
    createdAt: b.createdAt ? new Date(b.createdAt) : new Date()
  };
}

async function getBrokersFromAPI(activeOnly) {
  try {
    var base = getFirebaseServiceFunctionsBase() + '/getBrokers?_=' + Date.now();
    if (activeOnly) {
      var pubRes = await fetch(base + '&activeOnly=1', { cache: 'no-store', credentials: 'omit' });
      if (!pubRes.ok) throw new Error('API erro ' + pubRes.status);
      var pubList = await pubRes.json();
      return (pubList || []).map(mapBrokerApiRow);
    }

    // Lista completa (pendentes + ativos) exige auth de admin
    if (typeof adminFetchJson === 'function') {
      var viaAdmin = await adminFetchJson('/getBrokers');
      if (Array.isArray(viaAdmin)) return viaAdmin.map(mapBrokerApiRow);
      return null;
    }

    var headers = { 'Content-Type': 'application/json' };
    var url = base;
    if (typeof getAdminIdToken === 'function') {
      var token = await getAdminIdToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }
    if (!headers.Authorization && typeof getAdminApiCredentials === 'function') {
      var creds = getAdminApiCredentials();
      if (creds && creds.email && creds.password) {
        url += '&adminEmail=' + encodeURIComponent(creds.email) +
          '&adminPassword=' + encodeURIComponent(creds.password);
      }
    }
    if (!headers.Authorization && url.indexOf('adminEmail=') < 0) {
      return null;
    }
    var res = await fetch(url, { cache: 'no-store', credentials: 'omit', headers: headers });
    if (!res.ok) throw new Error('API erro ' + res.status);
    var list = await res.json();
    return (list || []).map(mapBrokerApiRow);
  } catch (err) {
    console.warn('getBrokersFromAPI falhou:', err);
    return null;
  }
}

async function getBrokersFromFirestore(opts) {
  opts = opts || {};
  const fromApi = await getBrokersFromAPI(!!opts.activeOnly);
  return fromApi !== null ? fromApi : [];
}

async function updateBrokerInFirestore(brokerId, updates) {
  if (typeof adminPostJson === 'function') {
    var payload = Object.assign({ action: 'update', brokerId: brokerId }, updates || {});
    var r = await adminPostJson('/adminBrokerMutate', payload);
    return !!(r && r.ok);
  }
  if (typeof getFirebaseAuth === 'function' && firebaseAvailable && firebaseAvailable()) {
    var auth = getFirebaseAuth();
    if (auth.currentUser) {
      var token = await auth.currentUser.getIdToken();
      var res = await fetch(getFirebaseServiceFunctionsBase() + '/brokerUpdateMe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(updates || {}),
        cache: 'no-store'
      });
      return res.ok;
    }
  }
  return false;
}

async function deleteBrokerFromFirestore(brokerId) {
  if (typeof adminPostJson === 'function') {
    var r = await adminPostJson('/adminBrokerMutate', { action: 'delete', brokerId: brokerId });
    return !!(r && r.ok);
  }
  return false;
}

const PASSWORD_RESET_COLLECTION = 'passwordResetTokens';

async function savePasswordResetToken(brokerId, email, token, type = 'broker') {
  try {
    var payload = {
      type: type || 'broker',
      email: email,
      token: token,
    };
    if (type === 'client') payload.clientId = brokerId || '';
    else payload.brokerId = brokerId || '';
    var res = await fetch(getFirebaseServiceFunctionsBase() + '/savePasswordResetToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    var j = await res.json();
    return (j && j.id) ? j.id : 'ok';
  } catch (err) {
    console.warn('savePasswordResetToken API:', err);
    return null;
  }
}

async function getPasswordResetToken(token) {
  try {
    var res = await fetch(getFirebaseServiceFunctionsBase() + '/verifyPasswordResetToken?token=' + encodeURIComponent(token), { cache: 'no-store' });
    if (!res.ok) return null;
    var j = await res.json();
    if (!j || !j.ok) return null;
    return {
      id: j.id,
      type: j.type || 'broker',
      email: j.email,
      brokerId: j.brokerId,
      clientId: j.clientId,
    };
  } catch (err) {
    console.warn('getPasswordResetToken API:', err);
    return null;
  }
}

async function completePasswordResetAPI(token, newPassword) {
  try {
    var res = await fetch(getFirebaseServiceFunctionsBase() + '/completePasswordReset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, newPassword: newPassword }),
      cache: 'no-store'
    });
    if (!res.ok) return false;
    var j = await res.json();
    return !!(j && j.ok);
  } catch (err) {
    console.warn('completePasswordResetAPI:', err);
    return false;
  }
}

async function markPasswordResetTokenUsed(tokenDocId) {
  return true;
}

function getCloudFunctionsBaseForSales() {
  if (typeof getCloudFunctionsBaseUrl === 'function') return getCloudFunctionsBaseUrl();
  if (typeof CONFIG !== 'undefined' && CONFIG.cloudFunctions && CONFIG.cloudFunctions.baseURL) {
    return CONFIG.cloudFunctions.baseURL;
  }
  return '';
}

async function fetchClientPropertySalesMe(idToken) {
  var base = getCloudFunctionsBaseForSales();
  var r = await fetch(base + '/clientPropertySalesMe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: idToken }),
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!r.ok) return [];
  var j = await r.json();
  if (j && Array.isArray(j.sales)) return j.sales;
  return [];
}

async function fetchClientSaleEligibility(email, cpf) {
  var base = getCloudFunctionsBaseForSales();
  var r = await fetch(base + '/clientSaleEligibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email || '', cpf: cpf || '' }),
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!r.ok) return false;
  var j = await r.json();
  return !!(j && j.eligible === true);
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
  window.completePasswordResetAPI = completePasswordResetAPI;
  window.markPasswordResetTokenUsed = markPasswordResetTokenUsed;
  window.registerBrokerAPI = registerBrokerAPI;
  window.fetchClientPropertySalesMe = fetchClientPropertySalesMe;
  window.fetchClientSaleEligibility = fetchClientSaleEligibility;
}

