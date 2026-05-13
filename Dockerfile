FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /data/uploads

ENV SQLITE_PATH=/data/blog.db
ENV UPLOADS_PATH=/data/uploads
ENV SESSION_SECRET=change-me-in-production
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]
