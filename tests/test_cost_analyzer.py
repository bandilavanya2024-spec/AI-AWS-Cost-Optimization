"""
Unit Tests for AI-Powered AWS Cloud Cost Optimization System
Uses pytest and unittest.mock to test all calculations, heuristic rules,
fallback behaviors, S3 report archiving, and Lambda responses without touching real AWS services.
"""

import json
from unittest.mock import MagicMock, patch
import pytest
from botocore.exceptions import ClientError

from backend.cost_analyzer import (
    SAMPLE_COST_DATA,
    analyze_costs,
    clear_cache,
    fetch_aws_cost_data,
    generate_recommendations_for_service,
    get_cost_explorer_date_range,
    save_report_to_s3,
)
from backend.lambda_function import lambda_handler


@pytest.fixture(autouse=True)
def run_before_each_test():
    """Clear the in-memory cache before each test to ensure test isolation."""
    clear_cache()
    yield
    clear_cache()


# ==========================================
# 1. Calculation & Analysis Tests
# ==========================================

def test_total_cost_calculation():
    """Verify that total cost is correctly summed and formatted."""
    input_costs = {
        "Amazon Elastic Compute Cloud - Compute": 50.0,
        "Amazon Simple Storage Service": 25.50,
        "AWS Lambda": 4.50
    }
    result = analyze_costs(input_costs, "live_aws_data", "Live data active")
    
    assert result["summary"]["total_monthly_cost"] == 80.0
    assert result["summary"]["total_cost_formatted"] == "$80.00"
    assert result["summary"]["services_analyzed_count"] == 3


def test_service_wise_cost_breakdown():
    """Verify service-wise percentage breakdown and descending sort order."""
    input_costs = {
        "AWS Lambda": 10.0,
        "Amazon Elastic Compute Cloud - Compute": 60.0,
        "Amazon Simple Storage Service": 30.0
    }
    result = analyze_costs(input_costs, "live_aws_data", "Live data active")
    breakdown = result["service_breakdown"]

    # Must be sorted descending by cost
    assert breakdown[0]["service_name"] == "Amazon Elastic Compute Cloud - Compute"
    assert breakdown[0]["cost"] == 60.0
    assert breakdown[0]["percentage_of_total"] == 60.0

    assert breakdown[1]["service_name"] == "Amazon Simple Storage Service"
    assert breakdown[1]["cost"] == 30.0
    assert breakdown[1]["percentage_of_total"] == 30.0

    assert breakdown[2]["service_name"] == "AWS Lambda"
    assert breakdown[2]["cost"] == 10.0
    assert breakdown[2]["percentage_of_total"] == 10.0


def test_highest_cost_service_identification():
    """Verify that the single highest-cost service is accurately identified."""
    input_costs = {
        "Amazon Simple Storage Service": 15.0,
        "Amazon Relational Database Service": 75.0,
        "AmazonCloudWatch": 10.0
    }
    result = analyze_costs(input_costs, "live_aws_data", "Live data active")
    highest = result["summary"]["highest_cost_service"]

    assert highest["service_name"] == "Amazon Relational Database Service"
    assert highest["cost"] == 75.0
    assert highest["cost_formatted"] == "$75.00"
    assert highest["percentage_of_total"] == 75.0


def test_savings_estimates_and_notice():
    """Verify that potential savings are calculated as ranges and contain disclaimers."""
    input_costs = {
        "Amazon Elastic Compute Cloud - Compute": 100.0,
        "Amazon Simple Storage Service": 50.0
    }
    result = analyze_costs(input_costs, "live_aws_data", "Live data active")
    savings = result["summary"]["potential_savings_estimate"]

    # EC2 (min 20, max 40) + S3 (min 7.5, max 17.5) -> min: 27.5, max: 57.5
    assert savings["min_estimate"] > 0
    assert savings["max_estimate"] > savings["min_estimate"]
    assert savings["midpoint_estimate"] > 0
    assert "$" in savings["display_text"]
    # Check that it is explicitly labeled as non-guaranteed estimates
    assert "heuristic estimates" in savings["notice"].lower()


