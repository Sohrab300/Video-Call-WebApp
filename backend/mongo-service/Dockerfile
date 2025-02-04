# Dockerfile for MongoDB with TLS
FROM mongo:latest

# Copy the PEM file into the container
COPY mongodb.pem /etc/ssl/mongodb.pem

# Ensure the PEM file has the correct permissions (optional, if needed)
RUN chmod 600 /etc/ssl/mongodb.pem

# Expose MongoDB default port
EXPOSE 27017

# Start MongoDB with TLS enabled
CMD ["mongod", "--tlsMode", "requireTLS", "--tlsCertificateKeyFile", "/etc/ssl/mongodb.pem"]
