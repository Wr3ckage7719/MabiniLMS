import { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeProviderProps {
	children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	return <>{children}</>;
}

export function useTheme() {
	return {
		theme: 'system' as Theme,
		setTheme: (_theme: Theme) => {},
	};
}
