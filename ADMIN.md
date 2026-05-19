# Dashboard Admin — Irene Monticelli

App **Node.js + Express + Prisma (SQLite) + EJS**. Serve sia il sito pubblico
(con pretty URL, come la config nginx) sia l'area `/admin`.

## Avvio locale

```bash
npm install
npm run setup     # prisma generate + db push + seed (crea il super-admin)
npm start         # http://localhost:3017  —  admin: /admin
```

Al primo avvio viene creato un **Super Admin** (email da `.env`,
`SEED_ADMIN_EMAIL`, default `luca@mywebagency.com`). La password temporanea
viene **stampata in console** e va cambiata al primo accesso.

## Stack e scelte

- **SQLite** (`data/app.db`): backup = copia di un file. Migrabile a Postgres con Prisma.
- **Sessioni** persistenti su DB (`@quixo3/prisma-session-store`), cookie httpOnly, 8h.
- **RBAC**: ruoli con permessi dettagliati. `Super Admin` = permesso `*` (ruolo di sistema, non modificabile/eliminabile).
- **CSRF** su tutte le POST, **rate-limit** sul login, **helmet**, bcrypt (cost 12).
- **Immagini**: ogni upload → WebP, 2 varianti (`small` ≤480px q78, `normal` ≤1600px q82),
  auto-orient EXIF, originale scartato. Cap upload 15MB (`MAX_UPLOAD_MB`).

## Cosa è implementato (fase 1)

| Sezione | Stato | Note |
|---|---|---|
| Login / logout / cambio password forzato | ✅ | |
| Dashboard (riepilogo) | ✅ | |
| **Impostazioni generali** | ✅ | Logo, favicon (condivisa admin+sito), SMTP (+ test email), Stripe, reCAPTCHA Enterprise, Analytics, Social |
| **Utenti admin** | ✅ | CRUD, ruolo, attiva/disattiva, reset password, vincoli anti-lockout |
| **Ruoli e permessi** | ✅ | Permessi a catalogo per gruppo, selezione dettagliata |
| **Gestione media avanzata** | ✅ | Upload multiplo drag&drop, conversione WebP+varianti, selezione multipla, eliminazione bulk, dettaglio (peso/dimensioni/URL), media picker riutilizzabile |
| Statistiche | ✅ | Conteggi base + spazio occupato |
| Backup | ✅ | Zip di `data/app.db` + `uploads/`, download/elimina |

## Voci a menu già predisposte (da implementare)

Sezioni visibili nel menu come *“presto”*, schema permessi già pronto:

- **Contenuti** → Eventi, Pagine
- **Prenotazioni** → Piani/Pacchetti, Prenotazioni, Calendario
- **Comunicazione** → Newsletter, Messaggi contatto
- **Sistema** → Log attività

## Struttura

```
src/
  server.js            Express, sessioni, csrf, routing sito+admin
  config.js  seed.js
  lib/        db, settings, images (sharp), mailer, backup, permissions
  middleware/ auth, rbac, upload (multer)
  routes/     auth, dashboard, settings, users, roles, media
views/        EJS (layout sidebar, pagine)
public-admin/ css + js dashboard
prisma/schema.prisma
data/ uploads/ backups/   (runtime, git-ignored)
```

## Deploy

- **Un solo container** (sito + admin): `docker compose up -d --build` (usa `Dockerfile.node`).
- La `Dockerfile`/`nginx.conf` esistenti restano valide per servire **solo** il
  sito statico. Per usarle insieme all'admin, mettere nginx come reverse-proxy
  davanti al servizio Node (proxy di `/admin`, `/uploads`, `/favicon.ico`).
- Persistenza: volumi `data/`, `uploads/`, `backups/`.

> Sicurezza: imposta `SESSION_SECRET` in `.env`; le chiavi sensibili (SMTP/Stripe)
> sono salvate in chiaro nel DB locale — cifratura prevista come miglioria futura.
