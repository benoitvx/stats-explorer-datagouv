#!/usr/bin/env tsx
/**
 * Script de synchronisation des statistiques data.gouv.fr
 * 
 * Récupère les stats depuis l'API metric, enrichit avec les métadonnées,
 * et génère les fichiers JSON statiques pour l'application.
 * 
 * Usage:
 *   npm run sync-stats          # Exécution normale
 *   npm run sync-stats:dry      # Mode dry-run (pas d'écriture)
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MetricApiDatasetResponse,
  MetricApiDatasetEntry,
  DatagouvDataset,
  GlobalStats,
  MonthlyStats,
  DatasetStats,
  DatasetSummary,
  DatasetRanking,
  TopDatasetsData,
  DatasetsIndex,
  SyncOptions,
} from '../src/lib/types';

// ============================================
// Configuration
// ============================================

const METRIC_API_BASE = 'https://metric-api.data.gouv.fr/api';
const DATAGOUV_API_BASE = 'https://www.data.gouv.fr/api/1';
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data');
const TOP_DATASETS_COUNT = 100;
const PAGE_SIZE = 50; // Maximum autorisé par l'API metric
const RATE_LIMIT_DELAY = 100; // ms entre chaque requête

// ============================================
// Utilitaires
// ============================================

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json() as T;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`  Retry ${i + 1}/${retries} pour ${url}`);
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error('Unreachable');
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

function getMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 7); // "YYYY-MM"
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// ============================================
// Récupération des données API Metric
// ============================================

interface DatasetMetrics {
  datasetId: string;
  monthlyStats: Map<string, { visits: number; downloads: number }>;
  totalVisits: number;
  totalDownloads: number;
}

async function fetchAllDatasetIds(options: SyncOptions): Promise<string[]> {
  console.log('📊 Récupération de la liste des datasets avec stats...');
  
  const datasetIds = new Set<string>();
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${METRIC_API_BASE}/datasets/data/?page=${page}&page_size=${PAGE_SIZE}`;
    if (options.verbose) console.log(`  Page ${page}...`);
    
    const response = await fetchWithRetry<MetricApiDatasetResponse>(url);
    
    for (const entry of response.data) {
      datasetIds.add(entry.dataset_id);
    }
    
    hasMore = response.links.next !== null;
    page++;
    
    if (options.maxDatasets && datasetIds.size >= options.maxDatasets) {
      console.log(`  ⚠️ Limite de ${options.maxDatasets} datasets atteinte (mode test)`);
      break;
    }
    
    await sleep(RATE_LIMIT_DELAY);
  }
  
  console.log(`  ✓ ${formatNumber(datasetIds.size)} datasets trouvés`);
  return Array.from(datasetIds);
}

async function fetchDatasetMetrics(datasetId: string): Promise<DatasetMetrics> {
  const monthlyStats = new Map<string, { visits: number; downloads: number }>();
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${METRIC_API_BASE}/datasets/data/?dataset_id__exact=${datasetId}&page=${page}&page_size=${PAGE_SIZE}`;
    const response = await fetchWithRetry<MetricApiDatasetResponse>(url);
    
    for (const entry of response.data) {
      monthlyStats.set(entry.metric_month, {
        visits: entry.monthly_visit || 0,
        downloads: entry.monthly_download_resource || 0,
      });
    }
    
    hasMore = response.links.next !== null;
    page++;
    await sleep(RATE_LIMIT_DELAY);
  }
  
  let totalVisits = 0;
  let totalDownloads = 0;
  for (const stats of monthlyStats.values()) {
    totalVisits += stats.visits;
    totalDownloads += stats.downloads;
  }
  
  return {
    datasetId,
    monthlyStats,
    totalVisits,
    totalDownloads,
  };
}

// ============================================
// Récupération des métadonnées data.gouv.fr
// ============================================

async function fetchDatasetMetadata(datasetId: string): Promise<DatagouvDataset | null> {
  try {
    const url = `${DATAGOUV_API_BASE}/datasets/${datasetId}/`;
    return await fetchWithRetry<DatagouvDataset>(url);
  } catch (error) {
    // Dataset peut avoir été supprimé
    return null;
  }
}

// ============================================
// Calcul des agrégats
// ============================================

function calculateGlobalStats(allMetrics: DatasetMetrics[]): GlobalStats {
  const monthlyAggregates = new Map<string, { visits: number; downloads: number }>();
  let totalVisits = 0;
  let totalDownloads = 0;
  
  for (const dataset of allMetrics) {
    totalVisits += dataset.totalVisits;
    totalDownloads += dataset.totalDownloads;
    
    for (const [month, stats] of dataset.monthlyStats) {
      const current = monthlyAggregates.get(month) || { visits: 0, downloads: 0 };
      monthlyAggregates.set(month, {
        visits: current.visits + stats.visits,
        downloads: current.downloads + stats.downloads,
      });
    }
  }
  
  // Trier les mois chronologiquement
  const sortedMonths = Array.from(monthlyAggregates.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  const monthlyStats: MonthlyStats[] = sortedMonths.map(([month, stats]) => ({
    month,
    visits: stats.visits,
    downloads: stats.downloads,
  }));
  
  return {
    totalVisits,
    totalDownloads,
    totalDatasets: allMetrics.length,
    startDate: sortedMonths[0]?.[0] || '2022-07',
    lastUpdate: new Date().toISOString(),
    monthlyStats,
  };
}

function calculateTopDatasets(
  allMetrics: DatasetMetrics[],
  metadataMap: Map<string, DatagouvDataset>
): TopDatasetsData {
  const currentMonth = getCurrentMonth();
  const lastMonth = getMonthsAgo(1);
  const lastYear = getMonthsAgo(12);
  
  // Helper pour calculer les stats sur une période
  const getStatsForPeriod = (
    metrics: DatasetMetrics,
    startMonth: string,
    endMonth: string = currentMonth
  ): { visits: number; downloads: number } => {
    let visits = 0;
    let downloads = 0;
    for (const [month, stats] of metrics.monthlyStats) {
      if (month >= startMonth && month <= endMonth) {
        visits += stats.visits;
        downloads += stats.downloads;
      }
    }
    return { visits, downloads };
  };
  
  // Helper pour créer un ranking
  const createRanking = (
    metrics: DatasetMetrics,
    metadata: DatagouvDataset,
    value: number,
    previousValue: number,
    rank: number
  ): DatasetRanking => ({
    id: metrics.datasetId,
    title: metadata.title,
    slug: metadata.slug,
    organization: metadata.organization?.name || 'Inconnu',
    organizationId: metadata.organization?.id || '',
    value,
    previousValue,
    trend: previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0,
    rank,
  });
  
  // Calculer les tops pour chaque période/métrique
  const periods = {
    week: { start: getMonthsAgo(0), prevStart: getMonthsAgo(1), prevEnd: getMonthsAgo(1) },
    month: { start: lastMonth, prevStart: getMonthsAgo(2), prevEnd: getMonthsAgo(2) },
    year: { start: lastYear, prevStart: getMonthsAgo(24), prevEnd: getMonthsAgo(13) },
    allTime: { start: '2022-07', prevStart: '2022-07', prevEnd: '2022-07' },
  };
  
  const result: TopDatasetsData = {
    lastUpdate: new Date().toISOString(),
    week: { visits: [], downloads: [] },
    month: { visits: [], downloads: [] },
    year: { visits: [], downloads: [] },
    allTime: { visits: [], downloads: [] },
  };
  
  for (const [periodKey, periodConfig] of Object.entries(periods)) {
    const period = periodKey as keyof typeof periods;
    
    // Calculer les valeurs pour cette période
    const datasetsWithStats = allMetrics
      .map(m => {
        const metadata = metadataMap.get(m.datasetId);
        if (!metadata) return null;
        
        const current = getStatsForPeriod(m, periodConfig.start);
        const previous = period !== 'allTime' 
          ? getStatsForPeriod(m, periodConfig.prevStart, periodConfig.prevEnd)
          : { visits: 0, downloads: 0 };
        
        return { metrics: m, metadata, current, previous };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
    
    // Top par visites
    const byVisits = [...datasetsWithStats]
      .sort((a, b) => b.current.visits - a.current.visits)
      .slice(0, TOP_DATASETS_COUNT);
    
    result[period].visits = byVisits.map((d, i) =>
      createRanking(d.metrics, d.metadata, d.current.visits, d.previous.visits, i + 1)
    );
    
    // Top par téléchargements
    const byDownloads = [...datasetsWithStats]
      .sort((a, b) => b.current.downloads - a.current.downloads)
      .slice(0, TOP_DATASETS_COUNT);
    
    result[period].downloads = byDownloads.map((d, i) =>
      createRanking(d.metrics, d.metadata, d.current.downloads, d.previous.downloads, i + 1)
    );
  }
  
  return result;
}

function createDatasetsIndex(metadataMap: Map<string, DatagouvDataset>): DatasetsIndex {
  const datasets: DatasetSummary[] = [];
  
  for (const [id, metadata] of metadataMap) {
    datasets.push({
      id,
      title: metadata.title,
      slug: metadata.slug,
      organization: metadata.organization?.name || 'Inconnu',
      organizationId: metadata.organization?.id || '',
    });
  }
  
  // Trier par titre
  datasets.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  
  return {
    lastUpdate: new Date().toISOString(),
    datasets,
  };
}

function createDatasetStats(
  metrics: DatasetMetrics,
  metadata: DatagouvDataset
): DatasetStats {
  const monthlyStats: MonthlyStats[] = Array.from(metrics.monthlyStats.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({
      month,
      visits: stats.visits,
      downloads: stats.downloads,
    }));
  
  return {
    id: metrics.datasetId,
    title: metadata.title,
    slug: metadata.slug,
    organization: metadata.organization?.name || 'Inconnu',
    organizationId: metadata.organization?.id || '',
    url: metadata.page || `https://www.data.gouv.fr/fr/datasets/${metadata.slug}/`,
    totalVisits: metrics.totalVisits,
    totalDownloads: metrics.totalDownloads,
    monthlyStats,
    firstMonth: monthlyStats[0]?.month || '',
    lastMonth: monthlyStats[monthlyStats.length - 1]?.month || '',
  };
}

// ============================================
// Écriture des fichiers
// ============================================

function writeJsonFile(filePath: string, data: unknown, options: SyncOptions): void {
  const fullPath = path.join(OUTPUT_DIR, filePath);
  const dir = path.dirname(fullPath);
  
  if (options.dryRun) {
    console.log(`  [DRY-RUN] Écriture: ${filePath}`);
    return;
  }
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    maxDatasets: args.includes('--test') ? 50 : undefined,
  };
  
  console.log('🚀 Démarrage de la synchronisation des stats data.gouv.fr');
  console.log(`   Mode: ${options.dryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
  if (options.maxDatasets) console.log(`   ⚠️ Mode test: limité à ${options.maxDatasets} datasets`);
  console.log('');
  
  const startTime = Date.now();
  
  // 1. Récupérer la liste des datasets
  const datasetIds = await fetchAllDatasetIds(options);
  
  // 2. Récupérer les métriques de chaque dataset
  console.log('\n📈 Récupération des métriques par dataset...');
  const allMetrics: DatasetMetrics[] = [];
  let processed = 0;
  
  for (const datasetId of datasetIds) {
    try {
      const metrics = await fetchDatasetMetrics(datasetId);
      allMetrics.push(metrics);
    } catch (error) {
      console.warn(`  ⚠️ Erreur pour ${datasetId}: ${error}`);
    }
    
    processed++;
    if (processed % 100 === 0 || processed === datasetIds.length) {
      console.log(`  ${formatNumber(processed)}/${formatNumber(datasetIds.length)} datasets traités`);
    }
  }
  
  // 3. Récupérer les métadonnées
  console.log('\n📝 Récupération des métadonnées...');
  const metadataMap = new Map<string, DatagouvDataset>();
  processed = 0;
  
  for (const metrics of allMetrics) {
    const metadata = await fetchDatasetMetadata(metrics.datasetId);
    if (metadata) {
      metadataMap.set(metrics.datasetId, metadata);
    }
    
    processed++;
    if (processed % 100 === 0 || processed === allMetrics.length) {
      console.log(`  ${formatNumber(processed)}/${formatNumber(allMetrics.length)} métadonnées récupérées`);
    }
    
    await sleep(RATE_LIMIT_DELAY);
  }
  
  console.log(`  ✓ ${formatNumber(metadataMap.size)} datasets avec métadonnées`);
  
  // 4. Calculer les agrégats
  console.log('\n🧮 Calcul des agrégats...');
  const globalStats = calculateGlobalStats(allMetrics);
  const topDatasets = calculateTopDatasets(allMetrics, metadataMap);
  const datasetsIndex = createDatasetsIndex(metadataMap);
  
  console.log(`  Total visites: ${formatNumber(globalStats.totalVisits)}`);
  console.log(`  Total téléchargements: ${formatNumber(globalStats.totalDownloads)}`);
  console.log(`  Période: ${globalStats.startDate} → ${globalStats.monthlyStats[globalStats.monthlyStats.length - 1]?.month}`);
  
  // 5. Écrire les fichiers
  console.log('\n💾 Écriture des fichiers JSON...');
  
  writeJsonFile('global-stats.json', globalStats, options);
  writeJsonFile('top-datasets.json', topDatasets, options);
  writeJsonFile('datasets-index.json', datasetsIndex, options);
  
  // Fichiers individuels pour les top 100 (pour détails)
  const topDatasetIds = new Set<string>();
  for (const period of ['week', 'month', 'year', 'allTime'] as const) {
    for (const ranking of topDatasets[period].visits) {
      topDatasetIds.add(ranking.id);
    }
    for (const ranking of topDatasets[period].downloads) {
      topDatasetIds.add(ranking.id);
    }
  }
  
  console.log(`  Génération de ${topDatasetIds.size} fichiers de détails...`);
  for (const datasetId of topDatasetIds) {
    const metrics = allMetrics.find(m => m.datasetId === datasetId);
    const metadata = metadataMap.get(datasetId);
    if (metrics && metadata) {
      const datasetStats = createDatasetStats(metrics, metadata);
      writeJsonFile(`datasets/${datasetId}.json`, datasetStats, options);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Synchronisation terminée en ${duration} minutes`);
  
  if (options.dryRun) {
    console.log('\n⚠️ Mode DRY-RUN: aucun fichier n\'a été écrit');
  }
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
