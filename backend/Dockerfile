###############################################################################
# 1) Start from Node.js 20 slim image
###############################################################################
FROM node:20-slim

# 2) Use non-root user (optional but recommended)
ENV NODE_ENV=production
RUN useradd --create-home appuser
WORKDIR /home/appuser

# 3) Copy package.json / package-lock.json & install dependencies
COPY package*.json ./
RUN npm ci --only=production

# 4) Copy the rest of your backend source code
COPY . .

# 5) Change ownership so the non-root user can run the app
RUN chown -R appuser:appuser /home/appuser
USER appuser

# 6) Expose port 8080 (Cloud Run expects this)
EXPOSE 8080

# 7) Tell Docker how to launch your server
#    This runs: node index.js (or whatever "start" is in package.json)
CMD ["npm", "start"]
