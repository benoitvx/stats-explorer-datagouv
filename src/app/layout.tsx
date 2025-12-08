import '@gouvfr/dsfr/dist/dsfr.min.css'
import './globals.css'
import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Stats Explorer - data.gouv.fr',
  description: 'Visualisez les statistiques d\'usage de data.gouv.fr',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@gouvfr/dsfr@1.14.0/dist/utility/icons/icons.min.css"
        />
      </head>
      <body>
        <header role="banner" className="fr-header">
          <div className="fr-header__body">
            <div className="fr-container">
              <div className="fr-header__body-row">
                <div className="fr-header__brand fr-enlarge-link">
                  <div className="fr-header__brand-top">
                    <div className="fr-header__logo">
                      <p className="fr-logo">
                        République
                        <br />
                        Française
                      </p>
                    </div>
                    <div className="fr-header__operator">
                      <img
                        className="fr-responsive-img"
                        style={{ maxWidth: '9.0625rem' }}
                        src="https://www.data.gouv.fr/fr/static/gouvfr-logo.svg"
                        alt="data.gouv.fr"
                      />
                    </div>
                  </div>
                  <div className="fr-header__service">
                    <a href="/" title="Accueil - Stats Explorer">
                      <p className="fr-header__service-title">Stats Explorer</p>
                    </a>
                    <p className="fr-header__service-tagline">
                      Statistiques d'usage de data.gouv.fr
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main role="main" id="content">
          {children}
        </main>

        <footer className="fr-footer" role="contentinfo" id="footer">
          <div className="fr-container">
            <div className="fr-footer__body">
              <div className="fr-footer__brand fr-enlarge-link">
                <a href="/" title="Retour à l'accueil du site">
                  <p className="fr-logo">
                    République
                    <br />
                    Française
                  </p>
                </a>
              </div>
              <div className="fr-footer__content">
                <p className="fr-footer__content-desc">
                  Explorez les statistiques d'usage de la plateforme data.gouv.fr
                </p>
                <ul className="fr-footer__content-list">
                  <li className="fr-footer__content-item">
                    <a
                      className="fr-footer__content-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      href="https://www.data.gouv.fr"
                    >
                      data.gouv.fr
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="fr-footer__bottom">
              <ul className="fr-footer__bottom-list">
                <li className="fr-footer__bottom-item">
                  <a className="fr-footer__bottom-link" href="https://www.data.gouv.fr/fr/pages/legal/mentions-legales/">
                    Mentions légales
                  </a>
                </li>
                <li className="fr-footer__bottom-item">
                  <a className="fr-footer__bottom-link" href="https://www.data.gouv.fr/fr/pages/legal/cgu/">
                    CGU
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
