#!/usr/bin/env bash
# One-time GCP setup script for Northgate Chase CI/CD deployment
# Run this in Google Cloud Shell or any terminal with gcloud logged in.

set -euo pipefail

# Configuration - Change if needed
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
GAR_REPO="northgate-chase-repo"
SA_NAME="github-deployer"
KEY_FILE="gcp-key.json"

echo "Using GCP Project: $PROJECT_ID"
echo "Region: $REGION"

# 1. Enable required APIs
echo "Enabling GCP APIs (Cloud Run, Artifact Registry, IAM)..."
gcloud services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    iam.googleapis.com \
    --project="$PROJECT_ID"

# 2. Create Artifact Registry Docker repository if not exists
echo "Creating Artifact Registry repository '$GAR_REPO'..."
gcloud artifacts repositories create "$GAR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Northgate Chase" \
    --project="$PROJECT_ID" || true

# 3. Create Service Account
echo "Creating Service Account '$SA_NAME'..."
gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project="$PROJECT_ID" || true

SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# 4. Grant required IAM roles
echo "Assigning IAM roles..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/iam.serviceAccountUser"

# 5. Generate Service Account Key
echo "Generating Service Account key file: $KEY_FILE"
gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"

echo "=========================================================="
echo "GCP Setup Complete!"
echo ""
echo "Next Steps in GitHub:"
echo "1. Go to your GitHub Repository -> Settings -> Secrets and variables -> Actions"
echo "2. Add secret 'GCP_PROJECT_ID' with value: $PROJECT_ID"
echo "3. Add secret 'GCP_SA_KEY' with the entire contents of '$KEY_FILE'"
echo "4. Push your code to 'main' branch to trigger deployment."
echo "=========================================================="
