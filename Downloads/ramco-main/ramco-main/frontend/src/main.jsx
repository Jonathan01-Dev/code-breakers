// Point d'entrée du frontend : c'est le tout premier fichier JS exécuté
// dans le navigateur (voir index.html qui le charge via <script type="module">).
// On y assemble les "providers" React qui doivent envelopper toute l'app :
// - BrowserRouter : active le routing par URL (react-router-dom)
// - AuthProvider  : rend l'utilisateur connecté (token, rôle...) disponible
//                   partout via useAuth(), sans avoir à le passer en props
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { IconlyProvider } from 'react-iconly'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'

// createRoot + render : API React 18 pour "brancher" l'application React
// sur l'élément <div id="root"> présent dans index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <IconlyProvider set="light" stroke="regular" primaryColor="currentColor">
          <App />
        </IconlyProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
