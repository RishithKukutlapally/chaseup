#!/usr/bin/env bash
# One-time GCP setup script for Northgate Chase CI/CD deployment
# Run this in Google Cloud Shell for project: slabspro-slabsuser24

set -euo pipefail

PROJECT_ID="slabspro-slabsuser24"
REGION="us-central1"
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
echo "Assigning IAM roles to $SA_EMAIL..."
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
echo "Generating Service Account key file: $KEY_FILE..."
gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"

echo "=========================================================="
echo "GCP Setup Complete for Project: $PROJECT_ID!"
echo ""
echo "NEXT STEP:"
echo "1. Go to https://github.com/RishithKukutlapally/chaseup/settings/secrets/actions"
echo "2. Add secret: GCP_PROJECT_ID  =>  $PROJECT_ID"
echo "3. Add secret: GCP_SA_KEY      =>  Copy everything printed below:"
echo "----------------------------------------------------------"
cat "$KEY_FILE"
echo "----------------------------------------------------------"
echo "=========================================================="
