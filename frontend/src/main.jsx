import React from 'react'
import ReactDOM from 'react-dom/client'
import './utils/chartSetup'
import App from './App'
import { installAutoSync } from './lib/offlineSync'
import './styles.css'

installAutoSync()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Cache the app shell (production build only) so the audit wizard opens offline.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
