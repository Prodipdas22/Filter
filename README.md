# PortalFX — Mobile Browser Edition

A mobile-first browser rebuild of the original `mishu006/Filters` project.

Original project: https://github.com/mishu006/Filters

## Features

- Mobile Chrome/Safari camera UI
- Two-hand MediaPipe hand tracking
- Portal generated from index/thumb fingertips
- Hand-closing gesture changes filter
- 9 browser filters
- Camera switching
- Screenshot capture
- Responsive desktop/mobile layout
- No Python or backend
- GitHub Pages compatible
- PWA manifest included

## Run locally

Camera APIs require a secure context. The easiest local option is VS Code + Live Server, or any HTTPS/static server.

Do NOT simply open `index.html` as a `file://` URL and expect camera access.

## GitHub Pages

1. Create a repository.
2. Upload all files in this folder to the repository root.
3. Settings → Pages.
4. Select `Deploy from a branch`.
5. Select `main` and `/root`.
6. Save.
7. Open the generated HTTPS URL on your phone.
8. Tap Start Camera and allow permission.

## Important

The app loads MediaPipe's browser runtime from jsDelivr and the Hand Landmarker model from Google's storage CDN. Internet access is therefore required on first load and during use.

The original Python project uses OpenCV/NumPy/MediaPipe and desktop `cv2.VideoCapture`. This web edition replaces those desktop components with browser camera APIs, Canvas and MediaPipe's web Tasks API.

## Performance

For low-end phones:
- use the rear camera if needed
- keep other browser tabs closed
- the app caps canvas rendering to device pixel ratio 2
- the portal filter is rendered only inside the portal area

## License

This web edition is intended as a separate browser implementation inspired by the original MIT-licensed repository. Review the original repository's license before redistributing the original code/assets.

## If Start Camera does nothing

Make sure you are opening the **HTTPS GitHub Pages URL**, not a `file://` URL.
In Chrome on Android, tap the lock icon → Permissions → Camera → Allow, then reload.
The revised app starts the camera before downloading the hand-tracking model, so a slow model download no longer makes the Start button appear frozen.
