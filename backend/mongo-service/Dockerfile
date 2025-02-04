# Use the official MongoDB image
FROM mongo:latest

# Copy the PEM file into the container
COPY mongodb.pem /etc/ssl/mongodb.pem

# Set appropriate permissions on the PEM file
RUN chmod 600 /etc/ssl/mongodb.pem

# Expose the default MongoDB port
EXPOSE 27017

# Start MongoDB with TLS enabled and provide the CA file (using the same PEM for self-signed)
CMD ["mongod", "--tlsMode", "requireTLS", "--tlsCertificateKeyFile", "/etc/ssl/mongodb.pem", "--tlsCAFile", "/etc/ssl/mongodb.pem"]
