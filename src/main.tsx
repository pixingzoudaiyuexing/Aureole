import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createAppRouter } from '@/app/router/router'
import { AppProviders } from '@/app/providers/app-providers'
import '@/styles/index.css'

const router = createAppRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders router={router} />
  </StrictMode>,
)
