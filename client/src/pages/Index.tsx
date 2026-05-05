import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLogo } from '@/components/AppLogo';
import LandingPage from './LandingPage';

export default function IndexPage() {
	const { isLoggedIn, isLoading, user } = useAuth();

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4">
					<AppLogo className="h-10 w-10 animate-pulse" />
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading…</span>
					</div>
				</div>
			</div>
		);
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
