const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/db');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Troppi tentativi di accesso. Riprova tra qualche minuto.',
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/admin');
  res.render('login', { title: 'Accedi', error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email: String(email || '').toLowerCase().trim() },
    include: { role: true },
  });
  const ok = user && user.isActive && (await bcrypt.compare(String(password || ''), user.passwordHash));
  if (!ok) {
    return res.status(401).render('login', { title: 'Accedi', error: 'Credenziali non valide o utente disattivato.' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  req.session.userId = user.id;
  const dest = req.session.returnTo || '/admin';
  delete req.session.returnTo;
  res.redirect(user.mustChangePassword ? '/admin/change-password' : dest);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/change-password', (req, res) => {
  if (!req.user) return res.redirect('/admin/login');
  res.render('change-password', { title: 'Cambia password', error: null });
});

router.post('/change-password', async (req, res) => {
  if (!req.user) return res.redirect('/admin/login');
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const render = (error) => res.render('change-password', { title: 'Cambia password', error });

  const matchCurrent = await bcrypt.compare(String(currentPassword || ''), req.user.passwordHash);
  if (!matchCurrent) return render('La password attuale non e corretta.');
  if (String(newPassword || '').length < 8) return render('La nuova password deve avere almeno 8 caratteri.');
  if (newPassword !== confirmPassword) return render('Le password non coincidono.');

  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  req.flash('success', 'Password aggiornata con successo.');
  res.redirect('/admin');
});

module.exports = router;
