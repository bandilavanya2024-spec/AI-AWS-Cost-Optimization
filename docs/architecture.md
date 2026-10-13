# System Architecture: AI-Powered AWS Cloud Cost Optimization System

## 1. System Overview

The **AI-Powered AWS Cloud Cost Optimization System** is a serverless, cloud-native FinOps platform designed to analyze AWS cloud expenditures, identify primary cost drivers, formulate actionable rule-based cost reduction recommendations, and archive report snapshots on demand.

---

## 2. Verified Cloud Resources (Region: ap-south-1)

| Layer | Service | Identifier / ARN | Live Status |
| :--- | :--- | :--- | :---: |
| **Frontend UI** | Amazon S3 (Website Hosting) | `cost-optimizer-frontend-226234259454`<br>URL: [http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com](http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com) | **VERIFIED** |
| **API Gateway** | Amazon API Gateway (HTTP v2) | `qngtx7iz7a`<br>URL: [https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com](https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com)<br>Routes: `GET /cost-analysis`, `POST /save-report`, `GET /health` | **VERIFIED** |
| **Backend Compute** | AWS Lambda (Python 3.12) | `arn:aws:lambda:ap-south-1:226234259454:function:cost-optimization-analyzer` | **VERIFIED** |
| **Execution Role** | AWS IAM | `arn:aws:iam::226234259454:role/AWSLambdaCostOptimizationRole` | **VERIFIED** |
| **Reports Storage** | Amazon S3 | `arn:aws:s3:::cost-optimizer-reports-226234259454` | **VERIFIED** |
| **Telemetry & Logs** | Amazon CloudWatch Logs | `/aws/lambda/cost-optimization-analyzer` | **VERIFIED** |
| **Spending Safety** | AWS Budgets | `Zero-Cost-Project-Budget` ($1.00 USD Limit, Verified $0.00 Spend) | **VERIFIED** |

---

## 3. End-to-End Architecture Diagram

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Layer (Client Browser)"]
        Browser["Responsive Web Dashboard\n(HTML5, TailwindCSS, Chart.js)"]
    end

    subgraph HostingLayer["Static Hosting & Storage (Amazon S3)"]
        S3Web["Amazon S3 Static Website\n(Bucket: cost-optimizer-frontend-226234259454)"]
        S3Reports["Amazon S3 Reports Storage\n(Bucket: cost-optimizer-reports-226234259454)"]
    end

    subgraph APILayer["API Gateway (HTTP v2)"]
        APIGW["Amazon API Gateway\nEndpoint: qngtx7iz7a.execute-api.ap-south-1\nRoutes: GET /cost-analysis, POST /save-report, GET /health"]
    end

    subgraph ComputeLayer["Serverless Compute & Heuristic Engine"]
        Lambda["AWS Lambda Function (Python 3.12)\nMemory: 128 MB | Timeout: 15s"]
        Cache["In-Memory Cache (TTL: 15 Minutes)\nPrevents Repeated $0.01 API Calls"]
        RuleEngine["Deterministic Rule Engine\n(EC2, S3, RDS, CloudWatch, Lambda, VPC)"]
    end

    subgraph AWSDataSources["AWS Cloud Billing & Telemetry"]
        CE["AWS Cost Explorer API\nce:GetCostAndUsage (Daily/Monthly)"]
        CW["Amazon CloudWatch Logs\n/aws/lambda/cost-optimization-analyzer"]
        Budgets["AWS Budgets\nSpending Guardrail Alert ($1.00 Limit)"]
    end

    Browser -->|1. Load Static UI| S3Web
    Browser -->|2. GET /cost-analysis| APIGW
    Browser -.->|2a. POST /save-report (User Clicked)| APIGW
    APIGW -->|3. Invoke Function| Lambda
    Lambda --> Cache
    Lambda -->|4. Query Real Spend| CE
    Lambda -.->|4a. Fallback if DataUnavailable| RuleEngine
    Lambda -->|5. Apply Heuristics| RuleEngine
    Lambda -.->|6. Store Snapshot on Demand| S3Reports
    Lambda -->|7. Audit Logs (Sanitized)| CW
    Lambda -->|8. Structured JSON Response + CORS| APIGW
    APIGW -->|9. Render Metrics & Recommendations| Browser
```

---

## 4. Academic Framing: Heuristic Rules vs. Machine Learning

### Why Deterministic Heuristics?
In real-world cloud financial management (FinOps), recommendations must be:
1. **Explainable and Auditable**: Cloud engineers need to understand exactly *why* an action is recommended.
2. **Deterministic**: Cloud pricing follows strict mathematical formulas published by AWS. Applying rule-based heuristics ensures predictable recommendations.
3. **Low Cost**: Running generative AI or large neural networks for basic cost breakdown creates unnecessary compute bills ($10–$50/month), contradicting the goal of cost optimization.

### Clarification of Capabilities:
- The system uses **transparent, rule-based algorithmic heuristics**.
- It does **not** claim to be a trained black-box neural network or deep learning model.
- Because instance-level CloudWatch metrics (e.g., per-minute CPU/RAM utilization) require specialized CloudWatch agent deployment, rightsizing recommendations are **conditional heuristics** based on billing shares and published AWS best practices, clearly labeled with their underlying assumptions.

---

## 5. Security & Least Privilege

1. **Zero Hardcoded Credentials**:
   - The application codebase contains zero API keys or secrets.
   - All cloud communications use AWS IAM execution roles and service principals.
2. **Sensitive Data Protection**:
   - CloudWatch logs only record request timestamps, counts, and service classifications.
   - Account numbers and secret keys are never emitted in API responses or logs.
3. **CORS Governance**:
   - Standard HTTP CORS headers allow cross-origin requests from the hosted S3 dashboard while restricting methods to `GET, POST, OPTIONS`.
