// Route très simple : liste des sites/agences de l'entreprise, utilisée
// pour remplir les menus déroulants "Site" dans les formulaires du frontend
// (création d'employé, création de manager, import Excel...).
// Pas de POST/PUT/DELETE : la création de sites se fait directement en base
// pour l'instant (voir prisma/seed.js), ce n'est pas un besoin du cahier des charges.
const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

router.get('/', async (req, res) => {
  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } });
  res.json(sites);
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Le nom du site est requis' });
  try {
    const site = await prisma.site.create({ data: { name } });
    res.status(201).json(site);
  } catch {
    res.status(400).json({ error: 'Ce site existe déjà' });
  }
});

module.exports = router;
