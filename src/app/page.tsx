'use client'

import { useEffect, useState } from 'react'
import DatasetDetail from '@/components/DatasetDetail'
import DatasetChart from '@/components/DatasetChart'

interface GlobalStats {
  totalVisits: number
  totalDownloads: number
  totalDatasets: number
  startDate: string
  lastUpdate: string
}

interface Dataset {
  id: string
  title: string
  slug: string
  organization: string
  organizationId: string
  value: number
  previousValue: number
  trend: number
  rank: number
}

interface TopDatasets {
  lastUpdate: string
  week?: { visits?: Dataset[]; downloads?: Dataset[] }
  month?: { visits?: Dataset[]; downloads?: Dataset[] }
  year?: { visits?: Dataset[]; downloads?: Dataset[] }
}

interface DatasetIndex {
  id: string
  title: string
  slug: string
  organization: string
  organizationId: string
}

type Period = 'week' | 'month' | 'year'
type Metric = 'visits' | 'downloads'

export default function Home() {
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null)
  const [topDatasets, setTopDatasets] = useState<TopDatasets | null>(null)
  const [datasetsIndex, setDatasetsIndex] = useState<DatasetIndex[]>([])

  // Filtres pour la section Top Datasets
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('week')
  const [selectedMetric, setSelectedMetric] = useState<Metric>('visits')

  // Recherche
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredDatasets, setFilteredDatasets] = useState<DatasetIndex[]>([])
  const [isSearchingAPI, setIsSearchingAPI] = useState(false)

  // Dataset sélectionné pour affichage détail
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)

  // Dataset sélectionné dans le tableau Top Datasets (pour l'accordéon)
  const [expandedTopDatasetId, setExpandedTopDatasetId] = useState<string | null>(null)

  useEffect(() => {
    // Charger les stats globales
    fetch('/data/global-stats.json')
      .then(res => res.json())
      .then(data => setGlobalStats(data))
      .catch(err => console.error('Erreur chargement global-stats:', err))

    // Charger les top datasets
    fetch('/data/top-datasets.json')
      .then(res => res.json())
      .then(data => setTopDatasets(data))
      .catch(err => console.error('Erreur chargement top-datasets:', err))

    // Charger l'index des datasets
    fetch('/data/datasets-index.json')
      .then(res => res.json())
      .then(data => setDatasetsIndex(data.datasets || []))
      .catch(err => console.error('Erreur chargement datasets-index:', err))
  }, [])

  // Filtrer les datasets pour l'autocomplétion avec API systématique
  useEffect(() => {
    if (searchQuery.length < 2) {
      setFilteredDatasets([])
      setIsSearchingAPI(false)
      return
    }

    const query = searchQuery.toLowerCase()

    // 1. Chercher localement
    const localResults = datasetsIndex
      .filter(dataset =>
        dataset.title.toLowerCase().includes(query) ||
        dataset.organization.toLowerCase().includes(query)
      )

    // 2. Rechercher via les APIs en parallèle
    setIsSearchingAPI(true)

    Promise.all([
      // Recherche datasets
      fetch(`https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(searchQuery)}&page_size=20`)
        .then(res => res.json())
        .catch(() => ({ data: [] })),
      // Recherche organisations
      fetch(`https://www.data.gouv.fr/api/1/organizations/?q=${encodeURIComponent(searchQuery)}&page_size=5`)
        .then(res => res.json())
        .catch(() => ({ data: [] }))
    ])
      .then(([datasetsResponse, orgsResponse]) => {
        // Résultats datasets
        const apiDatasets: DatasetIndex[] = (datasetsResponse.data || []).map((dataset: any) => ({
          id: dataset.id,
          title: dataset.title,
          slug: dataset.slug,
          organization: dataset.organization?.name || 'Organisation inconnue',
          organizationId: dataset.organization?.id || ''
        }))

        // Résultats organisations -> récupérer leurs datasets
        const orgPromises = (orgsResponse.data || []).map((org: any) =>
          fetch(`https://www.data.gouv.fr/api/1/organizations/${org.id}/datasets/?page_size=20`)
            .then(res => res.json())
            .then(data => (data.data || []).map((dataset: any) => ({
              id: dataset.id,
              title: dataset.title,
              slug: dataset.slug,
              organization: org.name,
              organizationId: org.id
            })))
            .catch(() => [])
        )

        Promise.all(orgPromises).then(orgDatasets => {
          const allOrgDatasets = orgDatasets.flat()

          // Fusionner tous les résultats en évitant les doublons
          const seenIds = new Set<string>()
          const allResults: DatasetIndex[] = []

          // Prioriser : local > datasets API > org datasets
          for (const dataset of [...localResults, ...apiDatasets, ...allOrgDatasets]) {
            if (!seenIds.has(dataset.id)) {
              seenIds.add(dataset.id)
              allResults.push(dataset)
            }
          }

          setFilteredDatasets(allResults.slice(0, 20))
          setIsSearchingAPI(false)
        })
      })
      .catch(err => {
        console.error('Erreur recherche API:', err)
        // En cas d'erreur, afficher au moins les résultats locaux
        setFilteredDatasets(localResults.slice(0, 10))
        setIsSearchingAPI(false)
      })
  }, [searchQuery, datasetsIndex])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num)
  }

  const getCurrentTopDatasets = (): Dataset[] => {
    if (!topDatasets) return []
    const periodData = topDatasets[selectedPeriod]
    if (!periodData) return []
    return periodData[selectedMetric] || []
  }

  // Si un dataset est sélectionné, afficher le détail
  if (selectedDatasetId) {
    return (
      <DatasetDetail
        datasetId={selectedDatasetId}
        onClose={() => setSelectedDatasetId(null)}
      />
    )
  }

  return (
    <div className="fr-container fr-py-6w">
      {/* Section 1 : Stats globales */}
      <section className="fr-mb-6w">
        <h1 className="fr-h1">Statistiques data.gouv.fr</h1>
        {globalStats ? (
          <div className="fr-grid-row fr-grid-row--gutters">
            <div className="fr-col-12 fr-col-md-4">
              <div className="fr-callout">
                <h3 className="fr-callout__title">
                  <span className="fr-icon-eye-line" aria-hidden="true"></span>
                  {' '}Visites
                </h3>
                <p className="fr-callout__text" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {formatNumber(globalStats.totalVisits)}
                </p>
                <p className="fr-text--sm">
                  Depuis {new Date(globalStats.startDate + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="fr-col-12 fr-col-md-4">
              <div className="fr-callout">
                <h3 className="fr-callout__title">
                  <span className="fr-icon-download-line" aria-hidden="true"></span>
                  {' '}Téléchargements
                </h3>
                <p className="fr-callout__text" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {formatNumber(globalStats.totalDownloads)}
                </p>
                <p className="fr-text--sm">
                  Depuis {new Date(globalStats.startDate + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="fr-col-12 fr-col-md-4">
              <div className="fr-callout">
                <h3 className="fr-callout__title">
                  <span className="fr-icon-database-line" aria-hidden="true"></span>
                  {' '}Datasets suivis
                </h3>
                <p className="fr-callout__text" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {formatNumber(globalStats.totalDatasets)}
                </p>
                <p className="fr-text--sm">
                  Au total sur la plateforme
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p>Chargement des statistiques...</p>
        )}
      </section>

      {/* Section 2 : Recherche dataset */}
      <section className="fr-mb-6w">
        <h2 className="fr-h2">Rechercher un dataset</h2>

        <div className="fr-search-bar" role="search">
          <label className="fr-label" htmlFor="search-dataset">
            Recherche par nom ou organisation
          </label>
          <input
            className="fr-input"
            placeholder="Cherchez un producteur ou un jeu de données"
            type="search"
            id="search-dataset"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isSearchingAPI && (
          <div className="fr-mt-4w">
            <p>
              <span className="fr-icon-refresh-line fr-icon--sm" aria-hidden="true"></span>
              {' '}Recherche via l&apos;API data.gouv.fr...
            </p>
          </div>
        )}

        {filteredDatasets.length > 0 && !isSearchingAPI && (
          <div className="fr-mt-4w">
            <h3 className="fr-h6">
              {filteredDatasets.length} résultat{filteredDatasets.length > 1 ? 's' : ''}
            </h3>
            <ul className="fr-raw-list">
              {filteredDatasets.map((dataset) => (
                <li key={dataset.id} className="fr-mb-2w">
                  <div
                    className="fr-card fr-card--horizontal fr-enlarge-link"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedDatasetId(dataset.id)}
                  >
                    <div className="fr-card__body">
                      <div className="fr-card__content">
                        <h4 className="fr-card__title">
                          <span className="fr-link">
                            {dataset.title}
                          </span>
                        </h4>
                        <p className="fr-card__desc">{dataset.organization}</p>
                        <p className="fr-card__detail">
                          <span className="fr-icon-bar-chart-box-line fr-icon--sm" aria-hidden="true"></span>
                          {' '}Voir les statistiques détaillées
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {searchQuery.length >= 2 && filteredDatasets.length === 0 && !isSearchingAPI && (
          <p className="fr-mt-4w">Aucun résultat trouvé</p>
        )}
      </section>

      {/* Section 3 : Top datasets avec filtres */}
      <section className="fr-mb-6w">
        <h2 className="fr-h2">Top Datasets</h2>

        <div className="fr-grid-row fr-grid-row--gutters fr-mb-4w">
          <div className="fr-col-12 fr-col-md-6">
            <div className="fr-select-group">
              <label className="fr-label" htmlFor="period-select">
                Période
              </label>
              <select
                className="fr-select"
                id="period-select"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value as Period)}
              >
                <option value="week">Semaine</option>
                <option value="month">Mois</option>
                <option value="year">Année</option>
              </select>
            </div>
          </div>
          <div className="fr-col-12 fr-col-md-6">
            <div className="fr-select-group">
              <label className="fr-label" htmlFor="metric-select">
                Métrique
              </label>
              <select
                className="fr-select"
                id="metric-select"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as Metric)}
              >
                <option value="visits">Visites</option>
                <option value="downloads">Téléchargements</option>
              </select>
            </div>
          </div>
        </div>

        {getCurrentTopDatasets().length > 0 ? (
          <div className="fr-table">
            <table>
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Dataset</th>
                  <th>Organisation</th>
                  <th className="fr-text--right">Valeur</th>
                  <th className="fr-text--right">Évolution</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {getCurrentTopDatasets().slice(0, 20).map((dataset) => (
                  <>
                    <tr
                      key={dataset.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedTopDatasetId(expandedTopDatasetId === dataset.id ? null : dataset.id)}
                      className={expandedTopDatasetId === dataset.id ? 'fr-background-alt--blue-france' : ''}
                    >
                      <td>{dataset.rank}</td>
                      <td>
                        <strong>{dataset.title}</strong>
                      </td>
                      <td>{dataset.organization}</td>
                      <td className="fr-text--right">{formatNumber(dataset.value)}</td>
                      <td className="fr-text--right">
                        <span
                          className={
                            dataset.trend > 0
                              ? 'fr-text--success'
                              : dataset.trend < 0
                              ? 'fr-text--error'
                              : ''
                          }
                        >
                          {dataset.trend > 0 ? '+' : ''}
                          {dataset.trend.toFixed(1)}%
                        </span>
                      </td>
                      <td className="fr-text--right">
                        <span
                          className={expandedTopDatasetId === dataset.id ? 'fr-icon-arrow-up-s-line' : 'fr-icon-arrow-down-s-line'}
                          aria-hidden="true"
                        ></span>
                      </td>
                    </tr>
                    {expandedTopDatasetId === dataset.id && (
                      <tr key={`${dataset.id}-chart`}>
                        <td colSpan={6} style={{ backgroundColor: 'var(--background-alt-blue-france)' }}>
                          <div className="fr-p-4w">
                            <h3 className="fr-h6 fr-mb-3w">Évolution mensuelle (12 derniers mois)</h3>
                            <div className="fr-mb-3w">
                              <p>
                                <a
                                  href="#"
                                  className="fr-link fr-icon-search-line fr-link--icon-left"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setSelectedDatasetId(dataset.id)
                                  }}
                                >
                                  Voir le détail
                                </a>
                                {' · '}
                                <a
                                  href={`https://www.data.gouv.fr/fr/datasets/${dataset.slug}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="fr-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Voir sur data.gouv.fr
                                </a>
                              </p>
                            </div>
                            <DatasetChart datasetId={dataset.id} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Aucune donnée disponible pour cette période/métrique</p>
        )}
      </section>
    </div>
  )
}
