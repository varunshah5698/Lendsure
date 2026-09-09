# LendSure — single-container production image.
# Stage 1 builds the React frontend; stage 2 serves API + static via uvicorn.
# The seeded SQLite DB (backend/lending.db) and ML model ship inside the
# image, so a fresh deploy works with zero manual steps.

# ---------- Stage 1: frontend ----------
FROM node:20-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Build to an absolute dir (config points at ../backend/static for local dev).
RUN npx vite build --outDir /app-static

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /srv/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# Fresh production frontend (overwrites the dev build in backend/static).
COPY --from=web /app-static ./static
EXPOSE 8000
# Render (and most PaaS) inject $PORT; default to 8000 locally.
CMD ["sh", "-c", "python -m uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
