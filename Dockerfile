FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
ENV STATIC_DIR=dist
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Production start requires AI_BUDGET_RECEIPT_SECRET (>=32 chars), even without a remote model.
CMD ["npm", "run", "start"]
