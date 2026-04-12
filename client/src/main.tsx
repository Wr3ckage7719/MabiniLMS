import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { pushNotificationsService } from "@/services/push-notifications.service";

createRoot(document.getElementById("root")!).render(<App />);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		void pushNotificationsService.registerServiceWorker().catch((error) => {
			console.debug('Service worker registration skipped', error);
		});
	});
}
