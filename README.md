# Stats Explorer data.gouv.fr

Visualisez l'historique et les tendances d'usage des jeux de données sur [data.gouv.fr](https://www.data.gouv.fr).

## 🎯 Objectif

data.gouv.fr affiche actuellement uniquement des statistiques cumulées (ex: "6K vues"). Ce projet apporte :

- **Historique mensuel** depuis juillet 2022
- **Classements** des datasets les plus consultés/téléchargés
- **Tendances** et évolutions dans le temps
- **Transparence** sur l'usage de l'open data français

## 🚀 Fonctionnalités

- **Stats globales** : visites et téléchargements totaux, évolution mensuelle
- **Top datasets** : classement par visites ou téléchargements (semaine, mois, année, depuis 2022)
- **Explorer un dataset** : recherche et visualisation détaillée de l'historique

## 🛠️ Stack technique

- **Framework** : Next.js 14 (App Router, SSG)
- **Langage** : TypeScript
- **UI** : DSFR (Système de Design de l'État)
- **Données** : Fichiers JSON statiques pré-calculés
- **CI/CD** : GitHub Actions (sync quotidienne)
- **Hébergement** : Vercel

## 📊 Sources de données

- [API Metric data.gouv.fr](https://metric-api.data.gouv.fr/api/) : statistiques d'usage mensuelles
- [API data.gouv.fr](https://www.data.gouv.fr/api/1/) : métadonnées des datasets

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Metric    │     │  API data.gouv  │     │  GitHub Action  │
│ (stats mensuels)│     │  (métadonnées)  │     │  (cron 6h UTC)  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────┬───────────┘                       │
                     ▼                                   │
         ┌───────────────────────┐                       │
         │  scripts/sync-stats   │◄──────────────────────┘
         │  (récupération +      │
         │   calcul agrégats)    │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  public/data/*.json   │
         │  (fichiers statiques) │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   App Next.js (SSG)   │
         │   hébergée sur Vercel │
         └───────────────────────┘
```

## 🚦 Développement local

```bash
# Cloner le repo
git clone https://github.com/YOUR_USERNAME/stats-explorer-datagouv.git
cd stats-explorer-datagouv

# Installer les dépendances
npm install

# Synchroniser les données (mode test : 50 datasets)
npm run sync-stats -- --test --verbose

# Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## 📜 Scripts disponibles

| Script | Description |
|--------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run sync-stats` | Synchronisation complète des données |
| `npm run sync-stats:dry` | Dry-run (sans écriture) |
| `npm run sync-stats -- --test` | Mode test (50 datasets max) |

## 📁 Structure du projet

```
stats-explorer-datagouv/
├── .github/workflows/
│   └── sync-data.yml       # GitHub Action sync quotidienne
├── scripts/
│   └── sync-stats.ts       # Script de récupération des données
├── public/data/
│   ├── global-stats.json   # Stats agrégées globales
│   ├── top-datasets.json   # Top 100 par période/métrique
│   ├── datasets-index.json # Index pour la recherche
│   └── datasets/           # Stats détaillées par dataset
├── src/
│   ├── app/                # Pages Next.js
│   ├── components/         # Composants React
│   ├── lib/                # Types et utilitaires
│   └── hooks/              # React hooks
└── package.json
```

## 🔄 Mise à jour des données

Les données sont mises à jour automatiquement chaque jour à 6h UTC via GitHub Actions.

Pour déclencher manuellement :
1. Aller dans l'onglet "Actions" du repo
2. Sélectionner "Sync Stats data.gouv.fr"
3. Cliquer "Run workflow"

## 📈 Roadmap

- [x] Script de synchronisation des données
- [x] GitHub Action quotidienne
- [ ] Page stats globales
- [ ] Section top datasets
- [ ] Recherche et détail dataset
- [ ] Déploiement Vercel

## 🤝 Contribution

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 Licence

MIT - voir [LICENSE](LICENSE)

## 🔗 Liens utiles

- [data.gouv.fr](https://www.data.gouv.fr)
- [API Metric documentation](https://metric-api.data.gouv.fr/api/)
- [DSFR - Système de Design de l'État](https://www.systeme-de-design.gouv.fr/)
