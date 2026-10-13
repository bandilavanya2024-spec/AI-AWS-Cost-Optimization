# College Viva Questions & Technical Defense Guide
## AI-Powered AWS Cloud Cost Optimization and Estimation System

This guide provides beginner-friendly, technically accurate questions and answers commonly asked by external examiners and faculty during final college project viva voce presentations.

---

### Category 1: Project Objectives & Dual-Mode Architecture

**Q1: What is the primary objective of this project?**  
**A:** The primary objective is to deliver an enterprise-ready, interactive Cloud Financial Management (FinOps) system deployed natively on AWS. It provides:
1. An **Interactive AWS Cost Estimator & Optimizer** that computes monthly and annual cost projections across six core AWS services (EC2, S3, RDS, Lambda, CloudWatch, VPC) from user inputs and verified AWS On-Demand prices.
2. A **Rule-Based Optimization Recalculator** that evaluates prospective architectural changes (e.g. rightsizing, off-hours scheduling, storage tiering, Graviton2 migration) and recalculates exact savings using the same pricing engine.
3. A **Live AWS Account Telemetry Mode** that inspects actual account spend ($0.00) and ingestion states without fabricating synthetic charges.

**Q2: Why did you build an interactive cost estimator instead of relying solely on AWS Cost Explorer?**  
**A:**
1. **Initial Activation Latency**: When AWS Cost Explorer is activated in a new account, AWS requires up to **24 hours** to complete its initial ETL data aggregation, during which it throws `DataUnavailableException`.
2. **Forward-Looking Architectural Modeling**: Cost Explorer is strictly retrospective (shows past spend). It cannot model "What will my bill be if I deploy 2 EC2 instances, a Multi-AZ database, and a NAT Gateway next week?"
3. **Credential-Free Usability**: The interactive estimator enables college evaluators and students to model and optimize AWS cloud architectures without needing an AWS account or payment card.

**Q3: What AWS services make up the serverless backend, and why?**  
**A:** We use **AWS Lambda**, **Amazon API Gateway (HTTP API v2)**, and **Amazon S3**.
1. **AWS Lambda**: Executes compute logic on demand, billing only for execution milliseconds ($0.00 ongoing idle cost).
2. **Amazon API Gateway**: Routes HTTP requests from the browser to Lambda with low latency and native CORS handling.
3. **Amazon S3**: Hosts static web files (`index.html`, `app.js`, `styles.css`) via Static Website Hosting and provides private bucket storage for archived reports.

---

### Category 2: Pricing Engine & Mathematical Formulas

**Q4: How does your pricing engine calculate Amazon EC2 compute and storage costs?**  
**A:**
- Operating Hours/Month = Hours/Day $\times$ Days/Month.
- Compute Cost = Hourly Instance Rate $\times$ Instance Count $\times$ Operating Hours/Month.
- EBS Storage Cost = Volume Size (GB) $\times$ EBS Rate ($0.088/GB-mo for gp3) $\times$ Instance Count.
- Outbound Data Transfer = Transfer (GB) $\times$ Data Transfer Rate ($0.109/GB).
- Subtotal = Compute + EBS + Data Transfer.

**Q5: How do you calculate AWS Lambda serverless execution charges?**  
**A:**
- Total GB-Seconds = $\text{Requests} \times \left(\frac{\text{Duration (ms)}}{1,000}\right) \times \left(\frac{\text{Allocated Memory (MB)}}{1,024}\right)$.
- When the Free Tier toggle is enabled, we subtract 400,000 free GB-seconds and 1,000,000 free requests.
- Compute Cost = Billed GB-Seconds $\times$ Rate ($0.0000166667 for x86_64, $0.0000133334 for arm64).
- Request Cost = $\left(\frac{\text{Billed Requests}}{1,000,000}\right) \times \$0.20$.

**Q6: What is the cost multiplier for an Amazon RDS Multi-AZ deployment?**  
**A:** In Amazon RDS, Multi-AZ automatically provisions and maintains a synchronous standby replica in a second Availability Zone for high availability failover. AWS doubles both the hourly compute rate and the provisioned storage cost, representing an exact **2.0x cost multiplier**.

**Q7: How do you prevent double-counting between services?**  
**A:** Each service has isolated input parameters and calculating functions. EC2 compute is decoupled from EBS disk storage; Lambda compute is separated from invocation requests; and VPC NAT Gateway uptime ($0.056/hr) is separated from data volume processing ($0.056/GB). The total monthly cost is a pure additive sum of disjoint subtotals.

---

### Category 3: Algorithmic Optimization & Explainability

**Q8: Is this system using a trained machine learning model or neural network?**  
**A:** No. The optimization engine employs a **deterministic, rule-based heuristic recommendation engine** aligned with the AWS Well-Architected Framework (Cost Optimization Pillar).

**Q9: Why is a rule-based engine superior to a deep learning model for cloud financial management?**  
**A:**
1. **Explainability & Financial Auditability**: Financial stakeholders require transparent, deterministic reasoning for budget decisions.
2. **Mathematical Exactness**: AWS pricing follows strict mathematical rate formulas. Neural networks are susceptible to hallucinations, whereas rule-based algorithms recalculate exact dollars and cents.
3. **Zero Operating Overhead**: Hosting an LLM or GPU cluster would cost $20–$100/month, completely defeating the purpose of a zero-cost cloud optimization project.

**Q10: Can you give an example of an optimization rule and how savings are calculated?**  
**A:** For **Automated Non-Production Scheduling (`REC-EC2-SCHED`)**:
- Current: An EC2 instance runs 24 hours/day for 30.5 days = 732 hours/month.
- Suggested: The instance is scheduled to run only during business hours (10 hours/day $\times$ 22 business days = 220 hours/month).
- Recalculation: We re-run the EC2 formula with 220 hours. For a `t3.medium` instance, compute cost drops from $30.45 to $9.15, saving **$21.30/month (70% compute reduction)**.

---

### Category 4: Financial Safety & Academic Integrity

**Q11: How do you guarantee that this college project incurs zero unexpected AWS charges?**  
**A:**
1. We configured an active **AWS Budget** (`Zero-Cost-Project-Budget`) with a $1.00 USD ceiling that triggers email notifications on any breach. Verified actual account spend is **$0.00**.
2. We implemented a 15-minute in-memory cache to prevent repeated paid calls to the AWS Cost Explorer API ($0.01 per query).
3. The interactive estimator runs 100% locally in the browser, making zero billed cloud calls.

**Q12: Why did you remove synthetic sample data from your live AWS billing mode?**  
**A:** Earlier prototypes displayed sample data when Cost Explorer was unavailable. To maintain strict academic integrity and avoid misleading evaluators, Mode 2 now honestly reports that current account spend is $0.00 and explains the 24-hour ingestion window without displaying fabricated numbers.

**Q13: How many automated unit tests protect the project, and what do they verify?**  
**A:** The project contains **42 automated unit tests** in `pytest`:
- 24 tests for Cost Explorer parsing, cache validation, S3 snapshot saving, and error fallbacks.
- 18 tests for the Estimator Engine covering all 6 service formulas, multiple instances, storage classes, Lambda GB-seconds, Free Tier deductions, currency conversions, optimization recalculations, and CSV/JSON export serialization.
- **Pass rate: 100% (42/42 passing in 0.49s).**
