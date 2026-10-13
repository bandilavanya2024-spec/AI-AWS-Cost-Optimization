"""
Unit Tests for AWS Cost Estimator & Optimization Engine
Tests all mathematical formulas, pricing registry lookups, currency conversions,
optimization recommendations, export formats, and Lambda routing.
"""

import json
import pytest

from backend.estimator_engine import (
    PRICING_REGISTRY,
    USD_TO_INR_RATE,
    calculate_cloudwatch_cost,
    calculate_ec2_cost,
    calculate_lambda_cost,
    calculate_rds_cost,
    calculate_s3_cost,
    calculate_vpc_cost,
    estimate_total_costs,
    export_estimate_to_csv,
    export_estimate_to_json,
    generate_optimization_recommendations,
    get_pricing_registry,
)
from backend.lambda_function import lambda_handler


# ==========================================
# 1. EC2 Calculation Tests
# ==========================================

def test_ec2_standard_monthly_calculation():
    """Verify EC2 compute + EBS storage for standard t3.micro in ap-south-1."""
    config = {
        "instance_type": "t3.micro",
        "instance_count": 1,
        "hours_per_day": 24.0,
        "days_per_month": 30.5,
        "ebs_gb": 30.0,
        "ebs_type": "gp3",
        "data_transfer_gb": 0.0
    }
    result = calculate_ec2_cost(config, region="ap-south-1")
    # t3.micro = $0.0104/hr * 1 * 732.0 hrs = $7.6128
    # ebs gp3 = 30 GB * $0.088 = $2.64
    # total = 7.6128 + 2.64 = $10.25
    assert result["service_key"] == "ec2"
    assert result["monthly_cost"] == 10.25
    assert len(result["components"]) == 3
    assert "t3.micro" in result["components"][0]["quantity"]


def test_ec2_multiple_instances_and_partial_hours():
    """Verify EC2 with 3 instances running 8 hours/day for 20 days/month."""
    config = {
        "instance_type": "t3.medium",
        "instance_count": 3,
        "hours_per_day": 8.0,
        "days_per_month": 20.0,
        "ebs_gb": 50.0,
        "ebs_type": "gp3"
    }
    result = calculate_ec2_cost(config, region="ap-south-1")
    # t3.medium = $0.0416 * 3 * 160 hrs = $19.968
    # ebs gp3 = 3 * 50 GB * $0.088 = $13.20
    # total = 19.968 + 13.20 = $33.17
    assert result["monthly_cost"] == 33.17


def test_ec2_custom_price_override():
    """Verify that user-supplied custom hourly price overrides default registry price."""
    config = {
        "instance_type": "t3.micro",
        "instance_count": 2,
        "hours_per_day": 24.0,
        "days_per_month": 30.0,
        "ebs_gb": 0.0,
        "custom_hourly_price": 0.05
    }
    result = calculate_ec2_cost(config, region="ap-south-1")
    # 0.05 * 2 * 720 = $72.00
    assert result["monthly_cost"] == 72.00
    assert "Custom Hourly Price" in result["components"][0]["pricing_source"]


# ==========================================
# 2. S3 Calculation Tests
# ==========================================

def test_s3_standard_storage_and_requests():
    """Verify S3 storage with PUT and GET request fees."""
    config = {
        "storage_class": "Standard",
        "storage_gb": 200.0,
        "put_requests": 20000,
        "get_requests": 100000,
        "retrieval_gb": 0.0
    }
    result = calculate_s3_cost(config, region="ap-south-1")
    # Storage = 200 * 0.023 = $4.60
    # PUT = (20000 / 1000) * 0.005 = $0.10
    # GET = (100000 / 1000) * 0.0004 = $0.04
    # Total = 4.60 + 0.10 + 0.04 = $4.74
    assert result["service_key"] == "s3"
    assert result["monthly_cost"] == 4.74


def test_s3_standard_ia_with_retrieval_charges():
    """Verify S3 Standard-IA lower storage price and retrieval charge."""
    config = {
        "storage_class": "Standard-IA",
        "storage_gb": 500.0,
        "put_requests": 1000,
        "get_requests": 5000,
        "retrieval_gb": 50.0
    }
    result = calculate_s3_cost(config, region="ap-south-1")
    # Storage = 500 * 0.0125 = $6.25
    # Retrieval = 50 * 0.01 = $0.50
    # Total includes tiny request fees
    assert result["monthly_cost"] >= 6.75


# ==========================================
# 3. RDS Calculation Tests
# ==========================================