def test_retrieval_timestamp_and_metadata():
    """Verify that analysis results contain retrieval timestamp and data source metadata."""
    input_costs = {"AWS Lambda": 5.0}
    result = analyze_costs(input_costs, "demo_data", "Demo data fallback")

    assert "retrieval_timestamp_utc" in result
    assert result["retrieval_timestamp_utc"].endswith("Z")
    assert result["data_source"] == "demo_data"
    assert result["is_sample_data"] is True
    assert "Demo" in result["data_source_label"]


# ==========================================
# 2. Rule-Based Heuristic Tests
# ==========================================

def test_ec2_recommendation_rules():
    """Verify EC2 heuristics include rightsizing, scheduling, and conditional tags."""
    rec = generate_recommendations_for_service("Amazon Elastic Compute Cloud - Compute", 100.0, 200.0)
    
    assert rec["priority"] == "HIGH"
    titles = [rule["title"] for rule in rec["actionable_rules"]]
    assert any("Right-Sizing" in t for t in titles)
    assert any("Scheduling" in t for t in titles)
    assert any("Savings Plans" in t for t in titles)
    # Ensure condition is explicitly mentioned
    for rule in rec["actionable_rules"]:
        assert "condition" in rule
        assert len(rule["condition"]) > 0


def test_rds_recommendation_rules():
    """Verify RDS heuristics include Single-AZ and idle instance checks."""
    rec = generate_recommendations_for_service("Amazon Relational Database Service", 80.0, 100.0)
    
    assert rec["priority"] == "HIGH"
    titles = [rule["title"] for rule in rec["actionable_rules"]]
    assert any("Single-AZ" in t for t in titles)
    assert any("Idle Database" in t for t in titles)


def test_s3_recommendation_rules():
    """Verify S3 heuristics include lifecycle rules and multipart abort."""
    rec = generate_recommendations_for_service("Amazon Simple Storage Service", 40.0, 100.0)
    
    titles = [rule["title"] for rule in rec["actionable_rules"]]
    assert any("Lifecycle" in t for t in titles)
    assert any("Multipart" in t for t in titles)


def test_cloudwatch_recommendation_rules():
    """Verify CloudWatch heuristics flag unbounded log retention."""
    rec = generate_recommendations_for_service("AmazonCloudWatch", 20.0, 100.0)
    
    titles = [rule["title"] for rule in rec["actionable_rules"]]
    assert any("Log Group Retention" in t for t in titles)


def test_lambda_recommendation_rules():
    """Verify Lambda heuristics suggest ARM64 and power tuning."""
    rec = generate_recommendations_for_service("AWS Lambda", 15.0, 100.0)
    
    titles = [rule["title"] for rule in rec["actionable_rules"]]
    assert any("ARM64" in t for t in titles)
    assert any("Memory Optimization" in t for t in titles)


# ==========================================
# 3. AWS Error Handling & Fallback Tests
# ==========================================

@patch("boto3.client")
def test_data_unavailable_exception_fallback(mock_boto_client):
    """When Cost Explorer returns DataUnavailableException, report pending ingestion and zero charges."""
    mock_ce = MagicMock()
    mock_boto_client.return_value = mock_ce

    error_response = {
        "Error": {
            "Code": "DataUnavailableException",
            "Message": "Data is not available for this account yet."
        }
    }
    mock_ce.get_cost_and_usage.side_effect = ClientError(error_response, "GetCostAndUsage")

    costs, data_source, msg = fetch_aws_cost_data(bypass_cache=True)

    assert data_source == "aws_data_pending_ingestion"
    assert "24 hours" in msg
    assert costs == {}


@patch("boto3.client")
def test_access_denied_exception_fallback(mock_boto_client):
    """When Cost Explorer returns AccessDeniedException, report permission required without fake data."""
    mock_ce = MagicMock()
    mock_boto_client.return_value = mock_ce

    error_response = {
        "Error": {
            "Code": "AccessDeniedException",
            "Message": "User is not authorized to perform: ce:GetCostAndUsage"
        }
    }
    mock_ce.get_cost_and_usage.side_effect = ClientError(error_response, "GetCostAndUsage")

    costs, data_source, msg = fetch_aws_cost_data(bypass_cache=True)

    assert data_source == "aws_permission_required"
    assert "ce:GetCostAndUsage" in msg
    assert costs == {}


