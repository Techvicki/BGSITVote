import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/pages/LoginPage';
import LandingPage from '@/pages/LandingPage';
import Dashboard from '@/pages/Dashboard';
import FacultyDashboard from '@/pages/FacultyDashboard';
import BallotPage from '@/pages/BallotPage';
import type { Election } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 text-civic animate-spin" />
          <p className="text-sm text-slate-text">Loading BGSIT Vote...</p>
        </div>
      </div>
    );
  }

  if (!user && !showLogin) {
    return <LandingPage onLogin={() => setShowLogin(true)} />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (profile?.role === 'faculty_manager' || profile?.role === 'election_admin') {
    return <FacultyDashboard />;
  }

  if (selectedElection) {
    return (
      <BallotPage
        election={selectedElection}
        onBack={() => setSelectedElection(null)}
      />
    );
  }

  return <Dashboard onSelectElection={setSelectedElection} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
