#!/usr/bin/env bash
# Direct deployment from Cloud Shell for slabspro-slabsuser24 in asia-south1
set -euo pipefail

PROJECT_ID="slabspro-slabsuser24"
REGION="asia-south1"
REPO="northgate-chase-repo"
IMAGE_TAG="asia-south1-docker.pkg.dev/${PROJECT_ID}/${REPO}/northgate-chase:latest"
SERVICE_NAME="northgate-chase"

echo "=== Starting Direct Cloud Run Deployment ==="
gcloud config set project "$PROJECT_ID"

# 1. Clone or update repository in Cloud Shell
if [ -d "chaseup" ]; then
    echo "Updating existing chaseup directory..."
    cd chaseup && git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/RishithKukutlapally/chaseup.git
    cd chaseup
fi

# 2. Configure Docker authentication for Artifact Registry
echo "Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# 3. Build Docker container image
echo "Building Docker image..."
docker build -t "$IMAGE_TAG" .

# 4. Push image to Artifact Registry
echo "Pushing Docker image to Artifact Registry..."
docker push "$IMAGE_TAG"

# 5. Deploy to Google Cloud Run
echo "Deploying container to Cloud Run in ${REGION}..."
if gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_TAG" \
    --region "$REGION" \
    --port 8080 \
    --allow-unauthenticated \
    --quiet; then
    echo ""
    echo "=========================================================="
    echo "SUCCESS! Application deployed to Google Cloud Run!"
    URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
    echo "Public URL: $URL"
    echo "=========================================================="
else
    echo "Retrying deployment with authenticated access (in case public access is restricted by lab policy)..."
    gcloud run deploy "$SERVICE_NAME" \
        --image "$IMAGE_TAG" \
        --region "$REGION" \
        --port 8080 \
        --no-allow-unauthenticated \
        --quiet
    echo ""
    echo "=========================================================="
    echo "SUCCESS! Application deployed to Google Cloud Run (Authenticated)!"
    URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
    echo "Service URL: $URL"
    echo "To test in browser, run in Cloud Shell:"
    echo "gcloud run services proxy $SERVICE_NAME --region $REGION"
    echo "Then use Cloud Shell Web Preview on port 8080!"
    echo "=========================================================="
fi
