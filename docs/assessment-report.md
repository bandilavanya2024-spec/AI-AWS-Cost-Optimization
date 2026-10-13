# A PROJECT REPORT ON
# AI-POWERED AWS CLOUD COST OPTIMIZATION SYSTEM

---

### [College / Institute Name Placeholder]
### Department of Computer Science & Engineering / Information Technology
### Academic Year: 2026–2027

**Submitted by:**
- **Candidate Name**: [Student Name Placeholder]
- **Roll / Registration Number**: [Roll Number Placeholder]

**Under the Guidance of:**
- **Project Supervisor**: [Internal Guide Name Placeholder]
- **Designation**: [Assistant Professor / Associate Professor]

---

## ABSTRACT

Cloud computing provides elastic, on-demand scalability, but unmonitored infrastructure routinely leads to substantial financial waste through idle resources, oversized compute instances, and unbounded storage accumulation. This project presents the design, development, and live deployment of the **AI-Powered AWS Cloud Cost Optimization System**, an enterprise-ready, serverless FinOps application deployed natively on Amazon Web Services (AWS) in the Mumbai region (`ap-south-1`).

The application integrates with the **AWS Cost Explorer API** via the Python SDK (`boto3`) to retrieve granular monthly expenditures grouped by service dimension. To prevent excessive programmatic billing ($0.01 per API request), the system introduces a 15-minute in-memory caching mechanism alongside a graceful fallback engine that handles un-ingested account telemetry (`DataUnavailableException`) without disrupting evaluation. The core analytics engine applies deterministic rule-based heuristics aligned with the AWS Well-Architected Framework (Cost Optimization Pillar) across Amazon EC2, RDS, S3, CloudWatch, Lambda, and VPC networking. 

The user interface is hosted as an Amazon S3 static website, rendering interactive Chart.js visualizations, metric summary cards, priority-filtered remediation rules, CSV/JSON report downloads, and user-triggered S3 report archival via Amazon API Gateway HTTP API v2. A proactive spending guardrail configured in AWS Budgets enforces a $1.00 USD spending limit, ensuring zero accidental charges.

---

## TABLE OF CONTENTS
1. Introduction
2. Problem Statement
3. Objectives of the Project
4. Project Scope
5. Existing System vs. Proposed System
6. System Requirements
7. System Architecture & Design
8. AWS Cloud Services Employed
9. Subsystem Implementation
10. Verification and Testing
11. Screenshots of Live Implementation
12. Financial and Cost Analysis
13. Limitations of the System
14. Future Enhancements
15. Conclusion
16. References

---

## 1. INTRODUCTION

Cloud Financial Management (FinOps) is a cultural practice and operational discipline that brings financial accountability to variable cloud spending models. In modern cloud architectures, developers can provision compute and database resources in seconds. However, without automated monitoring and continuous governance, cloud expenditures frequently exceed organizational budgets.

This project delivers an automated cloud cost optimization dashboard that analyzes live AWS billing metrics, isolates primary cost drivers, formulates transparent rule-based optimization guidance, and estimates potential savings ranges without requiring manual inspection of AWS billing consoles.

---

## 2. PROBLEM STATEMENT

Organizations adopting AWS face several financial challenges:
1. **Lack of Transparency**: AWS billing reports contain thousands of line items, making it difficult for stakeholders to identify top cost drivers.
2. **Idle & Over-Provisioned Resources**: Instances are often configured with buffer capacity that is never utilized.
3. **Unbounded Storage Growth**: Logs in Amazon CloudWatch and objects in Amazon S3 often have no lifecycle rules, causing cumulative cost escalation.
4. **Complexity of Cloud APIs**: Accessing programmatic billing requires handling authentication, rate limits, rate costs ($0.01/call), and ingestion lag times.

---

## 3. OBJECTIVES OF THE PROJECT

1. **Serverless Cloud Architecture**: Implement a 100% serverless, zero-maintenance backend on AWS Lambda and Amazon API Gateway.
2. **Programmatic Billing Integration**: Connect to AWS Cost Explorer using Python `boto3` for automated spend retrieval.
3. **Transparent Heuristic Recommendations**: Develop explainable, rule-based algorithms that provide actionable rightsizing and lifecycle guidance with estimated potential savings.
4. **Resilient Error Handling**: Gracefully handle `DataUnavailableException` and permission boundaries with clearly labeled sample data.
5. **Zero-Server Web Dashboard**: Host a responsive web UI on Amazon S3 with interactive Chart.js visualizations.
6. **Financial Safety Guardrail**: Configure AWS Budgets alerts to protect against unintended spending.

---

