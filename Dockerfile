# ========================================================
# Production Dockerfile for AI-Powered AWS Cost Optimization Microservice
# Compatible with Amazon ECS (Fargate) & Amazon Elastic Container Registry (ECR)
# ========================================================
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    AWS_DEFAULT_REGION=ap-south-1

WORKDIR /app

# Install system dependencies & security updates
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application backend
COPY backend/ ./backend/

# Create a non-root system user for security compliance
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

# Expose HTTP port for Application Load Balancer (ALB) traffic
EXPOSE 8080

# ALB Health Check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start container server for Amazon ECS Fargate
CMD ["python", "backend/container_server.py"]
