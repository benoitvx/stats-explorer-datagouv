'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

// Déclarer le web component pour TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'line-chart': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        x?: string
        y?: string
        name?: string
        'selected-palette'?: string
        'unit-tooltip'?: string
      }, HTMLElement>
    }
  }
}

interface MonthlyStats {
  month: string
  visits: number
  downloads: number
}

interface DatasetDetails {
  id: string
  title: string
  slug: string
  organization: string
  organizationId: string
  url: string
  totalVisits: number
  totalDownloads: number
  monthlyStats: MonthlyStats[]
}

// Types pour l'API Metric
interface MetricApiEntry {
  dataset_id: string
  metric_month: string
  monthly_visit: number
  monthly_download_resource: number | null
}

interface MetricApiResponse {
  data: MetricApiEntry[]
  links: { next: string | null }
  meta: { page: number; page_size: number; total: number }
}

interface Props {
  datasetId: string
  onClose: () => void
}

// Fonction pour récupérer les stats via l'API Metric avec pagination
async function fetchMetricStats(datasetId: string): Promise<MetricApiEntry[]> {
  const allData: MetricApiEntry[] = []
  let page = 1
  const pageSize = 50

  while (true) {
    const response = await fetch(
      `https://metric-api.data.gouv.fr/api/datasets/data/?dataset_id__exact=${datasetId}&page=${page}&page_size=${pageSize}`
    )
    if (!response.ok) {
      throw new Error('Erreur API Metric')
    }
    const data: MetricApiResponse = await response.json()
    allData.push(...data.data)

    if (!data.links.next || data.data.length < pageSize) {
      break
    }
    page++
  }

  return allData
}

// Fonction pour récupérer les métadonnées du dataset
async function fetchDatasetMetadata(datasetId: string): Promise<{
  title: string
  slug: string
  organization: string
  organizationId: string
  url: string
  description: string
} | null> {
  const response = await fetch(`https://www.data.gouv.fr/api/1/datasets/${datasetId}/`)
  if (!response.ok) {
    return null
  }
  const data = await response.json()
  return {
    title: data.title || 'Dataset sans titre',
    slug: data.slug || datasetId,
    organization: data.organization?.name || 'Organisation inconnue',
    organizationId: data.organization?.id || '',
    url: data.page || `https://www.data.gouv.fr/fr/datasets/${datasetId}/`,
    description: data.description || ''
  }
}

// Transformer les données API en DatasetDetails
function transformApiData(
  datasetId: string,
  metadata: { title: string; slug: string; organization: string; organizationId: string; url: string },
  metricData: MetricApiEntry[]
): DatasetDetails {
  // Trier par mois
  const sortedData = metricData.sort((a, b) => a.metric_month.localeCompare(b.metric_month))

  const monthlyStats: MonthlyStats[] = sortedData.map(entry => ({
    month: entry.metric_month,
    visits: entry.monthly_visit || 0,
    downloads: entry.monthly_download_resource || 0
  }))

  const totalVisits = monthlyStats.reduce((sum, stat) => sum + stat.visits, 0)
  const totalDownloads = monthlyStats.reduce((sum, stat) => sum + stat.downloads, 0)

  return {
    id: datasetId,
    title: metadata.title,
    slug: metadata.slug,
    organization: metadata.organization,
    organizationId: metadata.organizationId,
    url: metadata.url,
    totalVisits,
    totalDownloads,
    monthlyStats
  }
}

