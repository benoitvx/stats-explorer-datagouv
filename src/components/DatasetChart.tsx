'use client'

import { useEffect, useState } from 'react'

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

interface Props {
  datasetId: string
}

export default function DatasetChart({ datasetId }: Props) {
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Charger les données du dataset
    setLoading(true)
    fetch(`/data/datasets/${datasetId}.json`)
      .then(res => {
        if (!res.ok) throw new Error('Dataset non trouvé')
        return res.json()
      })
      .then(data => {
        setMonthlyStats(data.monthlyStats || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Erreur chargement dataset:', err)
        setLoading(false)
      })
  }, [datasetId])

  useEffect(() => {
    // Charger le script DSFR Chart dynamiquement
    if (monthlyStats.length > 0) {
      import('@gouvfr/dsfr-chart/LineChart').catch(err => {
        console.error('Erreur chargement DSFR Chart:', err)
      })

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
  }, [monthlyStats])

  if (loading) {
    return <p>Chargement du graphique...</p>
  }

  if (monthlyStats.length === 0) {
    return <p>Aucune donnée disponible pour ce dataset</p>
  }

  // Préparer les données pour le graphique (derniers 12 mois)
  const recentStats = monthlyStats.slice(-12)
  const months = recentStats.map(stat => stat.month)
  const visits = recentStats.map(stat => stat.visits)
  const downloads = recentStats.map(stat => stat.downloads)

  // Formater pour line-chart (2 courbes)
  const xData = JSON.stringify([months, months])
  const yData = JSON.stringify([visits, downloads])

  return (
    <div>
      <div style={{ minHeight: '300px' }}>
        <line-chart
          x={xData}
          y={yData}
          name='["Visites", "Téléchargements"]'
          selected-palette="categorical"
        ></line-chart>
      </div>
      <div className="fr-mt-2w">
        <ul className="fr-raw-list" style={{ fontSize: '0.875rem' }}>
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
  )
}