@patch("boto3.client")
def test_empty_results_fallback(mock_boto_client):
    """When Cost Explorer returns 0 charges (empty groups), report honest $0.00 live spend."""
    mock_ce = MagicMock()
    mock_boto_client.return_value = mock_ce

    mock_ce.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-10-01", "End": "2026-10-14"},
                "Groups": []
            }
        ]
    }

    costs, data_source, msg = fetch_aws_cost_data(bypass_cache=True)

    assert data_source == "live_aws_data"
    assert "No billed charges have accumulated" in msg
    assert costs == {}


@patch("boto3.client")
def test_live_aws_data_success(mock_boto_client):
    """When Cost Explorer returns valid data, identify as live_aws_data."""
    mock_ce = MagicMock()
    mock_boto_client.return_value = mock_ce
    
    mock_ce.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "TimePeriod": {"Start": "2026-10-01", "End": "2026-10-14"},
                "Groups": [
                    {
                        "Keys": ["Amazon Simple Storage Service"],
                        "Metrics": {"UnblendedCost": {"Amount": "12.50", "Unit": "USD"}}
                    },
                    {
                        "Keys": ["AWS Lambda"],
                        "Metrics": {"UnblendedCost": {"Amount": "3.20", "Unit": "USD"}}
                    }
                ]
            }
        ]
    }

    costs, data_source, msg = fetch_aws_cost_data(bypass_cache=True)

    assert data_source == "live_aws_data"
    assert costs["Amazon Simple Storage Service"] == 12.50
    assert costs["AWS Lambda"] == 3.20
    assert "Live billing metrics" in msg


# ==========================================
# 4. In-Memory Cache Verification
# ==========================================

@patch("boto3.client")
def test_in_memory_cache_prevents_api_charges(mock_boto_client):
    """Calling fetch twice should hit Cost Explorer API only once when cache is valid."""
    mock_ce = MagicMock()
    mock_boto_client.return_value = mock_ce
    
    mock_ce.get_cost_and_usage.return_value = {
        "ResultsByTime": [
            {
                "Groups": [
                    {
                        "Keys": ["AWS Lambda"],
                        "Metrics": {"UnblendedCost": {"Amount": "5.00", "Unit": "USD"}}
                    }
                ]
            }
        ]
    }

    # First call - hits API
    costs1, src1, _ = fetch_aws_cost_data(bypass_cache=False)
    # Second call - hits in-memory cache
    costs2, src2, _ = fetch_aws_cost_data(bypass_cache=False)

    assert mock_ce.get_cost_and_usage.call_count == 1
    assert costs1 == costs2
    assert src1 == src2 == "live_aws_data"


# ==========================================
# 5. S3 Report Storage Tests
# ==========================================

@patch("boto3.client")
def test_save_report_to_s3_success(mock_boto_client):
    """Verify successful report snapshot storage into S3 bucket."""
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3
    
    report_data = {
        "status": "success",
        "data_source": "demo_data",
        "summary": {"total_monthly_cost": 100.0}
    }

    result = save_report_to_s3(report_data, bucket_name="cost-optimizer-reports-226234259454")

    assert result["status"] == "success"
    assert result["s3_bucket"] == "cost-optimizer-reports-226234259454"
    assert "reports/cost_analysis_report_" in result["s3_key"]
    assert result["s3_uri"].startswith("s3://cost-optimizer-reports-226234259454/")
    assert mock_s3.put_object.call_count == 1

    # Verify put_object arguments
    call_kwargs = mock_s3.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "cost-optimizer-reports-226234259454"
    assert call_kwargs["ContentType"] == "application/json"
    saved_body = json.loads(call_kwargs["Body"].decode("utf-8"))
    assert saved_body["summary"]["total_monthly_cost"] == 100.0
    assert "saved_to_s3_at_utc" in saved_body


@patch("boto3.client")
def test_save_report_to_s3_permission_failure(mock_boto_client):
    """Verify graceful handling when S3 returns AccessDenied without crashing."""
    mock_s3 = MagicMock()
    mock_boto_client.return_value = mock_s3

    error_response = {
        "Error": {
            "Code": "AccessDenied",
            "Message": "Access Denied by IAM Policy"
        }
    }
    mock_s3.put_object.side_effect = ClientError(error_response, "PutObject")

    result = save_report_to_s3({"test": "data"}, bucket_name="cost-optimizer-reports-226234259454")

    assert result["status"] == "error"
    assert result["error_code"] == "AccessDenied"
    assert "Access Denied" in result["message"]


