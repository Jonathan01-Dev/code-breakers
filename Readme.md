##SCHEMA ASCII

                    ARCHIPEL : RÉSEAU LOCAL SOUVERAIN (OFFLINE)


      [ COUCHE UI ]             [HTML/CSS/JS ]
            |                   (Affiche ce qui se passe dans le réseau)
            v
 +-----------------------+      +----------------------------------------------+
 |   INTERFACE LOCALE    | <--> | LOGS & MONITORING (Pairs détectés / Fichiers)|
 +-----------------------+      +----------------------------------------------+
            ^
            | (Communication interne via 127.0.0.1)
            v
 +-----------------------------------------------------------------------------+
 |                         NŒUD ARCHIPEL (LE CŒUR)                             |
 |                                                                             |
 |  [ NETWORK ] (Node.js)           [ CRYPTO ] (Python)                        |
 |  - Le "Radar" (UDP Multicast)         - Le "Handshake" (Clés secrètes)      |
 |  - Le "Tunnel" (TCP Sockets)          - Le "Verrou" (AES-256-GCM)           |
 |                                                                             |
 |  [ IDENTITY ] (Python)              [ TRANSFER ] (Python)                   |
 |  - Le "Passeport" (Clés Ed25519)      - Le "Puzzle" (Découpage en Chunks)   |
 |  - La "Signature" (Preuve d'ID)       - Le "Vérificateur" (Hash SHA-256)    |
 +-----------------------------------------------------------------------------+
            ^                                          ^
            |                                          |
            |           [ RÉSEAU LOCAL (Wi-Fi/LAN) ]   |
            +---------------------+--------------------+
                                  |
            ______________________v______________________
           |                                             |
           |           AUTRES NŒUDS VOISINS              |
           |      (PC connectés au même switch/Wi-Fi)    |
           |_____________________________________________|

##TECHNOLOGIES
 - Python
 
