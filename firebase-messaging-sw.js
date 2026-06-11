/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDh6mnqDYh-QKKMDNluoGzEmXs5yMR9Qmw',
  authDomain: 'site-interativo-b-f-marques.firebaseapp.com',
  projectId: 'site-interativo-b-f-marques',
  storageBucket: 'site-interativo-b-f-marques.firebasestorage.app',
  messagingSenderId: '949242900598',
  appId: '1:949242900598:web:9a88e1efa6033e37606f57',
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = (payload.notification && payload.notification.title) || 'B F Marques';
  var options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/bfm/assets/images/logo-bf-marques.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var link = 'https://bfmarquesempreendimentos.github.io/bfm/admin.html';
  if (event.notification.data && event.notification.data.link) {
    link = event.notification.data.link;
  }
  event.waitUntil(clients.openWindow(link));
});
