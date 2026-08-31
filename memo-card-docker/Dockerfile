# 便签卡片 memo-card — 多阶段构建
# Stage 1: 构建前端（vite build → dist）
FROM node:22-alpine AS builder
WORKDIR /app
COPY context/package.json context/package-lock.json ./
RUN npm ci
COPY context/ ./
RUN npm run build

# Stage 2: 运行时（express 托管 dist + AI 代理）
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8010
COPY context/package.json context/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY context/server ./server
EXPOSE 8010
CMD ["node", "server/index.mjs"]
