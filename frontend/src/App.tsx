import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Approvals from './pages/Approvals'
import Audit from './pages/Audit'
import TicketDetail from './pages/TicketDetail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/audit/:ticketId" element={<TicketDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
