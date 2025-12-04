#!/usr/bin/env python3 -u
"""
Script de traitement des dumps TSV de statistiques data.gouv.fr

Lit les fichiers TSV en streaming (visits_datasets.tsv et visits_resources.tsv),
agrège les données par dataset_id et par mois, et génère les fichiers JSON statiques.

Usage:
    python scripts/process-dump.py [--dry-run] [--verbose] [--test]

Options:
    --dry-run    Ne pas écrire les fichiers JSON
    --verbose    Afficher plus de détails
    --test       Mode test : limiter à 100 datasets
"""

import csv
import json
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, Set, Tuple, Optional
import time

# ============================================
# Configuration
# ============================================

DATASETS_TSV = Path.home() / "Downloads" / "visits_datasets.tsv"
RESOURCES_TSV = Path.home() / "Downloads" / "visits_resources.tsv"
OUTPUT_DIR = Path.cwd() / "public" / "data"
DATAGOUV_API_BASE = "https://www.data.gouv.fr/api/1"
TOP_DATASETS_COUNT = 100
RATE_LIMIT_DELAY = 0.1  # secondes entre requêtes API

# ============================================
# Utilitaires
# ============================================

def format_number(n: int) -> str:
    """Format un nombre avec séparateurs de milliers"""
    return f"{n:,}".replace(",", " ")

def get_current_month() -> str:
    """Retourne le mois actuel au format YYYY-MM"""
    return datetime.now().strftime("%Y-%m")

def get_months_ago(months: int) -> str:
    """Retourne le mois il y a N mois au format YYYY-MM"""
    date = datetime.now()
    # Calculer le mois précédent
    month = date.month - months
    year = date.year
    while month <= 0:
        month += 12
        year -= 1
    return f"{year:04d}-{month:02d}"

def parse_date_metric(date_str: str) -> str:
    """
    Parse date_metric et retourne YYYY-MM
    Format attendu: peut être YYYY-MM-DD ou YYYY-MM
    """
    if not date_str:
        return ""
    # Si c'est déjà au format YYYY-MM
    if len(date_str) == 7 and date_str[4] == '-':
        return date_str
    # Si c'est au format YYYY-MM-DD
    if len(date_str) >= 7:
        return date_str[:7]
    return ""

# ============================================
# Lecture en streaming des fichiers TSV
# ============================================

def read_datasets_tsv_streaming(file_path: Path, verbose: bool = False) -> Dict[str, Dict[str, int]]:
    """
    Lit visits_datasets.tsv en streaming et agrège par dataset_id et mois

    Format TSV (sans header):
    Col 0: __id
    Col 1: date_metric (YYYY-MM-DD)
    Col 2: dataset_id
    Col 3: organization_id
    Col 4: nb_visit

    Returns:
        Dict[dataset_id, Dict[month, nb_visit]]
    """
    print(f"📊 Lecture de {file_path.name}...")
    start_time = time.time()

    stats = defaultdict(lambda: defaultdict(int))
    line_count = 0
    error_count = 0

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Pas de header, on lit ligne par ligne
            reader = csv.reader(f, delimiter='\t')

            for row in reader:
                line_count += 1

                try:
                    if len(row) < 5:
                        error_count += 1
                        continue

                    date_metric = row[1].strip()
                    dataset_id = row[2].strip()
                    nb_visit = int(row[4])

                    if not dataset_id or not date_metric:
                        continue

                    month = parse_date_metric(date_metric)
                    if not month:
                        continue

                    stats[dataset_id][month] += nb_visit

                except (ValueError, IndexError) as e:
                    error_count += 1
                    if verbose and error_count <= 10:
                        print(f"  ⚠️ Erreur ligne {line_count}: {e}")

                if line_count % 1_000_000 == 0:
                    elapsed = time.time() - start_time
                    print(f"  {format_number(line_count)} lignes traitées ({elapsed:.1f}s)")

    except FileNotFoundError:
        print(f"❌ Fichier non trouvé: {file_path}")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"  ✓ {format_number(line_count)} lignes lues en {elapsed:.1f}s")
    print(f"  ✓ {format_number(len(stats))} datasets uniques")
    if error_count > 0:
        print(f"  ⚠️ {format_number(error_count)} erreurs ignorées")

    return dict(stats)

