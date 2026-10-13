# Test Cases and Verification Report
## AI-Powered AWS Cloud Cost Optimization and Estimation System

This document outlines the test suite, test cases, preconditions, execution steps, expected results, and actual verified outcomes for the AI-Powered AWS Cloud Cost Optimization and Estimation System.

---

## 1. Test Summary Overview

- **Test Framework**: `pytest 9.1.1` on Python 3.14.2 (Windows 11)
- **Total Automated Unit Tests**: 42
- **Passed**: 42
- **Failed**: 0
- **Pass Rate**: 100%
- **Execution Time**: 0.49 seconds
- **AWS API Mocking**: All AWS SDK (`boto3`) calls are mocked using `unittest.mock.MagicMock` and `unittest.mock.patch`, incurring **$0.00 AWS charges** during local testing.

---

## 2. Detailed Test Cases Matrix

### Part A: Cost Analysis & Billing Module Tests (`tests/test_cost_analyzer.py`)

| Test ID | Feature Under Test | Preconditions | Steps | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Total Cost Calculation | Mock cost dict with EC2, S3, Lambda ($50, $25.50, $4.50). | Call `analyze_costs()`. | `total_monthly_cost == 80.00`, formatted as `"$80.00"`. | Total cost calculated as 80.00 and formatted properly. | **PASS** |
| **TC-02** | Service-Wise Cost Breakdown | Input dict with EC2 ($60), S3 ($30), Lambda ($10). | Call `analyze_costs()` and inspect `service_breakdown`. | Sorted descending by cost: EC2 (60%), S3 (30%), Lambda (10%). | Order verified descending; percentage calculation exact. | **PASS** |
| **TC-03** | Highest-Cost Driver Identification | Input with RDS ($75.00), S3 ($15.00), CloudWatch ($10.00). | Call `analyze_costs()` and check `highest_cost_service`. | Identifies RDS as top driver with 75.0% share. | RDS correctly flagged as highest cost service. | **PASS** |
| **TC-04** | Savings Estimate Range & Notice | Input costs with EC2 ($100) and S3 ($50). | Call `analyze_costs()` and inspect `potential_savings_estimate`. | `min_estimate > 0`, notice contains heuristic disclaimer. | Estimated range calculated with non-guaranteed notice. | **PASS** |
| **TC-05** | Retrieval Timestamp & Metadata | Input cost dictionary with sample data. | Call `analyze_costs()` and check top-level keys. | Contains `retrieval_timestamp_utc` ending in `Z`, `data_source`. | ISO UTC timestamp and metadata fields verified. | **PASS** |
| **TC-06** | EC2 Optimization Heuristics | EC2 cost provided ($100). | Call `generate_recommendations_for_service()`. | Priority HIGH, rules include Right-Sizing, Scheduling, Savings Plans. | All 3 EC2 rules generated with conditional criteria. | **PASS** |
| **TC-07** | RDS Optimization Heuristics | RDS cost provided ($80). | Call `generate_recommendations_for_service()`. | Priority HIGH, rules include Single-AZ check and Idle DB detection. | Single-AZ and idle connection checks verified. | **PASS** |
| **TC-08** | S3 Optimization Heuristics | S3 cost provided ($40). | Call `generate_recommendations_for_service()`. | Rules include Lifecycle transitions and Multipart upload abort. | Lifecycle and abort rules generated with expected impact. | **PASS** |
| **TC-09** | CloudWatch Heuristics | CloudWatch cost provided ($20). | Call `generate_recommendations_for_service()`. | Rules flag "Never Expire" log retention and custom metrics. | Log retention and metrics audit rules present. | **PASS** |
| **TC-10** | Lambda Heuristics | Lambda cost provided ($15). | Call `generate_recommendations_for_service()`. | Rules recommend ARM64 (Graviton2) and Power Tuning. | ARM64 migration and memory tuning rules present. | **PASS** |
| **TC-11** | Cost Explorer `DataUnavailable` Fallback | Cost Explorer raises `DataUnavailableException`. | Call `fetch_aws_cost_data(bypass_cache=True)`. | `data_source == 'aws_data_pending_ingestion'`, costs is empty, message explains 24h wait. | Clean fallback without uncaught exceptions or fake data. | **PASS** |
| **TC-12** | Cost Explorer `AccessDenied` Fallback | Cost Explorer raises `AccessDeniedException`. | Call `fetch_aws_cost_data(bypass_cache=True)`. | `data_source == 'aws_permission_required'`, costs is empty. | Graceful fallback with IAM diagnostic message. | **PASS** |
| **TC-13** | Empty Billing Results Handling | Cost Explorer returns empty `Groups: []`. | Call `fetch_aws_cost_data(bypass_cache=True)`. | `data_source == 'live_aws_data'`, message states $0.00 accumulated. | Clean reporting of $0.00 spend. | **PASS** |
| **TC-14** | Live AWS Data Parsing | Mock Cost Explorer returns S3 ($12.50) and Lambda ($3.20). | Call `fetch_aws_cost_data(bypass_cache=True)`. | Returns real amounts, `data_source == 'live_aws_data'`. | Returned live data dictionary and live data label. | **PASS** |
| **TC-15** | In-Memory Cache Protection | Valid data returned on first call. | Call `fetch_aws_cost_data()` twice with `bypass_cache=False`. | Cost Explorer client invoked only once (call_count == 1). | Duplicate API call prevented by 15-minute TTL cache. | **PASS** |
| **TC-16** | S3 Report Save — Success | S3 client mocked. | Call `save_report_to_s3(report_data, bucket_name)`. | Status success, key formatted as `reports/cost_analysis_report_TIMESTAMP.json`. | Report serialized to JSON and stored with unique key. | **PASS** |
| **TC-17** | S3 Report Save — Permission Failure | S3 client raises `AccessDenied`. | Call `save_report_to_s3(...)`. | Returns status error, `error_code == 'AccessDenied'`. | Graceful error dictionary returned without crash. | **PASS** |
| **TC-18** | Lambda CORS Preflight | HTTP OPTIONS request sent to `/cost-analysis`. | Call `lambda_handler(event, None)`. | Returns HTTP 200, headers contain `Access-Control-Allow-Origin: *`. | HTTP 200 returned with preflight CORS headers. | **PASS** |
| **TC-19** | Lambda Health Check Route | HTTP GET `/health`. | Call `lambda_handler(event, None)`. | Returns HTTP 200 with `status: "healthy"`. | Health endpoint returns 200 and healthy JSON. | **PASS** |
| **TC-20** | Lambda Cost Analysis Demo Mode | HTTP GET `/cost-analysis?force_demo=true`. | Call `lambda_handler(event, None)`. | Returns HTTP 200, `data_source == 'demo_data'`. | Full payload returned with sample data flags. | **PASS** |
| **TC-21** | Lambda Save Report Route — Success | HTTP POST `/save-report` with mocked S3 success. | Call `lambda_handler(event, None)`. | Returns HTTP 200, `status == 'success'`, S3 bucket in response. | HTTP 200 returned with S3 storage confirmation. | **PASS** |
| **TC-22** | Lambda Save Report Route — Failure | HTTP POST `/save-report` with mocked S3 failure. | Call `lambda_handler(event, None)`. | Returns HTTP 500, `status == 'error'`. | HTTP 500 returned with structured error JSON. | **PASS** |
| **TC-23** | JSON Download Object Structure | Generate analysis and wrap in export metadata. | Verify metadata and analysis keys. | Contains download timestamp, retrieval timestamp, data source. | Export payload structure satisfies all requirements. | **PASS** |
| **TC-24** | Date Range Helper Boundaries | Date helper execution. | Call `get_cost_explorer_date_range()`. | Start and End are `YYYY-MM-DD`, `Start < End`. | Valid ISO dates conforming to CE rules. | **PASS** |

