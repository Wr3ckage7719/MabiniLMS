import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { pushNotificationsService } from "@/services/push-notifications.service";
import { initializeThemePreference } from "@/lib/theme";
import {
	AUTH_ROLE_CACHE_STORAGE_KEY,
	PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT,
	PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY,
	resolveShouldLockPwaMobileZoom,
} from "@/lib/pwa-zoom-policy";

const DEFAULT_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0';
const PWA_MOBILE_LOCKED_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

function isStandalonePwa(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	const iOSStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
	const standardStandalone = window.matchMedia('(display-mode: standalone)').matches;

	return iOSStandalone || standardStandalone;
}

function isMobileViewport(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	return window.matchMedia('(max-width: 767px)').matches;
}

function applyPwaMobileViewportZoomPolicy() {
	if (typeof document === 'undefined') {
		return;
	}

	const viewportMeta = document.querySelector('meta[name="viewport"]');
	if (!viewportMeta) {
		return;
	}

	const shouldLockZoom = isStandalonePwa() && isMobileViewport() && resolveShouldLockPwaMobileZoom();
	viewportMeta.setAttribute(
		'content',
		shouldLockZoom ? PWA_MOBILE_LOCKED_VIEWPORT_CONTENT : DEFAULT_VIEWPORT_CONTENT,
	);
}

initializeThemePreference();

if (typeof window !== 'undefined') {
	const standaloneQuery = window.matchMedia('(display-mode: standalone)');
	const mobileQuery = window.matchMedia('(max-width: 767px)');
	const handleStorageChange = (event: StorageEvent) => {
		if (
			event.key === PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY ||
			event.key === AUTH_ROLE_CACHE_STORAGE_KEY
		) {
			applyPwaMobileViewportZoomPolicy();
		}
	};

	applyPwaMobileViewportZoomPolicy();

	standaloneQuery.addEventListener('change', applyPwaMobileViewportZoomPolicy);
	mobileQuery.addEventListener('change', applyPwaMobileViewportZoomPolicy);
	window.addEventListener('orientationchange', applyPwaMobileViewportZoomPolicy);
	window.addEventListener(PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT, applyPwaMobileViewportZoomPolicy);
	window.addEventListener('storage', handleStorageChange);
}

createRoot(document.getElementById("root")!).render(<App />);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		void pushNotificationsService.registerServiceWorker().catch((error) => {
			console.debug('Service worker registration skipped', error);
		});
	});
}