## 4. PROJECT SCOPE

- **In Scope**:
  - Service-level cost breakdown across all AWS services.
  - Identification of highest-cost service driver.
  - Heuristic recommendations for EC2, RDS, S3, CloudWatch, Lambda, and VPC.
  - Estimated potential savings calculation.
  - Report downloads in CSV and formatted JSON formats.
  - Explicit user-triggered archival to Amazon S3 reports bucket.
  - AWS Budgets threshold alerting.
- **Out of Scope**:
  - Automated deletion or downsizing of live AWS resources without human review.
  - Direct deep learning neural network training (unnecessary compute costs).

---

## 5. EXISTING SYSTEM VS. PROPOSED SYSTEM

| Parameter | Existing System (Traditional / Manual) | Proposed System (This Project) |
| :--- | :--- | :--- |
| **Analysis Method** | Manual review of AWS Bills or Cost Explorer Console | Automated API-driven serverless ingestion |
| **Recommendation Engine** | Human intuition or costly third-party SaaS | Deterministic, transparent rule-based heuristics |
| **Operational Overhead** | Requires dedicated server or local machine running | 100% serverless, zero server maintenance |
| **Cost Transparency** | Raw numbers without clear remediation guidance | Quantified savings ranges with explicit assumptions |
| **Account Safety** | Reactive bill shock at end of month | Proactive AWS Budgets email alerting ($1.00 limit) |

---

## 6. SYSTEM REQUIREMENTS

### 6.1 Hardware Requirements
- **Development Workstation**: Standard PC (Windows 11 / macOS / Linux), 4 GB RAM, 10 GB disk space.
- **Client Device**: Any device with a modern web browser (Chrome, Edge, Firefox, Safari).

### 6.2 Software & Cloud Requirements
- **Programming Language**: Python 3.12 / 3.14
- **Libraries**: `boto3 >= 1.34.0`, `pytest >= 8.0.0`
- **Frontend**: HTML5, Tailwind CSS, Chart.js 4.x
- **Cloud Provider**: Amazon Web Services (AWS)
- **Deployment Region**: `ap-south-1` (Asia Pacific - Mumbai)

---

## 7. SYSTEM ARCHITECTURE & DESIGN

The application implements a decoupled, serverless microservice architecture:

```
[User Browser]
       │ (HTTP GET)
       ▼
[Amazon S3 Static Website Hosting] ─── (Displays Dashboard UI)
       │ (Fetch API Request)
       ▼
[Amazon API Gateway HTTP API v2] ─── (CORS Enabled)
       │ (Payload v2.0 Proxy)
       ▼
[AWS Lambda (Python 3.12 Backend)]
  ├── In-Memory Cache (15-min TTL)
  ├── AWS Cost Explorer API (ce:GetCostAndUsage)
  ├── Rule-Based Optimization Engine
  └── Optional S3 Archival (s3:PutObject)
       │
       ├──► [Amazon CloudWatch Logs] (Sanitized audit trails)
       └──► [Amazon S3 Reports Storage] (cost-optimizer-reports bucket)
```

---

## 8. AWS CLOUD SERVICES EMPLOYED

1. **AWS Lambda**: Executes backend cost analysis logic on demand with sub-second billing.
2. **Amazon API Gateway (HTTP v2)**: Routes HTTP requests from the browser to Lambda with low latency and native CORS support.
3. **Amazon S3**: Hosts static web files (`index.html`, `app.js`, `styles.css`, `config.js`) and stores archived report snapshots.
4. **AWS Cost Explorer**: Programmatic billing API providing month-to-date unblended service expenditures.
5. **Amazon CloudWatch**: Centralized log aggregation capturing function execution times and error diagnostics without credential exposure.
6. **AWS Budgets**: Automated spending threshold tracking configured with a $1.00 USD safety limit.

---

## 9. SUBSYSTEM IMPLEMENTATION

### 9.1 Backend & Analytics Engine
- **Module**: `backend/cost_analyzer.py`
- Implements `fetch_aws_cost_data()` with date boundary computation, in-memory caching, and exception catching (`DataUnavailableException`, `AccessDeniedException`).
- Implements `analyze_costs()` which aggregates total spend, computes percentage distributions, identifies top cost drivers, and compiles service recommendations.
- Implements `save_report_to_s3()` for user-triggered snapshot storage with unique timestamped keys.

### 9.2 API Gateway Integration
- **Module**: `backend/lambda_function.py`
- Dispatches routes: `GET /cost-analysis`, `POST /save-report`, `GET /health`, and `OPTIONS`.
- Guarantees standard CORS headers on every response.

