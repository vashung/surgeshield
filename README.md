# SurgeShield — Public Health Disease Outbreak Management

AI-powered dengue outbreak management for district health officers.
Built with Next.js 14, AWS Bedrock Agent, SageMaker, and S3.

---

## Architecture

```
Browser → Next.js API Routes (secure proxy) → AWS Bedrock Agent
                                             → AWS S3 (results)
                                             → AWS SageMaker (pipeline)
```

AWS credentials live only on the server (Vercel env vars). The browser
never touches AWS directly.

---

## Local Development

### 1. Clone and install

```bash
git clone <your-repo>
cd surgeshield
npm install
```

### 2. Create .env.local

```bash
cp .env.example .env.local
```

Fill in your values:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_AGENT_ID=534E9HOLQC
BEDROCK_AGENT_ALIAS_ID=TSTALIASID
S3_BUCKET=surgeshieldai-dengue-data
S3_RESULTS_PREFIX=results/latest/
SAGEMAKER_ROLE_ARN=arn:aws:iam::337834613550:role/your-role
SAGEMAKER_IMAGE_URI=337834613550.dkr.ecr.us-east-1.amazonaws.com/sagemaker-surgeshield-learn:latest
```

### 3. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

---

## Deploy to Vercel

### Option A — Vercel CLI (recommended)

```bash
npm install -g vercel
vercel login
vercel        # follow prompts, creates project
vercel --prod # promote to production
```

### Option B — GitHub integration

1. Push this repo to GitHub
2. Go to vercel.com → Add New Project → Import repo
3. Framework: Next.js (auto-detected)
4. Add environment variables (see below)
5. Click Deploy

### Add environment variables in Vercel

Go to: Project → Settings → Environment Variables

Add every key from .env.example with your real values.
Make sure to set them for Production + Preview + Development.

Then redeploy:
```bash
vercel --prod
```

---

## API Endpoints

| Route | Method | Description |
|---|---|---|
| /api/agent | POST | Proxy to Bedrock Agent |
| /api/capacity | GET | Hospital capacity from S3 |
| /api/predictions | GET | ML predictions from S3 |
| /api/pipeline | POST | Trigger SageMaker job |
| /api/status | GET | Pipeline status from S3 |

---

## IAM Permissions Required

Your AWS_ACCESS_KEY_ID user needs these policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeAgent"],
      "Resource": "arn:aws:bedrock:us-east-1:337834613550:agent-alias/534E9HOLQC/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::surgeshieldai-dengue-data/results/*"
    },
    {
      "Effect": "Allow",
      "Action": ["sagemaker:CreateProcessingJob"],
      "Resource": "*"
    }
  ]
}
```

---

## Project Structure

```
surgeshield/
├── app/
│   ├── layout.tsx          # Root HTML layout
│   ├── page.tsx            # Main dashboard (all 4 tabs)
│   └── api/
│       ├── agent/route.ts      # Bedrock Agent proxy
│       ├── capacity/route.ts   # S3 hospital data
│       ├── predictions/route.ts# S3 predictions
│       ├── pipeline/route.ts   # SageMaker trigger
│       └── status/route.ts     # Pipeline status
├── lib/
│   └── aws.ts              # Shared AWS client instances
├── .env.example            # Safe template (commit this)
├── .env.local              # Real secrets (never commit)
├── vercel.json             # Vercel config
└── next.config.js
```

---

## Data Flow

1. App loads → fetches /api/capacity → reads S3 results/latest/hospital_capacity.json
2. If S3 empty → falls back to mock data (app still works)
3. User triggers pipeline → /api/pipeline → SageMaker job starts (~5 min)
4. SageMaker writes 7 JSON files to S3 results/latest/
5. Next refresh shows live data
6. AI Briefing → /api/agent → Bedrock Agent → Lambda → S3/SageMaker