def test_rds_single_az_cost():
    """Verify RDS Single-AZ database compute and storage."""
    config = {
        "engine": "PostgreSQL",
        "instance_type": "db.t3.micro",
        "instance_count": 1,
        "monthly_hours": 730.0,
        "storage_gb": 20.0,
        "deployment_option": "Single-AZ",
        "backup_gb": 0.0
    }
    result = calculate_rds_cost(config, region="ap-south-1")
    # Compute: 0.0180 * 1 * 730 = $13.14
    # Storage: 20 * 0.115 = $2.30
    # Total: $15.44
    assert result["monthly_cost"] == 15.44


def test_rds_multi_az_multiplier():
    """Verify RDS Multi-AZ applies 2.0x multiplier to compute and storage."""
    config_single = {
        "engine": "MySQL",
        "instance_type": "db.t3.small",
        "instance_count": 1,
        "monthly_hours": 730.0,
        "storage_gb": 50.0,
        "deployment_option": "Single-AZ"
    }
    config_multi = {
        "engine": "MySQL",
        "instance_type": "db.t3.small",
        "instance_count": 1,
        "monthly_hours": 730.0,
        "storage_gb": 50.0,
        "deployment_option": "Multi-AZ"
    }
    res_single = calculate_rds_cost(config_single, region="ap-south-1")
    res_multi = calculate_rds_cost(config_multi, region="ap-south-1")

    # Multi-AZ must cost exactly double Single-AZ
    assert round(res_multi["monthly_cost"], 2) == round(res_single["monthly_cost"] * 2.0, 2)


# ==========================================
# 4. Lambda Calculation Tests
# ==========================================

def test_lambda_within_free_tier():
    """Verify that requests and execution within AWS Free Tier yield $0.00 cost."""
    config = {
        "request_count": 500000,  # Below 1M free
        "duration_ms": 100.0,
        "memory_mb": 128,         # 500k * 0.1s * (128/1024) = 6,250 GB-s (Below 400k free)
        "architecture": "x86_64",
        "apply_free_tier": True
    }
    result = calculate_lambda_cost(config, region="ap-south-1")
    assert result["monthly_cost"] == 0.00


def test_lambda_beyond_free_tier_and_arm64_discount():
    """Verify Lambda compute beyond free tier and ARM64 20% discount."""
    config_x86 = {
        "request_count": 10000000,
        "duration_ms": 300.0,
        "memory_mb": 512,
        "architecture": "x86_64",
        "apply_free_tier": True
    }
    config_arm = {
        "request_count": 10000000,
        "duration_ms": 300.0,
        "memory_mb": 512,
        "architecture": "arm64",
        "apply_free_tier": True
    }
    res_x86 = calculate_lambda_cost(config_x86, region="ap-south-1")
    res_arm = calculate_lambda_cost(config_arm, region="ap-south-1")

    # ARM64 execution rate is 20% cheaper than x86_64
    assert res_arm["monthly_cost"] < res_x86["monthly_cost"]


# ==========================================
# 5. CloudWatch & VPC Calculation Tests
# ==========================================

def test_cloudwatch_cost_calculation():
    """Verify CloudWatch ingestion, storage, and custom metrics."""
    config = {
        "ingestion_gb": 20.0,
        "storage_gb": 30.0,
        "custom_metrics": 15,
        "apply_free_tier": True
    }
    result = calculate_cloudwatch_cost(config, region="ap-south-1")
    # Ingestion: (20 - 5 free) * 0.57 = 15 * 0.57 = $8.55
    # Storage: 30 * 0.033 = $0.99
    # Metrics: (15 - 10 free) * 0.30 = 5 * 0.30 = $1.50
    # Total = 8.55 + 0.99 + 1.50 = $11.04
    assert result["monthly_cost"] == 11.04


def test_vpc_nat_gateway_calculation():
    """Verify VPC NAT Gateway hourly uptime and data processing charges."""
    config = {
        "nat_gateway_count": 1,
        "nat_hours": 730.0,
        "nat_data_gb": 100.0,
        "public_ip_count": 1,
        "ip_hours": 730.0
    }
    result = calculate_vpc_cost(config, region="ap-south-1")
    # NAT uptime: 1 * 730 * 0.056 = $40.88
    # NAT data: 100 * 0.056 = $5.60
    # Public IP: 1 * 730 * 0.005 = $3.65
    # Total = 40.88 + 5.60 + 3.65 = $50.13
    assert result["monthly_cost"] == 50.13


