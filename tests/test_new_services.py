"""
Automated Unit Tests for Extended AWS Services
Covers:
- Amazon DynamoDB service & persistence
- Amazon Simple Notification Service (SNS) alerting
- Amazon QuickSight manifest & SPICE dataset generation
- Amazon ECS (Fargate) container compute estimation
- Amazon Route 53, Elastic Load Balancing (ALB), and Amazon ECR estimation
- New microservice API routes in lambda_function.py
"""

import json
import pytest
from unittest.mock import patch, MagicMock

from backend.dynamodb_service import (
    save_record_to_dynamodb,
    get_record_from_dynamodb,
    list_recent_records,
    get_dynamodb_table_schema
)
from backend.sns_service import (
    format_optimization_alert,
    publish_cost_alert,
    get_sns_topic_schema
)
from backend.quicksight_service import (
    generate_quicksight_manifest,
    format_tabular_dataset_for_spice,
    export_spice_dataset_csv,
    get_quicksight_analysis_spec
)
from backend.estimator_engine import (
    calculate_ecs_cost,
    calculate_dynamodb_cost,
    calculate_sns_cost,
    calculate_quicksight_cost,
    calculate_route53_cost,
    calculate_alb_cost,
    calculate_ecr_cost,
    estimate_total_costs,
    generate_optimization_recommendations
)
from backend.lambda_function import lambda_handler


# ========================================================
# 1. DynamoDB Service Tests
# ========================================================

def test_dynamodb_service_save_and_retrieve_fallback():
    """Verify DynamoDB save and retrieve works reliably with fallback store."""
    sample_record = {
        "summary": {
            "total_monthly_cost": 85.50,
            "potential_monthly_savings": 25.00,
            "currency": "USD"
        }
    }
    save_res = save_record_to_dynamodb(sample_record, record_type="ESTIMATE")
    assert save_res["status"] == "success"
    record_id = save_res["record_id"]
    assert record_id.startswith("REC-")

    retrieved = get_record_from_dynamodb(record_id)
    assert retrieved is not None
    assert retrieved["record_id"] == record_id
    assert retrieved["total_monthly_cost"] == 85.50

    recent = list_recent_records(limit=5)
    assert any(r["record_id"] == record_id for r in recent)


def test_dynamodb_service_schema():
    """Verify DynamoDB CloudFormation definition uses Pay-Per-Request (zero idle cost)."""
    schema = get_dynamodb_table_schema()
    assert schema["Type"] == "AWS::DynamoDB::Table"
    assert schema["Properties"]["BillingMode"] == "PAY_PER_REQUEST"
    assert schema["Properties"]["KeySchema"][0]["AttributeName"] == "record_id"


# ========================================================
# 2. SNS Alerting Service Tests
# ========================================================

def test_sns_service_alert_formatting():
    """Verify alert message formatting includes cost, savings, and recommendations."""
    report = {
        "summary": {
            "total_monthly_cost": 150.00,
            "potential_monthly_savings": 45.00,
            "savings_percentage": 30.0,
            "currency": "USD"
        },
        "recommendations": [
            {"title": "Adopt Fargate Spot", "monthly_savings": 35.00}
        ]
    }
    subject, message = format_optimization_alert(report)
    assert "[AWS Cost Alert]" in subject
    assert "$45.00" in subject
    assert "Adopt Fargate Spot" in message
    assert "$150.00" in message


def test_sns_service_dispatch_fallback():
    """Verify publish_cost_alert handles missing credentials gracefully without crashing."""
    report = {"summary": {"total_monthly_cost": 50.0}}
    res = publish_cost_alert(report)
    assert res["status"] == "success"
    assert "message_id" in res


def test_sns_topic_schema():
    """Verify SNS topic CloudFormation definition."""
    schema = get_sns_topic_schema()
    assert schema["Type"] == "AWS::SNS::Topic"
    assert schema["Properties"]["TopicName"] == "CostOptimizationAlertsTopic"


# ========================================================
# 3. QuickSight BI Integration Tests
# ========================================================

def test_quicksight_manifest_format():
    """Verify QuickSight manifest points to S3 reports with valid JSON formatting."""
    manifest = generate_quicksight_manifest(bucket_name="my-test-bucket", prefix="audit/")
    assert "fileLocations" in manifest
    assert "s3://my-test-bucket/audit/" in manifest["fileLocations"][0]["URIPrefixes"]
    assert manifest["globalUploadSettings"]["format"] == "JSON"


