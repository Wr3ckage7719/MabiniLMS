import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LandingPage from './LandingPage';

export default function IndexPage() {
	const { isLoggedIn, isLoading, user } = useAuth();

	if (isLoading) {
		return <div className="min-h-screen" />;
	}

	if (isLoggedIn && user) {
		const resolvedRole = (user.role || '').toLowerCase();
		if (resolvedRole === 'admin') {
			return <Navigate to="/admin/dashboard" replace />;
		}

		if (resolvedRole === 'teacher') {
			return <Navigate to="/teacher" replace />;
		}

		return <Navigate to="/dashboard" replace />;
	}

	return <LandingPage />;
}
