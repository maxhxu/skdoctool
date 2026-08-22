FROM node:20-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=frontend-build /src/dist /usr/share/nginx/html
COPY nginx/templates /etc/nginx/templates
