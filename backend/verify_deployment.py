"""
End-to-End Deployed Application Verification Script
Checks live S3 website hosting and live API Gateway endpoints.
"""
import urllib.request
import urllib.error
import json
import sys

def test_url(name, url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    if data:
        encoded_data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    else:
        encoded_data = None

    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            print(f"[PASS] {name}: HTTP {resp.status} - Content length {len(body)}")
            return resp.status, body, resp.headers
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"[FAIL] {name}: HTTP {e.code} - {body[:200]}")
        return e.code, body, e.headers
    except Exception as e:
        print(f"[ERROR] {name}: {e}")
        return 0, str(e), {}

print("=== 1. Testing Deployed Frontend S3 Website ===")
base_s3 = "http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com"

s, body, h = test_url("Frontend HTML", f"{base_s3}/index.html")
assert "AI-Powered AWS Cloud Cost Optimization System" in body, "HTML title/content missing"
assert 'id="tabEstimator"' in body, "Estimator tab missing"
assert 'id="modeEstimatorContainer"' in body, "Estimator container missing"
assert 'id="comparisonModal"' in body, "Comparison modal missing"

s, body, h = test_url("Frontend App JS", f"{base_s3}/app.js")
assert "calculateEstimate" in body, "app.js missing calculateEstimate"
assert "PRICING_DATABASE" in body, "app.js missing PRICING_DATABASE"

s, body, h = test_url("Frontend Config JS", f"{base_s3}/config.js")
assert "qngtx7iz7a" in body, "config.js does not contain API ID"

s, body, h = test_url("Frontend Styles CSS", f"{base_s3}/styles.css")
assert len(body) > 1000, "styles.css empty"

print("\n=== 2. Testing Deployed Backend API Gateway ===")
api_base = "https://qngtx7iz7a.execute-api.ap-south-1.amazonaws.com"

s, body, h = test_url("Health Endpoint", f"{api_base}/health")
assert "healthy" in body, "Health check failed"

s, body, h = test_url("Cost Analysis Endpoint", f"{api_base}/cost-analysis")
assert "data_source" in body and "summary" in body, "Cost analysis failed"

test_payload = {
    "ec2": {"instance_type": "t3.medium", "instances_count": 2, "operating_hours_per_day": 24, "days_per_month": 30},
    "s3": {"storage_class": "Standard", "storage_gb": 150, "put_copy_requests": 5000, "get_other_requests": 50000},
    "currency": "USD"
}
s, body, h = test_url("Estimate Cost Endpoint", f"{api_base}/estimate-cost", method="POST", data=test_payload)
res = json.loads(body)
assert "summary" in res and res["summary"]["total_monthly_cost"] > 0, "Estimate calculation failed"
print(f"   -> Monthly Total Calculated by Live AWS Lambda: ${res['summary']['total_monthly_cost']:.2f}")
print(f"   -> Potential Savings: ${res['summary']['potential_monthly_savings']:.2f} ({res['summary']['savings_percentage']}%)")

s, body, h = test_url("Save Report Endpoint", f"{api_base}/save-report", method="POST", data={"report_name": "AWS-Live-Deployed-Verification", "report_data": res})
res_save = json.loads(body)
assert res_save.get("status") == "success", "Save report failed"
print(f"   -> Report Saved to S3: {res_save.get('s3_uri')}")

print("\n=== ALL END-TO-END DEPLOYMENT CHECKS PASSED SUCCESSFULLY ===")
