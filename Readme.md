ARCHIPEL : Protocole P2P Souverain
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

Stack Technique & Répartition
Python : Le Moteur de Sécurité
Python est le garant de l'intégrité et de la confidentialité dans les modules src/identity/, src/crypto/ et src/transfer/.
•	Robustesse Cryptographique : Utilisation de PyNaCl pour la génération de clés Ed25519. Chaque utilisateur possède une identité numérique infalsifiable générée localement.
•	Isolation & Chiffrement : Implémentation du chiffrement AES-256-GCM via le module cryptography, assurant que seules les personnes autorisées peuvent lire les données.
•	Traitement de Données (Chunks) : Segmentation intelligente des fichiers en morceaux de 512 KB avec vérification par Hash SHA-256 pour garantir l'absence de corruption pendant le transit

JavaScript (Node.js) : Le Chef d'Orchestre Réseau
Node.js assure la liaison nerveuse du nœud dans le dossier src/network/.
•	Le Radar (UDP Multicast) : Écoute et émission sur 239.255.42.99:6000 via le module dgram. Sa nature asynchrone permet une découverte de pairs fluide en arrière-plan.
•	Le Tunnel (TCP Sockets) : Gestion des transferts haute performance. Node.js reçoit les flux binaires et les redirige vers les modules de traitement.
•	Temps Réel (Socket.io) : Pont instantané entre le cœur réseau et l'interface utilisateur pour un affichage des logs sans latence.
•	Gestion de Flux (Streams) : Traitement des données par flux pour minimiser l'empreinte RAM, même lors du partage de fichiers volumineux.

Installation rapide
1.	Cloner le projet
2.	Installer les dépendances :
Bash
npm install
pip install -r requirements.txt
3.	Configurer le .env :
Extrait de code
MULTICAST_ADDR=239.255.42.99
MULTICAST_PORT=6000
TCP_PORT=7777
4.	Lancer le nœud :
Bash
node index.js

💡 Pourquoi ce choix ?
En isolant la sécurité en Python et le réseau en Node.js, Archipel offre une résilience maximale : si l'interface plante, le transfert continue. Si le réseau est instable, la cryptographie reste intègre.

