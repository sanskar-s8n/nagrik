# NAGRIK

AI-assisted Traffic Risk and Emergency Response System.

## Structure

- `backend/server.js` — Node.js API and server
- `frontend/index.html` — frontend
- `package.json` — start configuration
- `.replit` — Replit run/deployment configuration

## Run

```bash
npm start
```

The application uses the platform-provided `PORT` and binds to `0.0.0.0` for cloud deployment.

## Health check

`/api/health`

## Note

The included `frontend/index.html` is a small deployment-ready starter page. Replace it with the full NAGRIK UI when ready; keep it at `frontend/index.html`.