### 9.3 Frontend User Interface
- **Modules**: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`
- Renders KPI metric cards, Chart.js bar and doughnut charts, service breakdown table with progress bars, priority-filtered recommendation cards, and CSV/JSON export handlers.

---

## 10. VERIFICATION AND TESTING

### 10.1 Unit Testing Suite
- Executed using `pytest 9.1.1`.
- **24 automated unit tests** covering:
  - Total expenditure calculation.
  - Descending service sorting and percentage distribution.
  - Top cost driver selection.
  - Savings range estimations.
  - Heuristics across EC2, RDS, S3, CloudWatch, Lambda, and VPC.
  - Cost Explorer error handling and sample data fallback.
  - In-memory cache hit behavior.
  - S3 report storage success and permission failure handling.
  - Lambda CORS headers and routing.
- **Result**: **24 passed in 0.51s (100% pass rate)**.

---

## 11. SCREENSHOTS OF LIVE IMPLEMENTATION

*(Attach corresponding screenshots here during submission)*
- **Figure 1**: Web Dashboard Overview with Total Spend and Data Source Status Banner.
- **Figure 2**: Spend by AWS Service Bar Chart and Proportional Doughnut Chart.
- **Figure 3**: Actionable Rule-Based Optimization Recommendations Table.
- **Figure 4**: AWS Lambda Console (`cost-optimization-analyzer` configuration).
- **Figure 5**: Amazon API Gateway Console (`cost-optimizer-api` routes and CORS).
- **Figure 6**: Amazon S3 Console (Frontend hosting bucket properties).
- **Figure 7**: Amazon CloudWatch Logs Console (Log streams and request metrics).
- **Figure 8**: AWS Budgets Console (`Zero-Cost-Project-Budget` $1.00 limit).
- **Figure 9**: Pytest Test Execution Terminal Output (24 tests passing).

---

## 12. FINANCIAL AND COST ANALYSIS

| Service | Free Tier Allowance | Project Consumption | Total Incurred Charge |
| :--- | :--- | :--- | :---: |
| AWS Lambda | 1,000,000 requests/month free | < 500 requests | $0.00 |
| Amazon S3 (Hosting) | 5 GB storage free | < 2 MB | $0.00 |
| Amazon API Gateway | 1,000,000 calls free | < 500 requests | $0.00 |
| Amazon CloudWatch | 5 GB log ingestion free | < 5 MB | $0.00 |
| AWS Budgets | 2 budgets 100% free | 1 budget active | $0.00 |
| AWS Cost Explorer API | $0.01 per query | Caching + fallback limits queries | < $0.02 |
| **Total Project Expenditure** | — | — | **< $0.05 (< ₹5 INR)** |

---

## 13. LIMITATIONS OF THE SYSTEM

1. **Billing Ingestion Latency**: AWS Cost Explorer has an intrinsic 24-hour ingestion delay. Real-time per-second billing is not supported by AWS.
2. **Conditional Rightsizing Assumptions**: Instance-level rightsizing recommendations are conditional heuristics based on billing proportion. Fine-grained CPU and RAM metrics require CloudWatch agent deployment on individual EC2 instances.
3. **No Automatic Destructive Actions**: The system does not automatically terminate or downsize resources, requiring human review to prevent accidental service interruption.

---

## 14. FUTURE ENHANCEMENTS

1. **Integration with CloudWatch Agent Metrics**: Ingest per-minute CPU and memory telemetry to provide guaranteed instance rightsizing calculations.
2. **Automated Remediation Workflows**: Implement AWS Systems Manager automation runbooks allowing users to execute recommended actions directly from the dashboard.
3. **Multi-Account AWS Organizations Support**: Aggregate billing data across linked member accounts in an AWS Organization.

---

## 15. CONCLUSION

The **AI-Powered AWS Cloud Cost Optimization System** successfully demonstrates a modern, serverless cloud financial management solution. By leveraging AWS Lambda, Amazon API Gateway, and Amazon S3, the system operates with zero ongoing maintenance costs while providing clear, transparent, and actionable cost optimization intelligence. The deterministic rule-based heuristic engine ensures complete explainability, making it ideal for academic evaluation and enterprise cloud governance.

---

## 16. REFERENCES

1. Amazon Web Services, "AWS Well-Architected Framework: Cost Optimization Pillar", AWS Whitepapers, 2024.
2. FinOps Foundation, "FinOps Framework: Principles and Phases", FinOps.org, 2023.
3. Boto3 Documentation, "Cost Explorer Client Documentation", AWS SDK for Python, 2024.
4. Chart.js Documentation, "Open Source HTML5 Charts", Chartjs.org, 2024.