def read_resources_tsv_streaming(file_path: Path, verbose: bool = False) -> Dict[str, Dict[str, int]]:
    """
    Lit visits_resources.tsv en streaming et agrège par dataset_id (pas resource_id!) et mois

    Format TSV (sans header):
    Col 0: __id
    Col 1: date_metric (YYYY-MM-DD)
    Col 2: resource_id
    Col 3: dataset_id
    Col 4: organization_id
    Col 5: nb_visit

    Returns:
        Dict[dataset_id, Dict[month, nb_visit]] (nb_visit = téléchargements)
    """
    print(f"📊 Lecture de {file_path.name}...")
    start_time = time.time()

    stats = defaultdict(lambda: defaultdict(int))
    line_count = 0
    error_count = 0

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Pas de header, on lit ligne par ligne
            reader = csv.reader(f, delimiter='\t')

            for row in reader:
                line_count += 1

                try:
                    if len(row) < 6:
                        error_count += 1
                        continue

                    date_metric = row[1].strip()
                    # resource_id = row[2] (on ne l'utilise pas)
                    dataset_id = row[3].strip()
                    nb_visit = int(row[5])

                    if not dataset_id or not date_metric:
                        continue

                    month = parse_date_metric(date_metric)
                    if not month:
                        continue

                    # Agrégation par dataset_id (pas resource_id)
                    stats[dataset_id][month] += nb_visit

                except (ValueError, IndexError) as e:
                    error_count += 1
                    if verbose and error_count <= 10:
                        print(f"  ⚠️ Erreur ligne {line_count}: {e}")

                if line_count % 1_000_000 == 0:
                    elapsed = time.time() - start_time
                    print(f"  {format_number(line_count)} lignes traitées ({elapsed:.1f}s)")

    except FileNotFoundError:
        print(f"❌ Fichier non trouvé: {file_path}")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"  ✓ {format_number(line_count)} lignes lues en {elapsed:.1f}s")
    print(f"  ✓ {format_number(len(stats))} datasets uniques")
    if error_count > 0:
        print(f"  ⚠️ {format_number(error_count)} erreurs ignorées")

    return dict(stats)

# ============================================
# Calcul des agrégats
# ============================================

def merge_stats(visits: Dict[str, Dict[str, int]],
                downloads: Dict[str, Dict[str, int]]) -> Dict[str, Dict[str, Tuple[int, int]]]:
    """
    Merge les stats de visites et téléchargements

    Returns:
        Dict[dataset_id, Dict[month, (visits, downloads)]]
    """
    all_datasets = set(visits.keys()) | set(downloads.keys())
    merged = {}

    for dataset_id in all_datasets:
        dataset_visits = visits.get(dataset_id, {})
        dataset_downloads = downloads.get(dataset_id, {})
        all_months = set(dataset_visits.keys()) | set(dataset_downloads.keys())

        merged[dataset_id] = {
            month: (
                dataset_visits.get(month, 0),
                dataset_downloads.get(month, 0)
            )
            for month in all_months
        }

    return merged

def calculate_global_stats(merged_stats: Dict[str, Dict[str, Tuple[int, int]]]) -> dict:
    """Calcule les statistiques globales"""
    monthly_aggregates = defaultdict(lambda: [0, 0])  # [visits, downloads]

    for dataset_stats in merged_stats.values():
        for month, (visits, downloads) in dataset_stats.items():
            monthly_aggregates[month][0] += visits
            monthly_aggregates[month][1] += downloads

    # Trier chronologiquement
    sorted_months = sorted(monthly_aggregates.items())

    monthly_stats = [
        {
            "month": month,
            "visits": visits,
            "downloads": downloads
        }
        for month, (visits, downloads) in sorted_months
    ]

    total_visits = sum(v for v, _ in monthly_aggregates.values())
    total_downloads = sum(d for _, d in monthly_aggregates.values())

    return {
        "totalVisits": total_visits,
        "totalDownloads": total_downloads,
        "totalDatasets": len(merged_stats),
        "startDate": sorted_months[0][0] if sorted_months else "2022-07",
        "lastUpdate": datetime.now().isoformat(),
        "monthlyStats": monthly_stats
    }

def get_period_stats(merged_stats: Dict[str, Dict[str, Tuple[int, int]]],
                     start_month: str,
                     end_month: Optional[str] = None) -> Dict[str, Tuple[int, int]]:
    """
    Calcule les stats pour une période donnée

    Returns:
        Dict[dataset_id, (total_visits, total_downloads)]
    """
    if end_month is None:
        end_month = get_current_month()

    period_stats = {}

    for dataset_id, monthly_data in merged_stats.items():
        total_visits = 0
        total_downloads = 0

        for month, (visits, downloads) in monthly_data.items():
            if start_month <= month <= end_month:
                total_visits += visits
                total_downloads += downloads

        if total_visits > 0 or total_downloads > 0:
            period_stats[dataset_id] = (total_visits, total_downloads)

    return period_stats

