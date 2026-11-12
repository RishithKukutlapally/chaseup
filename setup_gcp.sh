#!/usr/bin/env bash
# One-time GCP setup script for Northgate Chase CI/CD deployment
# Configured for project slabspro-slabsuser24 in region asia-south1

set -euo pipefail

PROJECT_ID="slabspro-slabsuser24"
REGION="asia-south1"
GAR_REPO="northgate-chase-repo"
SA_NAME="github-deployer"
KEY_FILE="gcp-key.json"

echo "Setting active GCP project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# 1. Enable required APIs
echo "Enabling GCP APIs (Cloud Run, Artifact Registry, IAM)..."
gcloud services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    iam.googleapis.com \
    --project="$PROJECT_ID"

# 2. Create Artifact Registry Docker repository in allowed region
echo "Creating Artifact Registry repository '$GAR_REPO' in $REGION..."
gcloud artifacts repositories create "$GAR_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Docker repository for Northgate Chase" \
    --project="$PROJECT_ID" || true

# 3. Create Service Account if it does not already exist
echo "Creating Service Account '$SA_NAME'..."
gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deployer" \
    --project="$PROJECT_ID" 2>/dev/null || true

SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# 4. Grant required IAM roles with brief pauses to avoid rate limits
echo "Assigning IAM roles to $SA_EMAIL..."
sleep 3
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.admin" --quiet

sleep 3
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/artifactregistry.writer" --quiet

sleep 3
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/iam.serviceAccountUser" --quiet

# 5. Generate Service Account Key
echo "Generating Service Account key file: $KEY_FILE..."
gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"

echo "=========================================================="
echo "GCP Setup Complete for Project: $PROJECT_ID in Region: $REGION!"
echo ""
echo "NEXT STEP:"
echo "Copy everything printed below and paste it back into our chat:"
echo "----------------------------------------------------------"
cat "$KEY_FILE"
echo ""
echo "----------------------------------------------------------"
echo "=========================================================="
