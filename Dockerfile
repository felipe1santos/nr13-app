# --- build estático (Vite) ---
FROM node:24-alpine AS build
WORKDIR /app

# deps primeiro (cache). npm install (não ci) p/ resolver optional deps
# nativas do rolldown na plataforma de build — lockfile do Windows + bug
# npm #4828 fazia o `npm ci` pular @rolldown/binding-linux-*.
COPY package*.json ./
RUN npm install

COPY . .

# VITE_* precisam existir em BUILD-TIME (Vite inlina no bundle).
# Coolify injeta os Build Variables como build args automaticamente.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# --- serve estático (Caddy + SPA fallback) ---
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