def fetch_dataset_metadata(dataset_id: str) -> Optional[dict]:
    """Récupère les métadonnées d'un dataset depuis l'API data.gouv.fr"""
    try:
        import urllib.request
        import urllib.error

        url = f"{DATAGOUV_API_BASE}/datasets/{dataset_id}/"

        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {
                "id": data.get("id", ""),
                "title": data.get("title", "Inconnu"),
                "slug": data.get("slug", ""),
                "organization": data.get("organization", {}).get("name", "Inconnu") if data.get("organization") else "Inconnu",
                "organizationId": data.get("organization", {}).get("id", "") if data.get("organization") else "",
                "url": data.get("page", f"https://www.data.gouv.fr/fr/datasets/{data.get('slug', dataset_id)}/")
            }
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, KeyError):
        return None

def create_dataset_ranking(dataset_id: str,
                          metadata: dict,
                          value: int,
                          previous_value: int,
                          rank: int) -> dict:
    """Crée un objet DatasetRanking"""
    trend = ((value - previous_value) / previous_value * 100) if previous_value > 0 else 0

    return {
        "id": dataset_id,
        "title": metadata.get("title", "Inconnu"),
        "slug": metadata.get("slug", ""),
        "organization": metadata.get("organization", "Inconnu"),
        "organizationId": metadata.get("organizationId", ""),
        "value": value,
        "previousValue": previous_value,
        "trend": trend,
        "rank": rank
    }

def calculate_top_datasets(merged_stats: Dict[str, Dict[str, Tuple[int, int]]],
                          verbose: bool = False) -> Tuple[dict, Set[str]]:
    """
    Calcule les top datasets pour chaque période

    Returns:
        (top_datasets_data, set_of_top_dataset_ids)
    """
    print("\n🧮 Calcul des tops datasets par période...")

    current_month = get_current_month()

    # Définition des périodes (comme dans sync-stats.ts)
    periods = {
        "week": {
            "start": current_month,
            "end": current_month,
            "prev_start": get_months_ago(1),
            "prev_end": get_months_ago(1)
        },
        "month": {
            "start": get_months_ago(1),
            "end": get_months_ago(1),
            "prev_start": get_months_ago(2),
            "prev_end": get_months_ago(2)
        },
        "year": {
            "start": get_months_ago(12),
            "end": current_month,
            "prev_start": get_months_ago(24),
            "prev_end": get_months_ago(13)
        },
        "allTime": {
            "start": "2022-07",
            "end": current_month,
            "prev_start": "2022-07",
            "prev_end": "2022-07"
        }
    }

    result = {
        "lastUpdate": datetime.now().isoformat(),
        "week": {"visits": [], "downloads": []},
        "month": {"visits": [], "downloads": []},
        "year": {"visits": [], "downloads": []},
        "allTime": {"visits": [], "downloads": []}
    }

    top_dataset_ids = set()

    for period_name, period_config in periods.items():
        if verbose:
            print(f"  Calcul top {period_name}...")

        # Stats période actuelle
        current_stats = get_period_stats(
            merged_stats,
            period_config["start"],
            period_config["end"]
        )

        # Stats période précédente (pour calcul de tendance)
        previous_stats = get_period_stats(
            merged_stats,
            period_config["prev_start"],
            period_config["prev_end"]
        ) if period_name != "allTime" else {}

        # Top par visites
        sorted_by_visits = sorted(
            current_stats.items(),
            key=lambda x: x[1][0],  # trier par visits
            reverse=True
        )[:TOP_DATASETS_COUNT]

        # Top par téléchargements
        sorted_by_downloads = sorted(
            current_stats.items(),
            key=lambda x: x[1][1],  # trier par downloads
            reverse=True
        )[:TOP_DATASETS_COUNT]

        # Ajouter les IDs aux datasets à traiter
        for dataset_id, _ in sorted_by_visits:
            top_dataset_ids.add(dataset_id)
        for dataset_id, _ in sorted_by_downloads:
            top_dataset_ids.add(dataset_id)

        # Stocker temporairement (on va remplir les métadonnées plus tard)
        result[period_name]["visits_data"] = [
            (dataset_id, visits, previous_stats.get(dataset_id, (0, 0))[0])
            for dataset_id, (visits, downloads) in sorted_by_visits
        ]

        result[period_name]["downloads_data"] = [
            (dataset_id, downloads, previous_stats.get(dataset_id, (0, 0))[1])
            for dataset_id, (visits, downloads) in sorted_by_downloads
        ]

    print(f"  ✓ {len(top_dataset_ids)} datasets uniques dans les tops")

    return result, top_dataset_ids

