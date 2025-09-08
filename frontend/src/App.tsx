import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './home/Home';
import ContestPage from './contest/ContestPage';
import Admin from './admin/Admin';
import Login from './login/Login';
import Enter from './enter/Enter';
import UserProfile from './home/components/UserProfile';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/login" element={<Login />} />
        <Route path="/enter" element={<Enter />} />
        <Route path="/user/:id" element={<UserProfile />} />
        <Route path="/contest" element={<ContestPage />} />
      </Routes>
    </Router>
  );
};

export default App;
