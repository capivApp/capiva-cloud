# ---- Capiva Cloud — Frontend (build + nginx) ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json ./
RUN bun install || true
COPY . .
RUN bun run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback
RUN printf 'server {\n  listen 80;\n  location / {\n    root /usr/share/nginx/html;\n    try_files $uri /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