# ============================================
# Récupération des métadonnées
# ============================================

def fetch_metadata_for_datasets(dataset_ids: Set[str], verbose: bool = False) -> Dict[str, dict]:
    """Récupère les métadonnées pour une liste de datasets"""
    print(f"\n📝 Récupération des métadonnées pour {len(dataset_ids)} datasets...")

    metadata_map = {}
    processed = 0
    errors = 0

    for dataset_id in dataset_ids:
        metadata = fetch_dataset_metadata(dataset_id)

        if metadata:
            metadata_map[dataset_id] = metadata
        else:
            errors += 1
            # Métadonnées par défaut si l'API échoue
            metadata_map[dataset_id] = {
                "id": dataset_id,
                "title": f"Dataset {dataset_id}",
                "slug": dataset_id,
                "organization": "Inconnu",
                "organizationId": "",
                "url": f"https://www.data.gouv.fr/fr/datasets/{dataset_id}/"
            }

        processed += 1
        if processed % 10 == 0 or processed == len(dataset_ids):
            print(f"  {processed}/{len(dataset_ids)} métadonnées récupérées")

        time.sleep(RATE_LIMIT_DELAY)

    if errors > 0:
        print(f"  ⚠️ {errors} datasets sans métadonnées (utilisation valeurs par défaut)")

    return metadata_map

def finalize_top_datasets(top_data: dict, metadata_map: Dict[str, dict]) -> dict:
    """Finalise les données de top datasets avec les métadonnées"""
    result = {
        "lastUpdate": top_data["lastUpdate"],
        "week": {"visits": [], "downloads": []},
        "month": {"visits": [], "downloads": []},
        "year": {"visits": [], "downloads": []},
        "allTime": {"visits": [], "downloads": []}
    }

    for period in ["week", "month", "year", "allTime"]:
        # Top visites
        for rank, (dataset_id, value, prev_value) in enumerate(top_data[period]["visits_data"], 1):
            metadata = metadata_map.get(dataset_id, {
                "id": dataset_id,
                "title": f"Dataset {dataset_id}",
                "slug": dataset_id,
                "organization": "Inconnu",
                "organizationId": ""
            })
            result[period]["visits"].append(
                create_dataset_ranking(dataset_id, metadata, value, prev_value, rank)
            )

        # Top téléchargements
        for rank, (dataset_id, value, prev_value) in enumerate(top_data[period]["downloads_data"], 1):
            metadata = metadata_map.get(dataset_id, {
                "id": dataset_id,
                "title": f"Dataset {dataset_id}",
                "slug": dataset_id,
                "organization": "Inconnu",
                "organizationId": ""
            })
            result[period]["downloads"].append(
                create_dataset_ranking(dataset_id, metadata, value, prev_value, rank)
            )

    return result

# ============================================
# Génération des fichiers JSON
# ============================================

def create_datasets_index(metadata_map: Dict[str, dict]) -> dict:
    """Crée l'index de recherche des datasets"""
    datasets = [
        {
            "id": dataset_id,
            "title": metadata.get("title", "Inconnu"),
            "slug": metadata.get("slug", ""),
            "organization": metadata.get("organization", "Inconnu"),
            "organizationId": metadata.get("organizationId", "")
        }
        for dataset_id, metadata in metadata_map.items()
    ]

    # Trier par titre
    datasets.sort(key=lambda d: d["title"].lower())

    return {
        "lastUpdate": datetime.now().isoformat(),
        "datasets": datasets
    }

def create_dataset_stats(dataset_id: str,
                        monthly_data: Dict[str, Tuple[int, int]],
                        metadata: dict) -> dict:
    """Crée les stats détaillées d'un dataset"""
    sorted_months = sorted(monthly_data.items())

    monthly_stats = [
        {
            "month": month,
            "visits": visits,
            "downloads": downloads
        }
        for month, (visits, downloads) in sorted_months
    ]

    total_visits = sum(v for v, _ in monthly_data.values())
    total_downloads = sum(d for _, d in monthly_data.values())

    return {
        "id": dataset_id,
        "title": metadata.get("title", "Inconnu"),
        "slug": metadata.get("slug", ""),
        "organization": metadata.get("organization", "Inconnu"),
        "organizationId": metadata.get("organizationId", ""),
        "url": metadata.get("url", f"https://www.data.gouv.fr/fr/datasets/{dataset_id}/"),
        "totalVisits": total_visits,
        "totalDownloads": total_downloads,
        "monthlyStats": monthly_stats,
        "firstMonth": sorted_months[0][0] if sorted_months else "",
        "lastMonth": sorted_months[-1][0] if sorted_months else ""
    }

