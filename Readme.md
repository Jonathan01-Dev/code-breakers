ARCHIPEL - Documentation Projet
==============================

Réseau local décentralisé, sécurisé et 100% Hors-ligne.
Archipel permet de communiquer et de partager des fichiers sans infrastructure (ni Cloud, ni 4G, ni Internet), idéal pour les zones blanches ou les situations d'urgence.

Architecture du Système
Archipel repose sur une architecture hybride Node.js/Python pour tirer le meilleur des deux mondes : la rapidité réseau d'un côté et la puissance cryptographique de l'autre.
Plaintext
                    ARCHIPEL : RÉSEAU LOCAL SOUVERAIN (OFFLINE)

      [ COUCHE UI ]             [ HTML/CSS/JS ]
            |                   (Monitoring & Dashboard en temps réel)
            v
 +-----------------------+      +----------------------------------------------+
 |   INTERFACE LOCALE    | <--> | LOGS & MONITORING (Pairs détectés / Fichiers)|
 +-----------------------+      +----------------------------------------------+
            ^
            | (Communication interne via Socket.io / 127.0.0.1)
            v
 +-----------------------------------------------------------------------------+
 |                         NŒUD ARCHIPEL (LE CŒUR)                             |
 |                                                                             |
 |  [ NETWORK ] (Node.js)                [ CRYPTO ] (Python)                   |
 |  - Le "Radar" (UDP Multicast)         - Le "Handshake" (Clés secrètes)      |
 |  - Le "Tunnel" (TCP Sockets)          - Le "Verrou" (AES-256-GCM)           |
 |                                                                             |
 |  [ IDENTITY ] (Python)                [ TRANSFER ] (Python)                 |
 |  - Le "Passeport" (Clés Ed25519)      - Le "Puzzle" (Découpage en Chunks)   |
 |  - La "Signature" (Preuve d'ID)       - Le "Vérificateur" (Hash SHA-256)    |
 +-----------------------------------------------------------------------------+
            ^                                          ^
            |           [ RÉSEAU LOCAL (Wi-Fi/LAN) ]   |
            +---------------------+--------------------+
                                  |
            ______________________v______________________
           |           AUTRES NŒUDS VOISINS              |
           |      (PC connectés au même switch/Wi-Fi)    |
           |_____________________________________________|
           



1) Vue d'ensemble
-----------------
Archipel est un noeud de communication local (LAN/Wi-Fi) sans Internet, avec:
- decouverte de pairs en multicast UDP
- test de connectivite (ping logique)
- handshake entre pairs
- envoi de messages chiffres entre machines
- interface web de supervision (dashboard)

Le systeme principal utilise Node.js pour le reseau et l'UI.
Un mode Python existe pour des modules reseau/crypto annexes.


2) Arborescence utile
---------------------
- index.js                     : coeur Node.js (reseau + UI + chiffrement session)
- src/network/server.js        : serveur TCP TLV
- src/ui/index.html            : interface web
- src/ui/script.js             : logique UI (scan, ping, connect, envoi)
- src/crypto/                  : fonctions crypto Python
- src/network/multicast.py     : noeud Python multicast/tcp
- .env                         : configuration locale
- keys_ed25519.json            : identite cryptographique locale
- peers.json                   : table des pairs (Node)
- peers_py.json                : table des pairs (Python)


3) Prerequis
------------
Node.js:
- Node 20+ recommande
- npm

Python (optionnel si vous lancez le mode Python):
- Python 3.11+ (venv recommande)
- dependances de requirements.txt


4) Installation
---------------
Depuis la racine du projet:

Node:
- npm install

Python (optionnel):
- python -m venv .venv
- .\.venv\Scripts\Activate.ps1
- python -m pip install -r requirements.txt


5) Configuration (.env)
-----------------------
Variables principales:
- UI_PORT=3000
- MULTICAST_ADDR=239.255.42.99
- MULTICAST_PORT=6000
- TCP_PORT=7777
- NODE_ID= (optionnel)
- NODE_INSTANCE= (optionnel, permet de forcer un identifiant unique)

Note importante:
- Si plusieurs machines partagent le meme fichier de cles, l'ID de noeud est derive avec
  un tag machine (hostname/NODE_INSTANCE) pour eviter les collisions.


6) Lancement
------------
Mode recommande (interface + reseau complet):
- node index.js

Le terminal affiche:
- URL dashboard (ex: http://localhost:3000)
- ID local du noeud
- port TCP effectif

Mode Python (diagnostic/experimentation):
- python src/network/multicast.py

Attention:
- Eviter de lancer Node et Python en meme temps sur la meme machine pour le meme role reseau.


7) Utilisation de l'interface
-----------------------------
1. Ouvrir le dashboard dans le navigateur.
2. Cliquer "Scanner le reseau" pour forcer la decouverte.
3. Verifier que les autres machines apparaissent dans "Noeuds a proximite".
4. Sur une machine distante:
   - bouton PING: teste la connectivite
   - bouton CONNECT: etablit/force le handshake
   - bouton ENVOYER: envoie un message chiffre

Logs UI utiles:
- HELLO detecte
- PONG recu
- Tunnel securise etabli
- Message chiffre recu
- Echec connexion / Echec envoi (avec raison)


8) Securite (resume)
--------------------
- Signature Ed25519 pour authentifier les echanges de handshake
- Echange de secret de session (ephemeral)
- Chiffrement AES-256-GCM des messages
- Verification d'integrite HMAC sur les payloads


9) Depannage
------------
A) Je ne vois pas l'autre machine
- verifier que les 2 machines sont sur le meme reseau local
- verifier pare-feu Windows (UDP 6000, TCP 7777 ou port affiche)
- verifier que chaque machine a un ID local different
- supprimer peers.json puis relancer

B) Le ping UI ne repond pas
- verifier l'adresse IP peer et le port TCP peer dans les logs
- verifier que le processus distant tourne toujours

C) Connect/Message echoue
- cliquer CONNECT d'abord
- attendre "session etablie" puis envoyer
- verifier les erreurs de handshake dans les logs terminal

D) Port 7777 indisponible
- l'application peut basculer vers un autre port
- lire le port effectif dans les logs de demarrage

E) Erreurs Python de dependances
- activer .venv
- installer requirements.txt


10) Bonnes pratiques d'exploitation
-----------------------------------
- Une seule instance reseau principale par machine
- Garder des cles propres par machine si possible
- Eviter les copies de projet avec memes etats peers.json
- En cas de tests multiples: nettoyer peers.json avant une campagne


11) Commandes rapides
---------------------
- Lancer noeud Node:
  node index.js

- Verifier syntaxe Node:
  node --check index.js

- Verifier modules Python:
  python -m py_compile src/network/multicast.py


Pourquoi ce choix ?
En isolant la sécurité en Python et le réseau en Node.js, Archipel offre une résilience maximale : si l'interface plante, le transfert continue. Si le réseau est instable, la cryptographie reste intègre.

