const express = require('express');
const prisma = require('../lib/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const [users, roles, media, mediaAgg] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.media.count(),
    prisma.media.aggregate({ _sum: { sizeBytes: true, smallBytes: true } }),
  ]);
  const recentMedia = await prisma.media.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  res.render('dashboard', {
    title: 'Dashboard',
    stats: {
      users,
      roles,
      media,
      storageBytes: (mediaAgg._sum.sizeBytes || 0) + (mediaAgg._sum.smallBytes || 0),
    },
    recentMedia,
  });
});

module.exports = router;
