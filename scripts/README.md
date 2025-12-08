# Scripts de synchronisation des données

Ce dossier contient les scripts pour synchroniser les statistiques depuis l'API metric de data.gouv.fr.

## 📜 Scripts disponibles

### 1. `sync-stats.ts` - Synchronisation complète

**Utilisation** : Synchronisation initiale ou reconstruction complète des données.

```bash
# Synchronisation complète (tous les datasets depuis 2022)
npm run sync-stats

# Mode test (50 datasets maximum)
npm run sync-stats -- --test

# Mode dry-run (pas d'écriture)
npm run sync-stats:dry

# Verbose
npm run sync-stats -- --verbose
```

**⚠️ Attention** : Ce script prend plusieurs heures et récupère **tous les datasets** depuis le début. À utiliser uniquement pour :
- La première synchronisation
- Une reconstruction complète des données
- Résoudre des incohérences dans les données

**Sortie** :
- `public/data/global-stats.json` - Statistiques globales
- `public/data/top-datasets.json` - Top 100 par période/métrique
- `public/data/datasets-index.json` - Index de tous les datasets
- `public/data/datasets/{id}.json` - Stats détaillées par dataset

---

### 2. `sync-incremental.ts` - Synchronisation incrémentale ⭐

**Utilisation** : Mise à jour mensuelle des données (recommandé).

```bash
# Synchronisation incrémentale (nouveaux mois uniquement)
npm run sync-incremental

# Mode dry-run
npm run sync-incremental:dry

# Verbose
npm run sync-incremental -- --verbose
```

**✅ Avantages** :
- **Rapide** : Quelques minutes au lieu de plusieurs heures
- **Sûr** : Ne touche pas aux données historiques
- **Efficace** : Récupère uniquement les mois manquants

**Fonctionnement** :
1. Lit les données existantes dans `public/data/`
2. Identifie le dernier mois présent
3. Récupère les mois manquants depuis l'API metric
4. Fusionne les nouvelles données avec les existantes
5. Recalcule les tops et met à jour les fichiers

**⚠️ Prérequis** : Les données existantes doivent être présentes (fichier `global-stats.json`). Si ce n'est pas le cas, utilisez d'abord `sync-stats`.

---

## 🤖 Automatisation GitHub Action

Le workflow `.github/workflows/sync-data.yml` exécute automatiquement :

- **Chaque 2 du mois à 6h UTC** : Synchronisation incrémentale
- **Déclenchement manuel** : Via l'interface GitHub Actions

### Déclenchement manuel

1. Aller dans l'onglet "Actions" du repository GitHub
2. Sélectionner "Sync Stats data.gouv.fr"
3. Cliquer sur "Run workflow"
4. Choisir le mode :
   - **incremental** (recommandé) : Ajoute uniquement les nouveaux mois
   - **full** : Synchronisation complète (long)

---

## 📊 Structure des données

```
public/data/
├── global-stats.json          # Stats globales agrégées
├── top-datasets.json          # Top 100 par période/métrique
├── datasets-index.json        # Index de tous les datasets
└── datasets/
    ├── {dataset-id}.json      # Stats détaillées par dataset
    └── ...
```

### Format `global-stats.json`

```json
{
  "totalVisits": 214197243,
  "totalDownloads": 781395014,
  "totalDatasets": 139192,
  "startDate": "2022-07",
  "lastUpdate": "2025-12-04T12:06:08Z",
  "monthlyStats": [
    {
      "month": "2022-07",
      "visits": 1819851,
      "downloads": 7878650
    }
  ]
}
```

---

## 🔧 Développement

### Tester localement

```bash
# Test avec mode dry-run (pas d'écriture)
npm run sync-incremental:dry -- --verbose

# Vérifier les données
cat public/data/global-stats.json | jq '.totalDatasets'
```

### Ajouter un nouveau type

Éditer `src/lib/types.ts` pour ajouter les types TypeScript.

---

## 🐛 Dépannage

### "Aucune donnée existante trouvée"

**Problème** : Le script incrémental ne trouve pas de données existantes.

**Solution** : Exécuter d'abord la synchronisation complète :
```bash
npm run sync-stats
```

### Les chiffres semblent incorrects

**Solution** : Restaurer les données depuis git et relancer :
```bash
git restore public/data/
npm run sync-incremental
```

### Le script prend trop de temps

**Problème** : Le script `sync-stats` prend plusieurs heures.

**Solution** : Utiliser le script incrémental pour les mises à jour mensuelles :
```bash
npm run sync-incremental
```

---

## 📝 Notes

- **Rate limiting** : Délai de 100ms entre chaque requête API
- **Retry** : 3 tentatives avec backoff exponentiel
- **Période couverte** : Depuis juillet 2022
- **API metric** : https://metric-api.data.gouv.fr/api
- **API data.gouv.fr** : https://www.data.gouv.fr/api/1
