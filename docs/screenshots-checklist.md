# College Assessment Screenshots Checklist
## AI-Powered AWS Cloud Cost Optimization System

This checklist specifies the exact screens and console views you should capture for your college project report, viva presentation slides, and lab assessment submission.

---

### Screenshot 1: Live Web Dashboard Overview
- **Location**: Web Browser (Chrome / Edge / Firefox)
- **URL**: `http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com`
- **What Must Be Visible**:
  - Top header with Title, Region badge (`Region: ap-south-1`), "Refresh Analysis", "💾 Save to S3", "📄 Download JSON", and "📊 Export CSV" buttons.
  - Data Source Banner showing `Demo / Sample Data Mode` (amber badge) and `Last Retrieval: <Timestamp> (Sample Data)`.
  - Four KPI Metric Cards: Total Monthly Spend ($100.00), Top Cost Driver (Amazon Elastic Compute Cloud - Compute), Potential Savings ($15.79 - $35.79), and Services Analyzed (6).
- **What It Proves**: Proves the web dashboard is live on Amazon S3 and communicating with the serverless backend.

---

### Screenshot 2: Data Visualizations (Charts & Breakdown Table)
- **Location**: Web Browser (Dashboard main view, scroll down)
- **What Must Be Visible**:
  - **Bar Chart**: "Monthly Spend by AWS Service ($)" showing costs for EC2, RDS, S3, CloudWatch, VPC, and Lambda.
  - **Doughnut Chart**: "Spend Share (%)" displaying relative proportional distribution.
  - **Service-Wise Breakdown Table**: Tabular view with service names, formatted costs, percentage shares, and progress indicator bars.
- **What It Proves**: Proves frontend charting (Chart.js) and data binding are working dynamically.

---

### Screenshot 3: Rule-Based Optimization Guidance
- **Location**: Web Browser (Dashboard bottom section)
- **What Must Be Visible**:
  - Filter buttons: "All", "High Priority", "Medium Priority".
  - Recommendation cards for EC2, RDS, S3, CloudWatch with priority badges.
  - Actionable rules with explicit **Conditions/Assumptions** (e.g. "Conditional: Requires CloudWatch metrics review") and **Expected Impacts** (e.g. "Up to 30-50% reduction in hourly instance cost").
- **What It Proves**: Proves the deterministic heuristic recommendation engine meets academic standards and avoids false claims of trained AI.

---

### Screenshot 4: Downloaded Reports (CSV & JSON)
- **Location**: Windows File Explorer / Text Editor (VS Code or Notepad)
- **What Must Be Visible**:
  - Downloaded CSV file (`aws_cost_analysis_YYYY-MM-DD.csv`) opened in Excel or Notepad showing columns: Service, Cost_USD, Percentage_Of_Total.
  - Downloaded JSON report (`aws_cost_analysis_report_YYYY-MM-DD.json`) showing formatted metadata, timestamp, data source status, totals, and recommendations.
- **What It Proves**: Proves user data export capabilities in multiple standard formats.

---

### Screenshot 5: Direct API Response (Browser / Postman / curl)
- **Location**: Browser / PowerShell / Postman
- **URL**: `https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com/cost-analysis`
- **What Must Be Visible**:
  - Raw JSON response returning HTTP 200.
  - Keys: `status: "success"`, `retrieval_timestamp_utc`, `data_source: "demo_data"`, `is_sample_data: true`, `summary`, `service_breakdown`, `recommendations`.
- **What It Proves**: Proves Amazon API Gateway is securely invoking AWS Lambda and returning structured JSON with CORS headers.

---

### Screenshot 6: AWS Lambda Console Configuration
- **Location**: AWS Management Console > Lambda > Functions > `cost-optimization-analyzer`
- **Region**: Asia Pacific (Mumbai) `ap-south-1`
- **What Must Be Visible**:
  - Function name: `cost-optimization-analyzer`.
  - Runtime: `Python 3.12`.
  - Memory: `128 MB`, Timeout: `15 sec`.
  - Execution Role: `AWSLambdaCostOptimizationRole`.
  - Function Overview showing API Gateway trigger attached.
- **What It Proves**: Proves backend compute is deployed natively on AWS Lambda in the designated region.

---

### Screenshot 7: Amazon API Gateway Console
- **Location**: AWS Management Console > API Gateway > APIs > `cost-optimizer-api`
- **What Must Be Visible**:
  - Protocol: HTTP API.
  - Routes tab showing `GET /cost-analysis`, `POST /save-report`, and `GET /health`.
  - CORS configuration showing Allowed Origins (`*`) and Methods (`GET, POST, OPTIONS`).
  - Stage `$default` showing automatic deployment enabled.
- **What It Proves**: Proves serverless API management and routing on AWS API Gateway.

---

### Screenshot 8: Amazon S3 Frontend Hosting Bucket
- **Location**: AWS Management Console > Amazon S3 > Buckets > `cost-optimizer-frontend-226234259454`
- **What Must Be Visible**:
  - Bucket Objects: `index.html`, `app.js`, `styles.css`, `config.js`.
  - Properties tab showing **Static website hosting: Enabled** with Endpoint URL visible.
- **What It Proves**: Proves static frontend files are hosted on AWS S3 without reliance on a local Streamlit server.

---

### Screenshot 9: Amazon S3 Reports Storage Bucket
- **Location**: AWS Management Console > Amazon S3 > Buckets > `cost-optimizer-reports-226234259454`
- **What Must Be Visible**:
  - Bucket name: `cost-optimizer-reports-226234259454`.
  - Region: `ap-south-1`.
  - Block Public Access: Enabled (private storage).
- **What It Proves**: Proves dedicated, secure cloud storage exists for report snapshots.

---

### Screenshot 10: Amazon CloudWatch Logs Console
- **Location**: AWS Management Console > CloudWatch > Log groups > `/aws/lambda/cost-optimization-analyzer`
- **What Must Be Visible**:
  - Log group name `/aws/lambda/cost-optimization-analyzer`.
  - Log streams list with recent timestamps.
  - Inside a log stream: Log events showing `Received event for cost optimization microservice`, `Querying AWS Cost Explorer`, duration (~51 ms), and memory usage without sensitive secrets.
- **What It Proves**: Proves cloud observability, execution tracking, and credential hygiene.

---

### Screenshot 11: AWS Budgets Safety Guardrail
- **Location**: AWS Management Console > Billing and Cost Management > Budgets
- **What Must Be Visible**:
  - Budget Name: `Zero-Cost-Project-Budget`.
  - Amount: `$1.00 USD`.
  - Current Spend: `$0.00 USD` (Healthy status bar).
  - Notifications configured.
- **What It Proves**: Proves strict financial governance and zero unintended cloud spending.

---

### Screenshot 12: Automated Pytest Unit Test Suite
- **Location**: Windows PowerShell Terminal
- **Command**: `python -m pytest tests/test_cost_analyzer.py -v`
- **What Must Be Visible**:
  - 24 tests listed with green `PASSED` tags.
  - Summary: `24 passed in 0.51s`.
- **What It Proves**: Proves comprehensive test-driven development and algorithmic correctness.