def test_quicksight_spice_tabular_export():
    """Verify tabular dataset generation and CSV serialization for SPICE."""
    report = {
        "summary": {
            "total_monthly_cost": 120.00,
            "potential_monthly_savings": 36.00,
            "savings_percentage": 30.0,
            "currency": "USD",
            "region": "ap-south-1"
        },
        "service_breakdown": {
            "ecs": {
                "service_name": "Amazon ECS",
                "monthly_cost": 80.00,
                "optimized_monthly_cost": 50.00
            },
            "dynamodb": {
                "service_name": "Amazon DynamoDB",
                "monthly_cost": 40.00,
                "optimized_monthly_cost": 34.00
            }
        }
    }
    rows = format_tabular_dataset_for_spice(report)
    assert len(rows) == 2
    assert rows[0]["ServiceKey"] in ("ECS", "DYNAMODB")
    assert rows[0]["BaselineCost"] > 0

    csv_text = export_spice_dataset_csv(report)
    assert "Date,Region,Currency,ServiceKey,ServiceName" in csv_text
    assert "Amazon ECS" in csv_text


# ========================================================
# 4. New Service Pricing Calculators Tests
# ========================================================

def test_ecs_fargate_calculation():
    """Verify standard Fargate vs Fargate Spot (70% savings) and ARM64 (20% savings)."""
    # Standard Fargate x86_64
    cfg_standard = {
        "vcpu": 1.0,
        "memory_gb": 2.0,
        "task_count": 1,
        "hours_per_day": 24.0,
        "days_per_month": 30.5,
        "launch_type": "Fargate",
        "architecture": "x86_64"
    }
    res_std = calculate_ecs_cost(cfg_standard, region="ap-south-1")
    assert res_std["monthly_cost"] > 0
    # Expected: (1.0 * 0.04048 + 2.0 * 0.004445) * 732 = (0.04048 + 0.00889) * 732 = 0.04937 * 732 = ~36.14
    assert 35.0 < res_std["monthly_cost"] < 38.0

    # Fargate Spot (70% discount)
    cfg_spot = dict(cfg_standard, launch_type="Fargate-Spot")
    res_spot = calculate_ecs_cost(cfg_spot, region="ap-south-1")
    expected_spot = round(res_std["monthly_cost"] * 0.30, 2)
    assert abs(res_spot["monthly_cost"] - expected_spot) <= 0.15

    # Graviton ARM64 (20% discount)
    cfg_arm = dict(cfg_standard, architecture="arm64")
    res_arm = calculate_ecs_cost(cfg_arm, region="ap-south-1")
    expected_arm = round(res_std["monthly_cost"] * 0.80, 2)
    assert abs(res_arm["monthly_cost"] - expected_arm) <= 0.15


def test_dynamodb_calculation():
    """Verify DynamoDB On-Demand and Provisioned calculations."""
    # On-Demand
    cfg_ondemand = {
        "billing_mode": "PAY_PER_REQUEST",
        "write_requests_per_month": 2000000,  # 2M * $1.25 = $2.50
        "read_requests_per_month": 4000000,   # 4M * $0.25 = $1.00
        "storage_gb": 35.0,                   # (35 - 25 free) * $0.25 = $2.50
        "apply_free_tier": True
    }
    res_ondemand = calculate_dynamodb_cost(cfg_ondemand, region="ap-south-1")
    assert res_ondemand["monthly_cost"] == 6.00  # 2.50 + 1.00 + 2.50

    # Provisioned
    cfg_provisioned = {
        "billing_mode": "PROVISIONED",
        "provisioned_wcu": 10,
        "provisioned_rcu": 20,
        "storage_gb": 10.0,
        "apply_free_tier": True
    }
    res_prov = calculate_dynamodb_cost(cfg_provisioned, region="ap-south-1")
    assert res_prov["monthly_cost"] > 0


def test_sns_calculation():
    """Verify SNS calculations with free tier applied."""
    cfg = {
        "publish_requests": 2000000,    # 2M - 1M free = 1M @ $0.50 = $0.50
        "email_notifications": 101000,  # 101k - 1k free = 100k @ $2.00 = $2.00
        "sms_notifications": 100,       # 100 * $0.0075 = $0.75
        "apply_free_tier": True
    }
    res = calculate_sns_cost(cfg, region="ap-south-1")
    assert res["monthly_cost"] == 3.25


