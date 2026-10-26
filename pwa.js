'use strict';

const installButton = document.querySelector('#install-app');
const offlineStatus = document.querySelector('#offline-status');
let installPrompt = null;
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  if (isInstalled()) return;
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  installButton.hidden = true;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    // Browser menu installation remains available if a prompt expires.
  }
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.hidden = true;
});
function updateConnectionStatus() {
  offlineStatus.hidden = navigator.onLine;
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', {scope: './', updateViaCache: 'none'})
      .catch(error => console.warn('Offline-Modus nicht verfügbar:', error));
  });
}
