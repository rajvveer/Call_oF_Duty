FROM node:24-alpine AS dependencies
WORKDIR /game
COPY package.json package-lock.json ./
RUN npm ci
COPY apps ./apps
COPY packages ./packages
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--import","tsx","apps/game-server/index.ts"]
