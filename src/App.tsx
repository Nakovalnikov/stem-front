import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import GuidePage from './pages/GuidePage'
import StartPage from './pages/StartPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/start" element={<StartPage />} />
      <Route path="/workspace" element={<WorkspacePage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