# ==========================================
# 6. Total Estimation & Currency Conversion
# ==========================================

def test_full_multi_service_estimate():
    """Verify total estimation combines services with zero double counting."""
    service_configs = {
        "ec2": {"instance_type": "t3.micro", "instance_count": 1, "hours_per_day": 24, "days_per_month": 30.5, "ebs_gb": 30},
        "s3": {"storage_class": "Standard", "storage_gb": 100, "put_requests": 5000, "get_requests": 20000},
        "lambda": {"request_count": 1000000, "duration_ms": 100, "memory_mb": 128}
    }
    estimate = estimate_total_costs(service_configs, region="ap-south-1", currency="USD")
    summary = estimate["summary"]

    assert summary["calculation_type"] == "ESTIMATED_COST"
    assert summary["services_selected_count"] == 3
    assert summary["total_monthly_cost"] > 0
    assert summary["total_annual_cost"] == round(summary["total_monthly_cost"] * 12.0, 2)
    assert len(estimate["service_breakdown"]) == 3
    assert len(estimate["line_items_table"]) > 0


def test_currency_conversion_inr():
    """Verify INR conversion uses documented exchange rate."""
    service_configs = {
        "ec2": {"instance_type": "t3.micro", "instance_count": 1, "hours_per_day": 24, "days_per_month": 30.5, "ebs_gb": 30}
    }
    estimate_usd = estimate_total_costs(service_configs, region="ap-south-1", currency="USD")
    estimate_inr = estimate_total_costs(service_configs, region="ap-south-1", currency="INR", inr_rate=83.50)

    usd_total = estimate_usd["summary"]["total_monthly_cost"]
    inr_total = estimate_inr["summary"]["total_monthly_cost"]

    assert round(inr_total, 2) == round(usd_total * 83.50, 2)
    assert "₹" in estimate_inr["summary"]["total_monthly_cost_formatted"]
    assert "RBI" in estimate_inr["summary"]["exchange_rate_source"]


def test_empty_service_selection():
    """Verify that when no services are selected, estimate gracefully returns $0.00 without errors."""
    estimate = estimate_total_costs({}, region="ap-south-1", currency="USD")
    summary = estimate["summary"]

    assert summary["services_selected_count"] == 0
    assert summary["total_monthly_cost"] == 0.00
    assert summary["total_annual_cost"] == 0.00
    assert len(estimate["service_breakdown"]) == 0
    assert len(estimate["recommendations"]) == 0


# ==========================================
# 7. Optimization Recommendation Engine Tests
# ==========================================

def test_optimization_recommendations_ec2_scheduling():
    """Verify recommendation generated for continuous EC2 instances."""
    service_configs = {
        "ec2": {
            "instance_type": "t3.large",
            "instance_count": 2,
            "hours_per_day": 24.0,
            "days_per_month": 30.0,
            "ebs_gb": 40.0
        }
    }
    estimate = estimate_total_costs(service_configs, region="ap-south-1")
    recs = estimate["recommendations"]

    rec_ids = [r["id"] for r in recs]
    assert "REC-EC2-SCHED" in rec_ids

    sched_rec = next(r for r in recs if r["id"] == "REC-EC2-SCHED")
    assert sched_rec["estimated_savings_monthly"] > 0
    assert sched_rec["optimized_cost_monthly"] < sched_rec["current_cost_monthly"]
    assert "EventBridge" in sched_rec["trade_offs"]


def test_optimization_recommendations_rds_multi_az():
    """Verify recommendation generated for Multi-AZ RDS databases."""
    service_configs = {
        "rds": {
            "engine": "PostgreSQL",
            "instance_type": "db.t3.medium",
            "instance_count": 1,
            "monthly_hours": 730.0,
            "storage_gb": 50.0,
            "deployment_option": "Multi-AZ"
        }
    }
    estimate = estimate_total_costs(service_configs, region="ap-south-1")
    recs = estimate["recommendations"]

    rec_ids = [r["id"] for r in recs]
    assert "REC-RDS-AZ" in rec_ids

    az_rec = next(r for r in recs if r["id"] == "REC-RDS-AZ")
    assert az_rec["savings_percentage"] >= 40.0


# ==========================================
# 8. Report Serialization Tests
# ==========================================

