const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

function getTransporter() {
  const config = functions.config();
  const user = config?.smtp?.user;
  const pass = config?.smtp?.pass;
  if (!user || !pass) {
    console.warn('SMTP não configurado. Use: firebase functions:config:set smtp.user="..." smtp.pass="..."');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

exports.sendQueuedEmail = functions.firestore
  .document('emailQueue/{docId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const transporter = getTransporter();
    if (!transporter) {
      await snap.ref.set({ status: 'error', error: 'SMTP não configurado' }, { merge: true });
      return;
    }
    
    try {
      await transporter.sendMail({
        from: data.from || 'bfmarquesempreendimentos@gmail.com',
        to: data.to,
        subject: data.subject,
        html: data.body
      });
      await snap.ref.set({ status: 'sent', sentAt: new Date().toISOString() }, { merge: true });
    } catch (error) {
      await snap.ref.set({ status: 'error', error: error.message }, { merge: true });
    }
  });



