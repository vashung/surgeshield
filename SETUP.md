# SurgeShield AI Agent - Setup Guide

## Project Structure

The project follows Next.js 14+ conventions with the following structure:

```
surgeshield/
├── app/                    # Next.js app directory (routes and pages)
│   ├── api/               # API routes (server-side endpoints)
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Home page
├── components/            # React components
├── lib/                   # Utility libraries and AWS SDK clients
│   └── aws.ts            # AWS service clients (Bedrock, S3, SageMaker)
├── types/                 # TypeScript type definitions
│   └── index.ts          # Core data types
├── public/               # Static assets
├── .env.local            # Environment variables (DO NOT COMMIT)
├── .env.local.template   # Template for environment variables
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Dependencies

### Core Dependencies
- **Next.js 14.2.5**: React framework with App Router
- **React 18**: UI library
- **TypeScript 5**: Type safety

### AWS SDK Dependencies
- **@aws-sdk/client-bedrock-agent-runtime**: For invoking AWS Bedrock Agent
- **@aws-sdk/client-s3**: For retrieving data from S3
- **@aws-sdk/client-sagemaker**: For ML pipeline integration

### Development Dependencies
- **Vitest**: Testing framework
- **@vitest/ui**: Test UI for development

## Environment Configuration

### Required Environment Variables

Copy `.env.local.template` to `.env.local` and fill in your AWS credentials:

```bash
cp .env.local.template .env.local
```

Then edit `.env.local` with your actual values:

- **AWS_REGION**: AWS region (e.g., us-east-1)
- **AWS_ACCESS_KEY_ID**: Your AWS access key
- **AWS_SECRET_ACCESS_KEY**: Your AWS secret key
- **BEDROCK_AGENT_ID**: Your Bedrock Agent ID
- **BEDROCK_AGENT_ALIAS_ID**: Your Bedrock Agent Alias ID
- **S3_BUCKET**: S3 bucket name for data storage
- **S3_RESULTS_PREFIX**: Prefix for results in S3 (default: results/latest/)
- **SAGEMAKER_ROLE_ARN**: IAM role ARN for SageMaker
- **SAGEMAKER_IMAGE_URI**: Docker image URI for SageMaker

### Security Notes

⚠️ **IMPORTANT**: 
- Never commit `.env.local` to version control
- All AWS credentials remain server-side only
- The browser never accesses AWS credentials directly
- API routes in `app/api/` handle all AWS service calls

## Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (see above)

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## AWS Services Setup

Before running the application, ensure you have:

1. **AWS Bedrock Agent** configured with:
   - Action groups for data retrieval
   - Appropriate IAM permissions
   - Foundation model selected (e.g., Claude 3)

2. **S3 Bucket** with:
   - Hospital capacity data at `results/latest/hospital_capacity.json`
   - ML forecasts at `results/latest/predictions_7day.json` and `predictions_14day.json`
   - Pipeline status at `results/latest/pipeline_status.json`
   - Environmental data at `results/latest/environmental_data.json`

3. **SageMaker Pipeline** (optional):
   - Configured for ML model training and predictions
   - Writes results to S3 bucket

## Next Steps

- Implement API routes in `app/api/`
- Build frontend components in `components/`
- Add tests in `*.test.ts` files
- Configure Bedrock Agent action groups
- Set up S3 data pipeline

## Support

For issues or questions, refer to:
- [Next.js Documentation](https://nextjs.org/docs)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
