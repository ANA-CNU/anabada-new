import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './home/Home'
import Admin from './admin/Admin'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  );
}

export default App
