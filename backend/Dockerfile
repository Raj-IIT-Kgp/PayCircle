# ── Development stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS dev
WORKDIR /app
RUN apk add --no-cache openssl curl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install && npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl curl
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev && npx prisma generate
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
