# Irene Monticelli — Sito

Sito statico multi-pagina (Bailarina, Coreógrafa, Profesora).

## Pagine (permalink separati)

| File | Pagina |
|------|--------|
| `index.html` | Home |
| `pro-dance.html` | Pro Dance Experience |
| `contatti.html` | Contacto |
| `pack-single.html` | Pack Single |
| `pack-gold.html` | Pack Gold |
| `pack-red.html` | Pack Red |
| `pack-junior.html` | Pack Junior |

Ogni pagina è un file HTML autonomo (CSS, font e immagini inclusi inline):
cambiando pagina cambia il permalink. Nessun build/server richiesto — basta
aprire `index.html` o pubblicare la cartella su un host statico.

## Sorgente

- `sito_irene_monticelli (1).html` — file SPA originale a pagina singola.
- `build_pages.js` — script Node che genera le pagine separate dal sorgente.
- `Foto sito Irene Monticelli/` — immagini originali.

Per rigenerare le pagine: `node build_pages.js`

## Dashboard Admin

È presente un'area di amministrazione (`/admin`) basata su Node + Express +
Prisma (SQLite). L'app Node serve sia il sito pubblico sia l'admin.

```bash
npm install
npm run setup   # crea DB + super-admin (password stampata in console)
npm start       # http://localhost:3017  ·  admin: /admin
```

Documentazione completa: **[ADMIN.md](ADMIN.md)**.
