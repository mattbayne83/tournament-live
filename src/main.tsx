import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createPersistence } from './store/persistence'
import { createPublisher, publisherRef } from './store/publisher'
import { useAppStore } from './store/store'

const persistence = createPersistence(useAppStore, localStorage)
persistence.loadCurrent()
publisherRef.current = createPublisher(useAppStore)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
