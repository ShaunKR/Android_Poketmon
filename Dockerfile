FROM node:22-alpine
WORKDIR /garden
COPY server/server.mjs ./server/server.mjs
COPY app/src/main/assets/web/ ./app/src/main/assets/web/
ENV GARDEN_DATA=/data/drawings.json
EXPOSE 8787
CMD ["node", "server/server.mjs"]