# ==========================================
# 6. Lambda Handler & CORS Tests
# ==========================================

def test_lambda_handler_options_preflight():
    """Verify HTTP OPTIONS returns 200 with required CORS headers."""
    event = {
        "requestContext": {"http": {"method": "OPTIONS"}},
        "rawPath": "/cost-analysis"
    }
    response = lambda_handler(event, None)
    
    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
    assert "OPTIONS" in response["headers"]["Access-Control-Allow-Methods"]


def test_lambda_handler_health_endpoint():
    """Verify GET /health returns status healthy."""
    event = {
        "requestContext": {"http": {"method": "GET"}},
        "rawPath": "/health"
    }
    response = lambda_handler(event, None)
    
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["status"] == "healthy"


def test_lambda_handler_cost_analysis_demo_mode():
    """Verify GET /cost-analysis with force_demo returns properly structured JSON."""
    event = {
        "requestContext": {"http": {"method": "GET"}},
        "rawPath": "/cost-analysis",
        "queryStringParameters": {"force_demo": "true"}
    }
    response = lambda_handler(event, None)
    
    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
    
    body = json.loads(response["body"])
    assert body["status"] == "success"
    assert body["data_source"] == "demo_data"
    assert body["is_sample_data"] is True
    assert "summary" in body
    assert "service_breakdown" in body
    assert "recommendations" in body
    assert body["engine_metadata"]["engine_type"] == "Deterministic Rule-Based Heuristic Engine"


@patch("backend.lambda_function.save_report_to_s3")
def test_lambda_handler_save_report_route_success(mock_save_s3):
    """Verify POST /save-report returns 200 and calls S3 storage."""
    mock_save_s3.return_value = {
        "status": "success",
        "s3_bucket": "cost-optimizer-reports-226234259454",
        "s3_key": "reports/cost_analysis_report_20261013_110000.json",
        "s3_uri": "s3://cost-optimizer-reports-226234259454/reports/cost_analysis_report_20261013_110000.json"
    }

    event = {
        "rawPath": "/save-report",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"summary": {"total_monthly_cost": 100.0}})
    }
    response = lambda_handler(event, None)

    assert response["statusCode"] == 200
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
    body = json.loads(response["body"])
    assert body["status"] == "success"
    assert "cost-optimizer-reports-226234259454" in body["s3_bucket"]


@patch("backend.lambda_function.save_report_to_s3")
def test_lambda_handler_save_report_route_failure(mock_save_s3):
    """Verify POST /save-report returns 500 when S3 fails without leaking credentials."""
    mock_save_s3.return_value = {
        "status": "error",
        "error_code": "AccessDenied",
        "message": "S3 storage operation failed (AccessDenied): Access Denied"
    }

    event = {
        "rawPath": "/save-report",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"summary": {"total_monthly_cost": 100.0}})
    }
    response = lambda_handler(event, None)

    assert response["statusCode"] == 500
    assert response["headers"]["Access-Control-Allow-Origin"] == "*"
    body = json.loads(response["body"])
    assert body["status"] == "error"


def test_json_download_metadata_structure():
    """Verify that JSON download object matches requirements for college evaluation."""
    analysis = analyze_costs(SAMPLE_COST_DATA, "demo_data", "Demo message")
    export_payload = {
        "export_metadata": {
            "system": "AI-Powered AWS Cloud Cost Optimization System",
            "downloaded_at_utc": "2026-10-13T12:00:00Z",
            "last_retrieved_at_utc": analysis["retrieval_timestamp_utc"],
            "data_source_mode": analysis["data_source"],
            "is_sample_data": analysis["is_sample_data"],
            "aws_region": "ap-south-1"
        },
        "cost_analysis": analysis
    }

    assert "export_metadata" in export_payload
    assert export_payload["export_metadata"]["is_sample_data"] is True
    assert export_payload["cost_analysis"]["summary"]["total_monthly_cost"] > 0
    assert len(export_payload["cost_analysis"]["service_breakdown"]) == len(SAMPLE_COST_DATA)


def test_date_range_helper():
    """Verify date range returns valid strings with start strictly before end."""
    start_str, end_str = get_cost_explorer_date_range()
    assert len(start_str) == 10
    assert len(end_str) == 10
    assert start_str < end_str