def test_json_and_csv_export():
    """Verify JSON and CSV export strings contain valid structure and headers."""
    service_configs = {
        "ec2": {"instance_type": "t3.micro", "instance_count": 1, "hours_per_day": 24, "days_per_month": 30.5, "ebs_gb": 30}
    }
    estimate = estimate_total_costs(service_configs, region="ap-south-1")

    json_str = export_estimate_to_json(estimate)
    parsed = json.loads(json_str)
    assert "summary" in parsed
    assert "line_items_table" in parsed

    csv_str = export_estimate_to_csv(estimate)
    assert "Service Name,Component,Quantity,Unit,Unit Price" in csv_str
    assert "Amazon Elastic Compute Cloud (EC2)" in csv_str


# ==========================================
# 9. Lambda Routing Integration Tests
# ==========================================

def test_lambda_handler_estimate_cost_post_route():
    """Verify API Gateway POST /estimate-cost route through Lambda handler."""
    event = {
        "rawPath": "/estimate-cost",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({
            "region": "ap-south-1",
            "currency": "USD",
            "service_configs": {
                "s3": {"storage_class": "Standard", "storage_gb": 150.0, "put_requests": 1000, "get_requests": 5000}
            }
        })
    }
    response = lambda_handler(event, None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["summary"]["calculation_type"] == "ESTIMATED_COST"
    assert body["summary"]["services_selected_count"] == 1
    assert "Access-Control-Allow-Origin" in response["headers"]


# ==========================================
# 10. Custom Pricing Override & Edge Case Tests
# ==========================================

def test_rds_custom_hourly_price_override():
    """Verify custom hourly price override works for RDS database compute."""
    config = {
        "engine": "MySQL",
        "instance_type": "db.t3.medium",
        "instance_count": 2,
        "monthly_hours": 730.0,
        "storage_gb": 100.0,
        "deployment_option": "Single-AZ",
        "custom_hourly_price": 0.0500
    }
    res = calculate_rds_cost(config, region="ap-south-1")
    # Compute: 0.0500 * 2 * 730 = 73.00
    # Storage: 100 * 0.115 * 2 = 23.00
    assert res["monthly_cost"] == 96.00
    assert any("User-Specified Custom" in c["pricing_source"] for c in res["components"])


def test_lambda_custom_compute_rate_override():
    """Verify custom compute rate override works for Lambda execution."""
    config = {
        "request_count": 2000000,
        "duration_ms": 200.0,
        "memory_mb": 512,
        "architecture": "x86_64",
        "apply_free_tier": False,
        "custom_compute_rate": 0.00002000
    }
    res = calculate_lambda_cost(config, region="ap-south-1")
    # Total GB-s: 2,000,000 * 0.2s * 0.5 GB = 200,000 GB-s
    # Compute: 200,000 * 0.000020 = 4.00
    # Requests: 2M * $0.20/1M = 0.40
    assert res["monthly_cost"] == 4.40
    assert any("User-Specified Custom" in c["pricing_source"] for c in res["components"])


def test_cloudwatch_custom_ingestion_rate():
    """Verify custom ingestion rate override works for CloudWatch logs."""
    config = {
        "ingestion_gb": 20.0,
        "storage_gb": 10.0,
        "custom_metrics": 0,
        "apply_free_tier": False,
        "custom_ingestion_rate": 0.40
    }
    res = calculate_cloudwatch_cost(config, region="ap-south-1")
    # Ingestion: 20 * 0.40 = 8.00
    # Storage: 10 * 0.033 = 0.33
    assert res["monthly_cost"] == 8.33


def test_vpc_custom_nat_hourly_override():
    """Verify custom hourly rate override works for VPC NAT Gateways."""
    config = {
        "nat_gateway_count": 2,
        "nat_hours": 500.0,
        "nat_data_gb": 0.0,
        "public_ip_count": 0,
        "custom_nat_hourly": 0.040
    }
    res = calculate_vpc_cost(config, region="ap-south-1")
    # 2 * 500 * 0.040 = 40.00
    assert res["monthly_cost"] == 40.00


def test_invalid_negative_and_excessive_inputs_bounded():
    """Verify invalid negative inputs or out-of-range hours are bounded safely."""
    config = {
        "instance_count": -5,   # Should be bounded to at least 1
        "hours_per_day": 99.0,  # Should be capped at 24.0
        "days_per_month": -10.0,# Should be bounded to 0.0
        "ebs_gb": -50.0         # Should be bounded to 0.0
    }
    res = calculate_ec2_cost(config, region="ap-south-1")
    assert res["configuration"]["instance_count"] >= 1
    assert res["configuration"]["hours_per_day"] == 24.0
    assert res["configuration"]["days_per_month"] == 0.0
    assert res["monthly_cost"] == 0.0

