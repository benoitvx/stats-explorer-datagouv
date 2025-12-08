#!/usr/bin/env tsx
/**
 * Script de synchronisation INCRÉMENTALE des statistiques data.gouv.fr
 *
 * Lit les données existantes et ajoute uniquement les nouveaux mois disponibles
 * depuis la dernière mise à jour, sans recalculer l'historique complet.
 *
 * Usage:
 *   npm run sync-incremental          # Exécution normale
 *   npm run sync-incremental:dry      # Mode dry-run (pas d'écriture)
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MetricApiDatasetResponse,
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
const PAGE_SIZE = 50;
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

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getNextMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  // Use Date.UTC to avoid timezone issues. monthNum is 1-indexed, Date expects 0-indexed for months
  // So we pass monthNum directly (not monthNum-1) to get the next month
  const date = new Date(Date.UTC(year, monthNum, 1));
  const nextMonth = date.toISOString().slice(0, 7);
  return nextMonth;
}

function getMonthsToFetch(lastMonth: string): string[] {
  const months: string[] = [];
  let current = getNextMonth(lastMonth);
  const now = getCurrentMonth();

  while (current <= now) {
    months.push(current);
    current = getNextMonth(current);
  }

  return months;
}

// ============================================
// Lecture des données existantes
// ============================================

function readJsonFile<T>(filePath: string): T | null {
  const fullPath = path.join(OUTPUT_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn(`  ⚠️ Erreur lecture ${filePath}: ${error}`);
    return null;
  }
}

function loadExistingData(): {
  globalStats: GlobalStats | null;
  topDatasets: TopDatasetsData | null;
  datasetsIndex: DatasetsIndex | null;
  existingDatasetIds: Set<string>;
} {
  console.log('📂 Chargement des données existantes...');

  const globalStats = readJsonFile<GlobalStats>('global-stats.json');
  const topDatasets = readJsonFile<TopDatasetsData>('top-datasets.json');
  const datasetsIndex = readJsonFile<DatasetsIndex>('datasets-index.json');

  const existingDatasetIds = new Set<string>();

  if (datasetsIndex) {
    for (const dataset of datasetsIndex.datasets) {
      existingDatasetIds.add(dataset.id);
    }
  }

  if (globalStats) {
    console.log(`  ✓ Données globales trouvées (${formatNumber(globalStats.totalDatasets)} datasets)`);
    console.log(`  ✓ Dernier mois: ${globalStats.monthlyStats[globalStats.monthlyStats.length - 1]?.month}`);
  } else {
    console.log('  ⚠️ Aucune donnée existante, synchronisation complète requise');
  }

  return { globalStats, topDatasets, datasetsIndex, existingDatasetIds };
}

// ============================================
// Récupération des nouvelles données
// ============================================

interface DatasetMonthlyUpdate {
  datasetId: string;
  month: string;
  visits: number;
  downloads: number;
}

async function fetchNewMonthData(month: string, knownDatasetIds: Set<string>): Promise<DatasetMonthlyUpdate[]> {
  console.log(`  Mois ${month}...`);

  const updates: DatasetMonthlyUpdate[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${METRIC_API_BASE}/datasets/data/?metric_month__exact=${month}&page=${page}&page_size=${PAGE_SIZE}`;
    const response = await fetchWithRetry<MetricApiDatasetResponse>(url);

    for (const entry of response.data) {
      updates.push({
        datasetId: entry.dataset_id,
        month: entry.metric_month,
        visits: entry.monthly_visit || 0,
        downloads: entry.monthly_download_resource || 0,
      });

      // Ajouter à la liste des datasets connus
      knownDatasetIds.add(entry.dataset_id);
    }

    hasMore = response.links.next !== null;
    page++;
    await sleep(RATE_LIMIT_DELAY);
  }

  console.log(`    ${formatNumber(updates.length)} entrées récupérées`);
  return updates;
}

// ============================================
// Récupération des métadonnées
// ============================================

async function fetchDatasetMetadata(datasetId: string): Promise<DatagouvDataset | null> {
  try {
    const url = `${DATAGOUV_API_BASE}/datasets/${datasetId}/`;
    return await fetchWithRetry<DatagouvDataset>(url);
  } catch (error) {
    return null;
  }
}

async function fetchMissingMetadata(
  newDatasetIds: Set<string>,
  existingDatasets: Map<string, DatasetSummary>
): Promise<Map<string, DatagouvDataset>> {
  const metadataMap = new Map<string, DatagouvDataset>();

  const missingIds = Array.from(newDatasetIds).filter(id => !existingDatasets.has(id));

  if (missingIds.length === 0) {
    console.log('  ✓ Aucune nouvelle métadonnée à récupérer');
    return metadataMap;
  }

  console.log(`📝 Récupération de ${formatNumber(missingIds.length)} nouvelles métadonnées...`);

  let processed = 0;
  for (const datasetId of missingIds) {
    const metadata = await fetchDatasetMetadata(datasetId);
    if (metadata) {
      metadataMap.set(datasetId, metadata);
    }

    processed++;
    if (processed % 50 === 0 || processed === missingIds.length) {
      console.log(`  ${formatNumber(processed)}/${formatNumber(missingIds.length)} métadonnées récupérées`);
    }

    await sleep(RATE_LIMIT_DELAY);
  }

  return metadataMap;
}

// ============================================
// Fusion et recalcul
// ============================================

function mergeMonthlyData(
  existing: MonthlyStats[],
  newUpdates: DatasetMonthlyUpdate[]
): MonthlyStats[] {
  const monthMap = new Map<string, { visits: number; downloads: number }>();

  // Charger l'existant
  for (const stat of existing) {
    monthMap.set(stat.month, {
      visits: stat.visits,
      downloads: stat.downloads,
    });
  }

  // Ajouter/fusionner les nouvelles données
  for (const update of newUpdates) {
    const current = monthMap.get(update.month) || { visits: 0, downloads: 0 };
    monthMap.set(update.month, {
      visits: current.visits + update.visits,
      downloads: current.downloads + update.downloads,
    });
  }

  // Retourner triés chronologiquement
  return Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({ month, ...stats }));
}

function updateGlobalStats(
  existing: GlobalStats,
  allUpdates: DatasetMonthlyUpdate[],
  totalDatasets: number
): GlobalStats {
  const mergedMonthly = mergeMonthlyData(existing.monthlyStats, allUpdates);

  const totalVisits = mergedMonthly.reduce((sum, m) => sum + m.visits, 0);
  const totalDownloads = mergedMonthly.reduce((sum, m) => sum + m.downloads, 0);

  return {
    totalVisits,
    totalDownloads,
    totalDatasets,
    startDate: existing.startDate,
    lastUpdate: new Date().toISOString(),
    monthlyStats: mergedMonthly,
  };
}

function loadDatasetStats(datasetId: string): DatasetStats | null {
  return readJsonFile<DatasetStats>(`datasets/${datasetId}.json`);
}

function updateDatasetStats(
  datasetId: string,
  newData: DatasetMonthlyUpdate[],
  metadata: DatagouvDataset
): DatasetStats {
  const existing = loadDatasetStats(datasetId);

  const monthlyMap = new Map<string, { visits: number; downloads: number }>();

  // Charger l'existant si disponible
  if (existing) {
    for (const stat of existing.monthlyStats) {
      monthlyMap.set(stat.month, {
        visits: stat.visits,
        downloads: stat.downloads,
      });
    }
  }

  // Ajouter les nouvelles données
  for (const update of newData.filter(u => u.datasetId === datasetId)) {
    const current = monthlyMap.get(update.month) || { visits: 0, downloads: 0 };
    monthlyMap.set(update.month, {
      visits: current.visits + update.visits,
      downloads: current.downloads + update.downloads,
    });
  }

  // Créer le tableau trié
  const monthlyStats: MonthlyStats[] = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({ month, ...stats }));

  const totalVisits = monthlyStats.reduce((sum, s) => sum + s.visits, 0);
  const totalDownloads = monthlyStats.reduce((sum, s) => sum + s.downloads, 0);

  return {
    id: datasetId,
    title: metadata.title,
    slug: metadata.slug,
    organization: metadata.organization?.name || 'Inconnu',
    organizationId: metadata.organization?.id || '',
    url: metadata.page || `https://www.data.gouv.fr/fr/datasets/${metadata.slug}/`,
    totalVisits,
    totalDownloads,
    monthlyStats,
    firstMonth: monthlyStats[0]?.month || '',
    lastMonth: monthlyStats[monthlyStats.length - 1]?.month || '',
  };
}

function recalculateTopDatasets(
  allDatasetStats: Map<string, DatasetStats>
): TopDatasetsData {
  const currentMonth = getCurrentMonth();
  const getMonthsAgo = (n: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() - n);
    return date.toISOString().slice(0, 7);
  };

  const lastMonth = getMonthsAgo(1);
  const lastYear = getMonthsAgo(12);

  const getStatsForPeriod = (
    stats: DatasetStats,
    startMonth: string,
    endMonth: string = currentMonth
  ): { visits: number; downloads: number } => {
    let visits = 0;
    let downloads = 0;
    for (const month of stats.monthlyStats) {
      if (month.month >= startMonth && month.month <= endMonth) {
        visits += month.visits;
        downloads += month.downloads;
      }
    }
    return { visits, downloads };
  };

  const createRanking = (
    stats: DatasetStats,
    value: number,
    previousValue: number,
    rank: number
  ): DatasetRanking => ({
    id: stats.id,
    title: stats.title,
    slug: stats.slug,
    organization: stats.organization,
    organizationId: stats.organizationId,
    value,
    previousValue,
    trend: previousValue > 0 ? ((value - previousValue) / previousValue) * 100 : 0,
    rank,
  });

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

    const datasetsWithStats = Array.from(allDatasetStats.values())
      .map(stats => {
        const current = getStatsForPeriod(stats, periodConfig.start);
        const previous = period !== 'allTime'
          ? getStatsForPeriod(stats, periodConfig.prevStart, periodConfig.prevEnd)
          : { visits: 0, downloads: 0 };

        return { stats, current, previous };
      });

    // Top par visites
    const byVisits = [...datasetsWithStats]
      .sort((a, b) => b.current.visits - a.current.visits)
      .slice(0, TOP_DATASETS_COUNT);

    result[period].visits = byVisits.map((d, i) =>
      createRanking(d.stats, d.current.visits, d.previous.visits, i + 1)
    );

    // Top par téléchargements
    const byDownloads = [...datasetsWithStats]
      .sort((a, b) => b.current.downloads - a.current.downloads)
      .slice(0, TOP_DATASETS_COUNT);

    result[period].downloads = byDownloads.map((d, i) =>
      createRanking(d.stats, d.current.downloads, d.previous.downloads, i + 1)
    );
  }

  return result;
}

function updateDatasetsIndex(
  existing: DatasetsIndex | null,
  newMetadata: Map<string, DatagouvDataset>
): DatasetsIndex {
  const datasetsMap = new Map<string, DatasetSummary>();

  // Charger l'existant
  if (existing) {
    for (const dataset of existing.datasets) {
      datasetsMap.set(dataset.id, dataset);
    }
  }

  // Ajouter les nouveaux
  for (const [id, metadata] of newMetadata) {
    datasetsMap.set(id, {
      id,
      title: metadata.title,
      slug: metadata.slug,
      organization: metadata.organization?.name || 'Inconnu',
      organizationId: metadata.organization?.id || '',
    });
  }

  const datasets = Array.from(datasetsMap.values())
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

  return {
    lastUpdate: new Date().toISOString(),
    datasets,
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
  };

  console.log('🚀 Synchronisation INCRÉMENTALE des stats data.gouv.fr');
  console.log(`   Mode: ${options.dryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
  console.log('');

  const startTime = Date.now();

  // 1. Charger les données existantes
  const { globalStats, datasetsIndex, existingDatasetIds } = loadExistingData();

  if (!globalStats) {
    console.error('❌ Aucune donnée existante trouvée. Utilisez "npm run sync-stats" pour une synchronisation complète.');
    process.exit(1);
  }

  // 2. Déterminer les mois à récupérer
  const lastMonth = globalStats.monthlyStats[globalStats.monthlyStats.length - 1]?.month;
  const currentMonth = getCurrentMonth();

  if (options.verbose) {
    console.log(`  Dernier mois en base: ${lastMonth}`);
    console.log(`  Mois actuel: ${currentMonth}`);
  }

  const monthsToFetch = getMonthsToFetch(lastMonth);

  if (monthsToFetch.length === 0) {
    console.log('✅ Aucune nouvelle donnée disponible. Les stats sont à jour !');
    console.log(`   Les données incluent déjà jusqu'à ${lastMonth}`);
    return;
  }

  console.log(`📅 Mois à récupérer: ${monthsToFetch.join(', ')}`);
  console.log('');

  // 3. Récupérer les nouvelles données mensuelles
  console.log('📈 Récupération des nouvelles données...');
  const allUpdates: DatasetMonthlyUpdate[] = [];
  const knownDatasetIds = new Set(existingDatasetIds);

  for (const month of monthsToFetch) {
    const updates = await fetchNewMonthData(month, knownDatasetIds);
    allUpdates.push(...updates);
  }

  console.log(`  ✓ ${formatNumber(allUpdates.length)} entrées récupérées pour ${monthsToFetch.length} mois`);
  console.log(`  ✓ ${formatNumber(knownDatasetIds.size)} datasets uniques (${formatNumber(knownDatasetIds.size - existingDatasetIds.size)} nouveaux)`);

  // 4. Récupérer les métadonnées des nouveaux datasets
  const existingDatasetsMap = new Map<string, DatasetSummary>();
  if (datasetsIndex) {
    for (const ds of datasetsIndex.datasets) {
      existingDatasetsMap.set(ds.id, ds);
    }
  }

  const newDatasetIds = new Set(
    Array.from(knownDatasetIds).filter(id => !existingDatasetIds.has(id))
  );

  const newMetadata = await fetchMissingMetadata(newDatasetIds, existingDatasetsMap);

  // 5. Mettre à jour les statistiques globales
  console.log('\n🧮 Mise à jour des statistiques globales...');
  const updatedGlobalStats = updateGlobalStats(globalStats, allUpdates, knownDatasetIds.size);

  console.log(`  Total visites: ${formatNumber(updatedGlobalStats.totalVisits)} (+${formatNumber(updatedGlobalStats.totalVisits - globalStats.totalVisits)})`);
  console.log(`  Total téléchargements: ${formatNumber(updatedGlobalStats.totalDownloads)} (+${formatNumber(updatedGlobalStats.totalDownloads - globalStats.totalDownloads)})`);
  console.log(`  Total datasets: ${formatNumber(updatedGlobalStats.totalDatasets)} (+${formatNumber(updatedGlobalStats.totalDatasets - globalStats.totalDatasets)})`);

  // 6. Mettre à jour l'index des datasets
  const updatedIndex = updateDatasetsIndex(datasetsIndex, newMetadata);

  // 7. Mettre à jour les fichiers individuels des datasets impactés
  console.log('\n📊 Mise à jour des fichiers individuels...');

  // Datasets à mettre à jour = tous ceux avec de nouvelles données
  const datasetsToUpdate = new Set(allUpdates.map(u => u.datasetId));

  // Mettre à jour les fichiers individuels (sans tout charger en mémoire)
  let processed = 0;
  for (const datasetId of datasetsToUpdate) {
    // Récupérer les métadonnées (existantes ou nouvelles)
    let metadata: DatagouvDataset | null = newMetadata.get(datasetId) || null;

    if (!metadata) {
      // Essayer de charger depuis le fichier existant
      const existing = loadDatasetStats(datasetId);
      if (existing) {
        // Recréer un objet metadata minimal depuis les stats existantes
        metadata = {
          id: existing.id,
          title: existing.title,
          slug: existing.slug,
          page: existing.url,
          organization: existing.organization ? {
            id: existing.organizationId,
            name: existing.organization,
          } as any : undefined,
        } as DatagouvDataset;
      } else {
        // Récupérer depuis l'API si pas dans le cache
        metadata = await fetchDatasetMetadata(datasetId);
        await sleep(RATE_LIMIT_DELAY);
      }
    }

    if (metadata) {
      const updatedStats = updateDatasetStats(datasetId, allUpdates, metadata);
      writeJsonFile(`datasets/${datasetId}.json`, updatedStats, options);
    }

    processed++;
    if (processed % 100 === 0 || processed === datasetsToUpdate.size) {
      console.log(`  ${formatNumber(processed)}/${formatNumber(datasetsToUpdate.size)} datasets mis à jour`);
    }
  }

  // 8. Recalculer les tops (charger uniquement les datasets nécessaires)
  console.log('\n🏆 Recalcul des top datasets...');

  // Charger uniquement les datasets qui existent dans les fichiers
  const allDatasetStatsMap = new Map<string, DatasetStats>();
  const datasetsDir = path.join(OUTPUT_DIR, 'datasets');

  if (fs.existsSync(datasetsDir)) {
    const files = fs.readdirSync(datasetsDir).filter(f => f.endsWith('.json'));
    console.log(`  Chargement de ${formatNumber(files.length)} datasets pour le calcul des tops...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const datasetId = file.replace('.json', '');
      const stats = loadDatasetStats(datasetId);
      if (stats) {
        allDatasetStatsMap.set(datasetId, stats);
      }

      // Afficher la progression tous les 1000 datasets
      if ((i + 1) % 1000 === 0 || i === files.length - 1) {
        console.log(`    ${formatNumber(i + 1)}/${formatNumber(files.length)} chargés`);
      }
    }
  }

  const updatedTopDatasets = recalculateTopDatasets(allDatasetStatsMap);

  // 9. Écrire les fichiers
  console.log('\n💾 Écriture des fichiers JSON...');

  writeJsonFile('global-stats.json', updatedGlobalStats, options);
  writeJsonFile('top-datasets.json', updatedTopDatasets, options);
  writeJsonFile('datasets-index.json', updatedIndex, options);

  // Écrire les fichiers individuels des datasets mis à jour
  for (const [datasetId, stats] of allDatasetStatsMap) {
    writeJsonFile(`datasets/${datasetId}.json`, stats, options);
  }

  console.log(`  ✓ ${allDatasetStatsMap.size} fichiers de datasets mis à jour`);

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Synchronisation incrémentale terminée en ${duration} minutes`);

  if (options.dryRun) {
    console.log('\n⚠️ Mode DRY-RUN: aucun fichier n\'a été écrit');
  }
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