export default function DatasetDetail({ datasetId, onClose }: Props) {
  const [dataset, setDataset] = useState<DatasetDetails | null>(null)
  const [description, setDescription] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingSource, setLoadingSource] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  useEffect(() => {
    const loadDataset = async () => {
      setLoading(true)
      setError(null)
      setLoadingSource('Chargement des données locales...')

      try {
        // 1. Tenter de charger le fichier JSON local
        const localResponse = await fetch(`/data/datasets/${datasetId}.json`)

        if (localResponse.ok) {
          const data = await localResponse.json()
          setDataset(data)
          setLoading(false)

          // Charger la description depuis l'API
          const metadata = await fetchDatasetMetadata(datasetId)
          if (metadata) {
            setDescription(metadata.description)
          }
          return
        }

        // 2. Fallback: appels API si le fichier local n'existe pas (404)
        setLoadingSource('Récupération via l\'API data.gouv.fr...')

        // Récupérer les métadonnées
        const metadata = await fetchDatasetMetadata(datasetId)
        if (!metadata) {
          setError('Ce dataset n\'existe pas sur data.gouv.fr.')
          setLoading(false)
          return
        }

        setDescription(metadata.description)
        setLoadingSource('Récupération des statistiques...')

        // Récupérer les stats via l'API Metric
        const metricData = await fetchMetricStats(datasetId)

        if (metricData.length === 0) {
          // Le dataset existe mais n'a pas de stats
          setDataset({
            id: datasetId,
            title: metadata.title,
            slug: metadata.slug,
            organization: metadata.organization,
            organizationId: metadata.organizationId,
            url: metadata.url,
            totalVisits: 0,
            totalDownloads: 0,
            monthlyStats: []
          })
        } else {
          // Transformer les données API
          const transformedData = transformApiData(datasetId, metadata, metricData)
          setDataset(transformedData)
        }

        setLoading(false)
      } catch (err) {
        console.error('Erreur chargement dataset:', err)
        setError('Une erreur est survenue lors du chargement des données.')
        setLoading(false)
      }
    }

    loadDataset()
  }, [datasetId])

  useEffect(() => {
    // Charger le script DSFR Chart dynamiquement
    if (dataset && dataset.monthlyStats.length > 0) {
      // Charger le module ESM
      import('@gouvfr/dsfr-chart/LineChart').catch(err => {
        console.error('Erreur chargement DSFR Chart:', err)
      })

      // Charger le CSS
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://cdn.jsdelivr.net/npm/@gouvfr/dsfr-chart@latest/dist/LineChart.css'
      document.head.appendChild(link)

      return () => {
        if (document.head.contains(link)) {
          document.head.removeChild(link)
        }
      }
    }
  }, [dataset])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num)
  }

  if (loading) {
    return (
      <div className="fr-container fr-py-6w">
        <p>
          <span className="fr-icon-refresh-line fr-icon--sm" aria-hidden="true"></span>
          {' '}{loadingSource || 'Chargement des détails du dataset...'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fr-container fr-py-6w">
        <div className="fr-alert fr-alert--error">
          <h3 className="fr-alert__title">Erreur</h3>
          <p>{error}</p>
        </div>
        <button className="fr-btn fr-btn--secondary fr-mt-4w" onClick={onClose}>
          Retour à la recherche
        </button>
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="fr-container fr-py-6w">
        <div className="fr-alert fr-alert--error">
          <p>Impossible de charger les détails du dataset.</p>
        </div>
        <button className="fr-btn fr-btn--secondary fr-mt-4w" onClick={onClose}>
          Retour à la recherche
        </button>
      </div>
    )
  }

  // Préparer les données pour le graphique
  const months = dataset.monthlyStats.map(stat => stat.month)
  const visits = dataset.monthlyStats.map(stat => stat.visits)
  const downloads = dataset.monthlyStats.map(stat => stat.downloads)

  // Formater pour line-chart (2 courbes)
  const xData = JSON.stringify([months, months])
  const yData = JSON.stringify([visits, downloads])

  return (
    <div className="fr-container fr-py-6w">
      <button
        className="fr-btn fr-btn--secondary fr-btn--icon-left fr-icon-arrow-left-line fr-mb-4w"
        onClick={onClose}
      >
        Retour à la recherche
      </button>

      <div className="fr-mb-4w">
        <h1 className="fr-h2">{dataset.title}</h1>
        <p className="fr-text--lg">{dataset.organization}</p>
        <a
          href={dataset.url}
          target="_blank"
          rel="noopener noreferrer"
          className="fr-link fr-icon-external-link-line fr-link--icon-right fr-mt-2w"
        >
          Voir sur data.gouv.fr
        </a>
      </div>

      {/* Description en accordéon */}
      {description && (
        <section className="fr-accordion fr-mb-4w">
          <h3 className="fr-accordion__title">
            <button
              className="fr-accordion__btn"
              aria-expanded={isDescriptionExpanded}
              aria-controls="accordion-description"
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            >
              Description du jeu de données
            </button>
          </h3>
          <div
            className={isDescriptionExpanded ? 'fr-collapse--expanded' : 'fr-collapse'}
            id="accordion-description"
          >
            <div className="fr-p-4w">
              <ReactMarkdown>{description}</ReactMarkdown>
            </div>
          </div>
        </section>
      )}

      {/* Stats totales */}
      <div className="fr-grid-row fr-grid-row--gutters fr-mb-6w">
        <div className="fr-col-12 fr-col-md-6">
          <div className="fr-callout">
            <h3 className="fr-callout__title">
              <span className="fr-icon-eye-line" aria-hidden="true"></span>
              {' '}Visites totales
            </h3>
            <p className="fr-callout__text" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {formatNumber(dataset.totalVisits)}
            </p>
          </div>
        </div>
        <div className="fr-col-12 fr-col-md-6">
          <div className="fr-callout">
            <h3 className="fr-callout__title">
              <span className="fr-icon-download-line" aria-hidden="true"></span>
              {' '}Téléchargements totaux
            </h3>
            <p className="fr-callout__text" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {formatNumber(dataset.totalDownloads)}
            </p>
          </div>
        </div>
      </div>

      {/* Graphique */}
      <div className="fr-mb-6w">
        <h2 className="fr-h3 fr-mb-4w">Évolution mensuelle</h2>
        <div className="fr-card fr-p-4w">
          <div style={{ minHeight: '400px' }}>
            <line-chart
              x={xData}
              y={yData}
              name='["Visites", "Téléchargements"]'
              selected-palette="categorical"
            ></line-chart>
          </div>
          <div className="fr-mt-4w">
            <ul className="fr-raw-list">
              <li style={{ display: 'inline-block', marginRight: '2rem' }}>
                <span style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '3px',
                  backgroundColor: '#000091',
                  marginRight: '0.5rem',
                  verticalAlign: 'middle'
                }}></span>
                Visites
              </li>
              <li style={{ display: 'inline-block' }}>
                <span style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '3px',
                  backgroundColor: '#6458F5',
                  marginRight: '0.5rem',
                  verticalAlign: 'middle'
                }}></span>
                Téléchargements
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tableau des données mensuelles */}
      <div>
        <h2 className="fr-h3 fr-mb-4w">Données mensuelles</h2>
        <div className="fr-table">
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th className="fr-text--right">Visites</th>
                <th className="fr-text--right">Téléchargements</th>
              </tr>
            </thead>
            <tbody>
              {dataset.monthlyStats.slice().reverse().slice(0, 12).map((stat) => (
                <tr key={stat.month}>
                  <td>
                    {new Date(stat.month + '-01').toLocaleDateString('fr-FR', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </td>
                  <td className="fr-text--right">{formatNumber(stat.visits)}</td>
                  <td className="fr-text--right">{formatNumber(stat.downloads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
