import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
	children: ReactNode;
	role?: string;
}

export default function ProtectedRoute({ children, role }: ProtectedRouteProps) {
	const { isLoggedIn, isLoading, user } = useAuth();

	if (isLoading) {
		return <div className="min-h-screen" />;
	}

	if (!isLoggedIn) {
		return <Navigate to="/login" replace />;
	}

	if (role && user?.role !== role) {
		const resolvedRole = (user?.role || '').toLowerCase();
		if (resolvedRole === 'admin') {
			return <Navigate to="/admin/dashboard" replace />;
		}
		if (resolvedRole === 'teacher') {
			return <Navigate to="/teacher" replace />;
		}
		return <Navigate to="/dashboard" replace />;
	}

	return <>{children}</>;
}
