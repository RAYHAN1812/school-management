FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm install --no-save prisma@5.22.0

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

# Apply pending migrations, optionally seed demo data, then start the API.
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$RUN_SEED\" = \"true\" ]; then node prisma/seed.js; fi && node src/server.js"]