def write_json_file(file_path: Path, data: dict, dry_run: bool = False):
    """Écrit un fichier JSON"""
    if dry_run:
        print(f"  [DRY-RUN] Écriture: {file_path.relative_to(OUTPUT_DIR)}")
        return

    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ============================================
# Main
# ============================================

def main():
    """Fonction principale"""
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    verbose = '--verbose' in args or '-v' in args
    test_mode = '--test' in args

    print("🚀 Traitement des dumps TSV de statistiques data.gouv.fr")
    print(f"   Mode: {'DRY-RUN' if dry_run else 'PRODUCTION'}")
    if test_mode:
        print("   ⚠️ Mode test: limité à 100 datasets")
    print("")

    start_time = time.time()

    # 1. Lire les fichiers TSV
    visits = read_datasets_tsv_streaming(DATASETS_TSV, verbose)
    downloads = read_resources_tsv_streaming(RESOURCES_TSV, verbose)

    # 2. Merger les stats
    print("\n🔀 Fusion des statistiques...")
    merged_stats = merge_stats(visits, downloads)
    print(f"  ✓ {format_number(len(merged_stats))} datasets au total")

    # Mode test : limiter le nombre de datasets
    if test_mode:
        print(f"\n⚠️ Mode test activé : limitation à 100 datasets")
        # Prendre les 100 premiers datasets avec le plus de visites
        top_100 = sorted(
            merged_stats.items(),
            key=lambda x: sum(v for v, _ in x[1].values()),
            reverse=True
        )[:100]
        merged_stats = dict(top_100)
        print(f"  ✓ Traitement de {len(merged_stats)} datasets")

    # 3. Calculer les statistiques globales
    print("\n🧮 Calcul des statistiques globales...")
    global_stats = calculate_global_stats(merged_stats)
    print(f"  Total visites: {format_number(global_stats['totalVisits'])}")
    print(f"  Total téléchargements: {format_number(global_stats['totalDownloads'])}")
    print(f"  Période: {global_stats['startDate']} → {global_stats['monthlyStats'][-1]['month']}")

    # 4. Calculer les tops datasets
    top_data, top_dataset_ids = calculate_top_datasets(merged_stats, verbose)

    # 5. Récupérer les métadonnées
    metadata_map = fetch_metadata_for_datasets(top_dataset_ids, verbose)

    # 6. Finaliser les tops avec métadonnées
    print("\n📊 Finalisation des tops datasets...")
    top_datasets = finalize_top_datasets(top_data, metadata_map)

    # 7. Créer l'index de recherche
    print("\n📇 Création de l'index de recherche...")
    datasets_index = create_datasets_index(metadata_map)

    # 8. Écrire les fichiers principaux
    print("\n💾 Écriture des fichiers JSON...")
    write_json_file(OUTPUT_DIR / "global-stats.json", global_stats, dry_run)
    write_json_file(OUTPUT_DIR / "top-datasets.json", top_datasets, dry_run)
    write_json_file(OUTPUT_DIR / "datasets-index.json", datasets_index, dry_run)

    # 9. Écrire les fichiers de détails pour les top datasets
    print(f"\n📁 Génération de {len(top_dataset_ids)} fichiers de détails...")
    datasets_dir = OUTPUT_DIR / "datasets"

    for i, dataset_id in enumerate(top_dataset_ids, 1):
        if dataset_id in merged_stats and dataset_id in metadata_map:
            dataset_stats = create_dataset_stats(
                dataset_id,
                merged_stats[dataset_id],
                metadata_map[dataset_id]
            )
            write_json_file(datasets_dir / f"{dataset_id}.json", dataset_stats, dry_run)

        if i % 10 == 0 or i == len(top_dataset_ids):
            print(f"  {i}/{len(top_dataset_ids)} fichiers générés")

    # Résumé final
    duration = (time.time() - start_time) / 60
    print(f"\n✅ Traitement terminé en {duration:.1f} minutes")

    if dry_run:
        print("\n⚠️ Mode DRY-RUN: aucun fichier n'a été écrit")
    else:
        print(f"\n📂 Fichiers générés dans {OUTPUT_DIR}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ Interruption par l'utilisateur")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Erreur fatale: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
