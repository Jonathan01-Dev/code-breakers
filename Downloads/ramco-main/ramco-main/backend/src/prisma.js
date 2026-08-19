// Instance unique (singleton) du client Prisma, partagée par tout le backend.
// Prisma génère cette classe PrismaClient automatiquement à partir de
// prisma/schema.prisma (commande `npx prisma generate`) : chaque modèle
// (Employee, Contract, User...) devient une propriété avec des méthodes
// findMany/create/update/delete typées.
//
// On crée une seule instance ici et on l'importe partout ailleurs
// (require('../prisma')) plutôt que de faire `new PrismaClient()` dans
// chaque fichier de route : ça évite d'ouvrir trop de connexions à la
// base de données.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
