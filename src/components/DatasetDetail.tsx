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

interface Props {
  datasetId: string
  onClose: () => void
}

export default function DatasetDetail({ datasetId, onClose }: Props) {
  const [dataset, setDataset] = useState<DatasetDetails | null>(null)
  const [description, setDescription] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  useEffect(() => {
    // Charger les détails du dataset local
    setLoading(true)
    fetch(`/data/datasets/${datasetId}.json`)
      .then(res => {
        if (!res.ok) throw new Error('Dataset non trouvé')
        return res.json()
      })
      .then(data => {
        setDataset(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Erreur chargement dataset:', err)
        setLoading(false)
      })

    // Charger la description depuis l'API data.gouv.fr
    fetch(`https://www.data.gouv.fr/api/1/datasets/${datasetId}/`)
      .then(res => res.json())
      .then(data => {
        setDescription(data.description || '')
      })
      .catch(err => {
        console.error('Erreur chargement description:', err)
      })
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
        <p>Chargement des détails du dataset...</p>
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
