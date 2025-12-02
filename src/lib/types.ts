/**
 * Types pour Stats Explorer data.gouv.fr
 */

// ============================================
// Types API Metric (source)
// ============================================

/** Réponse de l'API metric pour un dataset */
export interface MetricApiDatasetResponse {
  data: MetricApiDatasetEntry[];
  links: {
    next: string | null;
    prev: string | null;
  };
  meta: {
    page: number;
    page_size: number;
    total: number;
  };
}

/** Entrée de stats pour un dataset (API metric) */
export interface MetricApiDatasetEntry {
  __id: number;
  dataset_id: string;
  metric_month: string; // "YYYY-MM"
  monthly_visit: number;
  monthly_download_resource: number | null;
}

// ============================================
// Types API data.gouv.fr (métadonnées)
// ============================================

/** Dataset depuis l'API data.gouv.fr */
export interface DatagouvDataset {
  id: string;
  title: string;
  slug: string;
  description: string;
  page: string; // URL de la page
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string;
  } | null;
  metrics: {
    views: number;
    downloads: number;
    followers: number;
    reuses: number;
  };
  created_at: string;
  last_modified: string;
}

// ============================================
// Types internes (données générées)
// ============================================

/** Statistiques mensuelles */
export interface MonthlyStats {
  month: string; // "YYYY-MM"
  visits: number;
  downloads: number;
}

/** Statistiques globales de data.gouv.fr */
export interface GlobalStats {
  totalVisits: number;
  totalDownloads: number;
  totalDatasets: number;
  startDate: string; // "2022-07" (début des stats)
  lastUpdate: string; // ISO date de la dernière MAJ
  monthlyStats: MonthlyStats[];
}

/** Résumé d'un dataset (pour index de recherche) */
export interface DatasetSummary {
  id: string;
  title: string;
  slug: string;
  organization: string;
  organizationId: string;
}

/** Dataset dans un classement */
export interface DatasetRanking extends DatasetSummary {
  value: number; // visites ou téléchargements selon le filtre
  previousValue: number; // valeur période précédente (pour calcul tendance)
  trend: number; // % variation vs période précédente
  rank: number;
}

/** Statistiques détaillées d'un dataset */
export interface DatasetStats extends DatasetSummary {
  url: string; // URL page data.gouv.fr
  totalVisits: number;
  totalDownloads: number;
  monthlyStats: MonthlyStats[];
  firstMonth: string; // Premier mois avec des stats
  lastMonth: string; // Dernier mois avec des stats
}

/** Structure des tops datasets par période et métrique */
export interface TopDatasetsData {
  lastUpdate: string;
  week: {
    visits: DatasetRanking[];
    downloads: DatasetRanking[];
  };
  month: {
    visits: DatasetRanking[];
    downloads: DatasetRanking[];
  };
  year: {
    visits: DatasetRanking[];
    downloads: DatasetRanking[];
  };
  allTime: {
    visits: DatasetRanking[];
    downloads: DatasetRanking[];
  };
}

/** Index de recherche (léger, pour autocomplétion) */
export interface DatasetsIndex {
  lastUpdate: string;
  datasets: DatasetSummary[];
}

// ============================================
// Types utilitaires
// ============================================

/** Période pour les filtres */
export type Period = 'week' | 'month' | 'year' | 'allTime';

/** Métrique pour les filtres */
export type Metric = 'visits' | 'downloads';

/** Options du script de sync */
export interface SyncOptions {
  dryRun: boolean;
  verbose: boolean;
  maxDatasets?: number; // Pour les tests, limiter le nombre de datasets
}