### Part B: Interactive Estimator Engine Tests (`tests/test_estimator_engine.py`)

| Test ID | Feature Under Test | Preconditions | Steps | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-25** | EC2 Standard Monthly Calculation | `t3.micro`, 1 instance, 24h/day, 30.5 days, 30GB gp3. | Call `calculate_ec2_cost()`. | Compute $7.61 + EBS $2.64 = $10.25. | Correctly calculated as $10.25. | **PASS** |
| **TC-26** | EC2 Multiple Instances & Partial Hours | `t3.medium`, 3 instances, 8h/day, 20 days, 50GB gp3. | Call `calculate_ec2_cost()`. | Compute $19.97 + EBS $13.20 = $33.17. | Subtotal verified exact at $33.17. | **PASS** |
| **TC-27** | EC2 Custom Price Override | Custom rate $0.05/hr, 2 instances, 720h. | Call `calculate_ec2_cost()`. | Subtotal $72.00, source reflects custom override. | Custom hourly rate applied accurately. | **PASS** |
| **TC-28** | S3 Standard Storage & Requests | 200GB Standard, 20k PUT, 100k GET. | Call `calculate_s3_cost()`. | Storage $4.60 + Requests $0.14 = $4.74. | S3 charges combined accurately. | **PASS** |
| **TC-29** | S3 Standard-IA with Retrieval | 500GB Standard-IA, 50GB retrieval. | Call `calculate_s3_cost()`. | Storage $6.25 + Retrieval $0.50 = $6.75+. | Retrieval fee included accurately. | **PASS** |
| **TC-30** | RDS Single-AZ Database Cost | `db.t3.micro`, 730 hrs, 20GB gp3. | Call `calculate_rds_cost()`. | Compute $13.14 + Storage $2.30 = $15.44. | Verified exact at $15.44. | **PASS** |
| **TC-31** | RDS Multi-AZ 2.0x Multiplier | Single-AZ vs Multi-AZ configs. | Call `calculate_rds_cost()` on both. | Multi-AZ cost is exactly 2.0x Single-AZ cost. | Mathematical 2.0x multiplier confirmed. | **PASS** |
| **TC-32** | Lambda Within Free Tier | 500k req, 100ms, 128MB, Free Tier ON. | Call `calculate_lambda_cost()`. | Monthly cost is exactly $0.00. | Free Tier fully offsets usage. | **PASS** |
| **TC-33** | Lambda Beyond Free Tier & ARM64 | 10M req, 300ms, 512MB, x86 vs ARM64. | Call `calculate_lambda_cost()` on both. | ARM64 cost is 20% cheaper than x86_64. | ARM64 Graviton2 20% discount confirmed. | **PASS** |
| **TC-34** | CloudWatch Ingestion & Storage | 20GB Ingest, 30GB Storage, 15 Metrics. | Call `calculate_cloudwatch_cost()`. | Ingest $8.55 + Storage $0.99 + Metrics $1.50 = $11.04. | Verified exact at $11.04. | **PASS** |
| **TC-35** | VPC NAT Gateway & Public IPs | 1 NAT GW, 730h, 100GB data, 1 public IP. | Call `calculate_vpc_cost()`. | Uptime $40.88 + Data $5.60 + IP $3.65 = $50.13. | Subtotal verified exact at $50.13. | **PASS** |
| **TC-36** | Multi-Service Total Estimation | EC2 + S3 + Lambda configured. | Call `estimate_total_costs()`. | Annual cost = Monthly $\times$ 12, zero double counting. | Verified clean aggregation and annual multiplier. | **PASS** |
| **TC-37** | Currency Conversion to INR | Config with currency="INR", rate=83.50. | Call `estimate_total_costs()`. | Total INR = Total USD $\times$ 83.50, symbol is ₹. | Verified currency math and RBI source label. | **PASS** |
| **TC-38** | Empty Service Selection | Empty dictionary passed. | Call `estimate_total_costs()`. | Returns $0.00 total, 0 services, zero errors. | Clean handling of empty state. | **PASS** |
| **TC-39** | EC2 Scheduling Recommendation | 24x7 instance configuration. | Call `estimate_total_costs()`. | Generates `REC-EC2-SCHED`, savings > 0. | Sched recommendation generated with trade-offs. | **PASS** |
| **TC-40** | RDS Multi-AZ Recommendation | Multi-AZ database configuration. | Call `estimate_total_costs()`. | Generates `REC-RDS-AZ`, savings $\ge$ 40%. | RDS recommendation generated with trade-offs. | **PASS** |
| **TC-41** | CSV & JSON Export Serialization | Estimate result generated. | Call `export_estimate_to_json()` and `csv()`. | Valid JSON structure and CSV line items headers. | Valid serialization in both formats. | **PASS** |
| **TC-42** | Lambda Route `POST /estimate-cost` | HTTP POST `/estimate-cost` payload. | Call `lambda_handler(event, None)`. | Status 200, valid estimate summary and CORS headers. | API Gateway proxy integration verified. | **PASS** |

