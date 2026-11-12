# One-time GCP setup script for Northgate Chase CI/CD deployment (PowerShell)
# Run in PowerShell where gcloud is authenticated (or Cloud Shell)

$ErrorActionPreference = "Stop"

$PROJECT_ID = gcloud config get-value project 2>$null
if (-not $PROJECT_ID) {
    Write-Error "No GCP project set. Run: gcloud config set project <YOUR_PROJECT_ID>"
}

$REGION = "us-central1"
$GAR_REPO = "northgate-chase-repo"
$SA_NAME = "github-deployer"
$KEY_FILE = "gcp-key.json"

Write-Host "Using GCP Project: $PROJECT_ID"
Write-Host "Region: $REGION"

# 1. Enable required APIs
Write-Host "Enabling GCP APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com --project=$PROJECT_ID

# 2. Create Artifact Registry repository
Write-Host "Creating Artifact Registry repository..."
gcloud artifacts repositories create $GAR_REPO --repository-format=docker --location=$REGION --description="Docker repository for Northgate Chase" --project=$PROJECT_ID 2>$null

# 3. Create Service Account
Write-Host "Creating Service Account..."
gcloud iam service-accounts create $SA_NAME --display-name="GitHub Actions Deployer" --project=$PROJECT_ID 2>$null

$SA_EMAIL = "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# 4. Grant IAM roles
Write-Host "Granting IAM roles..."
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountUser"

# 5. Create Key
Write-Host "Generating key..."
gcloud iam service-accounts keys create $KEY_FILE --iam-account=$SA_EMAIL --project=$PROJECT_ID

Write-Host "=========================================================="
Write-Host "GCP Setup Complete!"
Write-Host "Next steps in GitHub:"
Write-Host "1. Go to your repo -> Settings -> Secrets and variables -> Actions"
Write-Host "2. Add secret 'GCP_PROJECT_ID' with value: $PROJECT_ID"
Write-Host "3. Add secret 'GCP_SA_KEY' with the contents of $KEY_FILE"
Write-Host "4. Push to 'main' branch to trigger GitHub Actions deployment"
Write-Host "=========================================================="
