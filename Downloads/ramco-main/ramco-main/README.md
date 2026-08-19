# RH & Présences

## Démarrer en local

Backend :
```bash
cd backend
npm run dev
```
API sur http://localhost:4000

Frontend :
```bash
cd frontend
npm run dev
```
App sur http://localhost:5173 (proxy `/api` vers le backend)


## Ce qui reste à ajuster avant une mise en prod
- La formule de calcul des indemnités STC (`backend/src/routes/stc.js`, fonction `computeIndemnities`) est indicative — à remplacer par le barème légal réel.
- Le seuil de retard (8h30) est en dur dans `backend/src/utils/business.js`.
- Pas encore de formulaire de création d'employé côté UI (l'endpoint `POST /api/employees` existe côté API).
- JWT_SECRET et mot de passe DB sont en clair dans `.env` — à changer avant tout déploiement public.
