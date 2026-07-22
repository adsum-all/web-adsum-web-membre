# adsum-web-membre

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)
![React Flow](https://img.shields.io/badge/React%20Flow-12.11-FF0072?logo=reactflow&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-service%20worker-5A0FC8?logo=pwa&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-5FA04E?logo=nodedotjs&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-deploy-F38020?logo=cloudflare&logoColor=white)

Part of the ADSUM platform (membership, QR check-in and attendance).
Subgroup: `applications`.

## Role

Member web space (mobile and desktop): card, QR, history, activities, participation, census.

## Stack

React 18 + TypeScript, built with Vite, installable as a PWA (service worker for
offline resilience). The QR is signed through the shared @adsum/qr package; the
organisation chart uses @xyflow/react with a dagre layout. No Tailwind or component
kit: hand written CSS with the @adsum/tokens design tokens. Deployed to Cloudflare
Pages. Exact versions in the table at the bottom.

## Conventions

- Branches: work on `feature/*` or `fix/*` from `develop`, then a merge request.
  Merge order `feature/* -> develop -> main`. Never push to `main`.
- Constitution (zero tolerance): no mock data, no file over 500 lines,
  no em-dash (U+2014 / U+2013), no secret in clear. CI enforces these.
- Commit messages in English, Conventional Commits.

## CI

Pipelines are defined in `.gitlab-ci.yml`, which includes the shared templates
from `sr-media-ai/adsum/deployment/ci-templates`.

## Stack technique, versions exactes

Versions exactes résolues dans `package-lock.json` (les `^` de `package.json` sont des plages ; le tableau donne la version verrouillée et construite).

| Composant | Rôle | Version exacte |
| --- | --- | --- |
| Node.js | Runtime de build | >=20 (`engines`), 22.19.0 (dev) |
| React / react-dom | Bibliothèque UI | 18.3.1 |
| TypeScript | Langage | 5.9.3 |
| Vite | Build et dev server | 5.4.21 |
| @vitejs/plugin-react | Plugin React pour Vite | 4.7.0 |
| Vitest | Tests unitaires | 2.1.9 |
| @xyflow/react (React Flow) | Organigramme lecture seule | 12.11.2 |
| dagre | Disposition du graphe | 0.8.5 |
| qrcode | Génération de QR | 1.5.4 |
| @adsum/qr | QR signé (paquet partagé) | 0.1.0 |
| @adsum/tokens | Design tokens partagés | 0.1.0 |
| Cloudflare Pages | Hébergement (via `wrangler`) | build statique `dist/` + PWA |