---

## 3. End-to-End Live Integration Tests

| Live Test ID | Target URL | Method | Verified Output | Status |
| :---: | :--- | :--- :--- | :--- | :---: |
| **LIVE-01** | `https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com/health` | GET | `HTTP 200 OK` `{"status": "healthy", "service": "ai-aws-cost-optimization"}` | **VERIFIED** |
| **LIVE-02** | `https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com/cost-analysis` | GET | `HTTP 200 OK` Cost analysis JSON with honest $0.00 spend and 24h ingestion notice. | **VERIFIED** |
| **LIVE-03** | `https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com/cost-analysis` | OPTIONS | `HTTP 204 No Content` with `Access-Control-Allow-Origin: *`. | **VERIFIED** |
| **LIVE-04** | `http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com` | GET | `HTTP 200 OK` Serving static dashboard HTML, JS, CSS, Chart.js. | **VERIFIED** |
| **LIVE-05** | `https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com/save-report` | POST | `HTTP 200 OK` Snapshot generated & saved to `s3://cost-optimizer-reports-226234259454/reports/`. | **VERIFIED** |
| **LIVE-06** | `s3://cost-optimizer-reports-226234259454/reports/` | S3 API | Report object verified (10,687 bytes), bucket verified 100% private with Public Access Block enabled. | **VERIFIED** |
| **LIVE-07** | `/aws/lambda/cost-optimization-analyzer` | Logs API | CloudWatch log stream verified capturing execution without unhandled exceptions. | **VERIFIED** |
