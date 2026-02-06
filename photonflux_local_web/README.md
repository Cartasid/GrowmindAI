# PhotonFlux Local Web (Add-on)

Dieses Add-on stellt die lokale Web-App mit einem FastAPI-Proxy bereit, der Anfragen an Google Gemini weiterleitet.

## Konfiguration
- `gemini_api_key` (erforderlich): Dein Gemini API Key.
- `gemini_model` (optional): z.B. `gemini-2.5-flash`.

## Start
Nach dem Start klicke auf **Öffne Web-UI**. Alternativ per Port 5173, wenn gemappt.

## Offline-Modus
Der integrierte Service Worker ermöglicht den Offline-Betrieb der Web-Oberfläche.

1. Stelle sicher, dass das Frontend einmal mit aktiver Internetverbindung geladen wird (z. B. nach `npm install` & `npm run build` oder nach dem Start des Add-ons).
2. Beim ersten Besuch registriert der Browser automatisch den Service Worker und cached die wichtigsten Assets der Oberfläche.
3. Die zuletzt verwendeten Düngepläne werden bei Anfragen an `api/store/...` zusätzlich im Cache abgelegt, sodass sie offline weiter verfügbar bleiben.

Aktualisierte Versionen der Anwendung oder geänderte Pläne werden beim nächsten Online-Zugriff automatisch übernommen. Falls der Offline-Cache zurückgesetzt werden soll, genügt es, den Service Worker bzw. die gespeicherten Website-Daten im Browser zu löschen.

## Tests für die Dünge-Berechnungen

Im Ordner [`build-frontend/tests`](build-frontend/tests) befinden sich Node-basierte Regressionstests, die mit `npm test` ausgeführt werden können. Neu hinzugekommen sind zwei Dateien:

- [`doserServiceEntry.ts`](build-frontend/tests/doserServiceEntry.ts) bündelt den eigentlichen Düngerechner (`calculateDose`) samt der zugehörigen Nährstoffprofile, damit er in einer ESM-Testumgebung via esbuild geladen werden kann.
- [`doserService.test.mjs`](build-frontend/tests/doserService.test.mjs) überprüft, dass die ausgegebenen PPM-Werte exakt den angezeigten Komponenten-Mengen (A, C/B, Booster, Additive sowie Basis-Wasserprofil) entsprechen. Zusätzlich wird verifiziert, dass eventuelle Clamp-Grenzen (z. B. ein Maximalwert von 1.30 g/L für Komponente X) in den Berechnungen berücksichtigt werden.

So kann nachvollzogen werden, dass die App die angezeigten Mengen korrekt in PPM umrechnet. Bei Bedarf lassen sich die Tests gezielt ausführen, z. B. mit `npm test -- doserService.test.mjs`.

## Build-Hinweis
Der Dockerfile baut die Frontend-Assets im ersten Stage (Node 20) und kopiert sie in das Runtime-Image. Das Runtime-Image enthält nur Python + FastAPI.

## Kompatibilität
- Das Add-on nutzt **addon-base** Images (`ghcr.io/home-assistant/*-addon-base`). Kein Docker-in-Docker.
- Multi-Stage-Build verwendet Node **nur im Build-Stage**. Laufzeit ist Python + Uvicorn.

## Build-Hinweis (Supervisor)
- `build.yaml` steuert das Basisimage (`*-base:latest` per Architektur). Kein `*-addon-base`.
- `ARG BUILD_FROM` steht **oberhalb** aller `FROM`-Instruktionen.
- Start erfolgt via `run.sh` (kein s6-Verzeichnis nötig), wie in den offiziellen Developer Docs.
