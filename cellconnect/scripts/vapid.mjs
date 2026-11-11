// Génère une paire de clés VAPID pour les notifications push (aucun compte externe requis).
import * as webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:admin@votre-domaine.ch`);