def test_quicksight_calculation():
    """Verify QuickSight calculations with Authors, Readers, and SPICE storage."""
    cfg = {
        "author_users": 1,         # 1 * $24 = $24
        "reader_users": 2,         # 2 * $5 = $10
        "spice_storage_gb": 20.0   # 20 - 10 included = 10 * $0.25 = $2.50
    }
    res = calculate_quicksight_cost(cfg, region="ap-south-1")
    assert res["monthly_cost"] == 36.50


def test_route53_and_alb_and_ecr_calculation():
    """Verify Route 53, ALB, and ECR calculations."""
    r53 = calculate_route53_cost({"hosted_zones": 2, "queries_millions": 5.0})
    assert r53["monthly_cost"] == (2 * 0.50) + (5.0 * 0.40)  # 1.00 + 2.00 = 3.00

    alb = calculate_alb_cost({"alb_count": 1, "operating_hours": 730, "lcu_count": 1.0})
    assert alb["monthly_cost"] > 20.0  # 730 * (0.0225 + 0.008) = 22.27

    ecr = calculate_ecr_cost({"storage_gb": 10.5, "apply_free_tier": True})
    assert ecr["monthly_cost"] == 1.00  # (10.5 - 0.5 free) * $0.10 = 1.00


def test_full_13_services_orchestrated_estimate():
    """Verify estimate_total_costs runs cleanly with all 13 AWS architecture services enabled."""
    full_workload = {
        "ec2": {"instance_type": "t3.small", "instance_count": 1},
        "s3": {"storage_gb": 100, "storage_class": "Standard"},
        "rds": {"instance_type": "db.t3.micro", "deployment_option": "Single-AZ"},
        "lambda": {"request_count": 100000, "duration_ms": 200, "memory_mb": 128},
        "cloudwatch": {"ingestion_gb": 5.0, "storage_gb": 5.0},
        "vpc": {"nat_gateway_count": 1, "nat_hours": 730},
        "ecs": {"vcpu": 0.5, "memory_gb": 1.0, "task_count": 1},
        "dynamodb": {"billing_mode": "PAY_PER_REQUEST", "write_requests_per_month": 100000},
        "sns": {"publish_requests": 50000, "email_notifications": 500},
        "quicksight": {"author_users": 1, "reader_users": 1},
        "route53": {"hosted_zones": 1, "queries_millions": 1.0},
        "alb": {"alb_count": 1, "operating_hours": 730},
        "ecr": {"storage_gb": 5.0}
    }
    result = estimate_total_costs(full_workload, region="ap-south-1")
    assert result["summary"]["services_selected_count"] == 13
    assert result["summary"]["total_monthly_cost"] > 50.0
    assert len(result["service_breakdown"]) == 13
    assert len(result["recommendations"]) > 0


# ========================================================
# 5. Lambda Handler Extended Routes Tests
# ========================================================

def test_lambda_handler_new_routes():
    """Verify new routes: /send-alert, /quicksight-manifest, /save-dynamodb, /list-records."""
    # 1. /quicksight-manifest
    res_manifest = lambda_handler({"rawPath": "/quicksight-manifest"}, None)
    assert res_manifest["statusCode"] == 200
    b_manifest = json.loads(res_manifest["body"])
    assert "fileLocations" in b_manifest

    # 2. /send-alert
    alert_event = {
        "rawPath": "/send-alert",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"report_data": {"summary": {"total_monthly_cost": 75.0}}})
    }
    res_alert = lambda_handler(alert_event, None)
    assert res_alert["statusCode"] == 200
    b_alert = json.loads(res_alert["body"])
    assert b_alert["status"] == "success"

    # 3. /save-dynamodb
    save_event = {
        "rawPath": "/save-dynamodb",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"record_data": {"summary": {"total_monthly_cost": 42.0}}})
    }
    res_save = lambda_handler(save_event, None)
    assert res_save["statusCode"] == 200
    b_save = json.loads(res_save["body"])
    assert b_save["status"] == "success"

    # 4. /list-records
    res_list = lambda_handler({"rawPath": "/list-records"}, None)
    assert res_list["statusCode"] == 200
    b_list = json.loads(res_list["body"])
    assert b_list["status"] == "success"
