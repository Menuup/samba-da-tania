/* Samba da Tânia — ligação com o Firebase (conta e histórico na nuvem).

   Enquanto for null, o jogo funciona só no aparelho, como sempre, e não fala com a internet.

   Para ligar:
   1. Em console.firebase.google.com crie um projeto e adicione um app Web (ícone </>).
   2. Em Authentication → Sign-in method, ative "Anônimo" e "Google".
      Em Authentication → Settings → Domínios autorizados, inclua menuup.github.io.
   3. Em Firestore Database, crie o banco e cole o conteúdo de firestore.rules na aba Regras.
   4. Troque o null abaixo pelo objeto firebaseConfig que o console mostra, por exemplo:
      window.SAMBA_FIREBASE = {
        apiKey: '...', authDomain: 'xxx.firebaseapp.com', projectId: 'xxx',
        storageBucket: 'xxx.appspot.com', messagingSenderId: '...', appId: '...',
      };
   Esse objeto não é segredo (fica na página de qualquer jeito); quem protege os dados são as regras. */
window.SAMBA_FIREBASE = {
  apiKey: 'AIzaSyDbU00S656IQgR4jmQVbqXNmNSqdX5I2QY',
  authDomain: 'samba-da-tania.firebaseapp.com',
  projectId: 'samba-da-tania',
  storageBucket: 'samba-da-tania.firebasestorage.app',
  messagingSenderId: '575454411752',
  appId: '1:575454411752:web:4417056a4f4aec9fbfc25d',
};
