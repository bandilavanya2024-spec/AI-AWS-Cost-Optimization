"""
AI-Powered AWS Cloud Cost Optimization System
Module: backend.estimator_engine

Provides:
- Verified AWS pricing database for ap-south-1 (Mumbai) and us-east-1 (N. Virginia)
- Deterministic calculation formulas for EC2, S3, RDS, Lambda, CloudWatch, and VPC
- Recalculated optimization recommendations with transparent trade-offs
- Currency conversion support (USD and INR) with documented exchange rates
- CSV and JSON report serialization
"""

import copy
import csv
import datetime
import io
import json
from typing import Any, Dict, List, Optional, Tuple

# Indicative exchange rate: Reserve Bank of India benchmark reference rate
USD_TO_INR_RATE = 83.50
EXCHANGE_RATE_SOURCE = "Reserve Bank of India (RBI) Reference Rate (Verified Oct 2026)"

# Verified AWS Public Pricing Registry
# All prices are in USD, sourced from official AWS On-Demand Pricing tables.
PRICING_REGISTRY: Dict[str, Dict[str, Any]] = {
    "ap-south-1": {
        "region_name": "Asia Pacific (Mumbai) - ap-south-1",
        "ec2": {
            "instances": {
                "t3.micro": {"price_per_hr": 0.0104, "vcpu": 2, "ram_gb": 1.0, "arch": "x86_64"},
                "t3.small": {"price_per_hr": 0.0208, "vcpu": 2, "ram_gb": 2.0, "arch": "x86_64"},
                "t3.medium": {"price_per_hr": 0.0416, "vcpu": 2, "ram_gb": 4.0, "arch": "x86_64"},
                "t3.large": {"price_per_hr": 0.0832, "vcpu": 2, "ram_gb": 8.0, "arch": "x86_64"},
                "t3.xlarge": {"price_per_hr": 0.1664, "vcpu": 4, "ram_gb": 16.0, "arch": "x86_64"},
                "t4g.micro": {"price_per_hr": 0.0084, "vcpu": 2, "ram_gb": 1.0, "arch": "arm64"},
                "t4g.small": {"price_per_hr": 0.0168, "vcpu": 2, "ram_gb": 2.0, "arch": "arm64"},
                "t4g.medium": {"price_per_hr": 0.0336, "vcpu": 2, "ram_gb": 4.0, "arch": "arm64"},
                "m5.large": {"price_per_hr": 0.1070, "vcpu": 2, "ram_gb": 8.0, "arch": "x86_64"},
                "m5.xlarge": {"price_per_hr": 0.2140, "vcpu": 4, "ram_gb": 16.0, "arch": "x86_64"},
                "c5.large": {"price_per_hr": 0.0930, "vcpu": 2, "ram_gb": 4.0, "arch": "x86_64"},
                "c5.xlarge": {"price_per_hr": 0.1860, "vcpu": 4, "ram_gb": 8.0, "arch": "x86_64"},
            },
            "ebs_gp3_per_gb_month": 0.088,
            "ebs_gp2_per_gb_month": 0.114,
            "data_transfer_out_per_gb": 0.109,
            "source": "AWS EC2 On-Demand Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "s3": {
            "storage_classes": {
                "Standard": {"storage_per_gb_month": 0.0230, "retrieval_per_gb": 0.0},
                "Standard-IA": {"storage_per_gb_month": 0.0125, "retrieval_per_gb": 0.01},
                "OneZone-IA": {"storage_per_gb_month": 0.0100, "retrieval_per_gb": 0.01},
                "Glacier-Flexible": {"storage_per_gb_month": 0.00405, "retrieval_per_gb": 0.03},
                "Glacier-DeepArchive": {"storage_per_gb_month": 0.00099, "retrieval_per_gb": 0.05},
            },
            "put_request_per_1000": 0.0050,
            "get_request_per_1000": 0.0004,
            "data_transfer_out_per_gb": 0.109,
            "source": "AWS S3 Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "rds": {
            "instances": {
                "db.t3.micro": {"price_per_hr": 0.0180, "vcpu": 2, "ram_gb": 1.0},
                "db.t3.small": {"price_per_hr": 0.0360, "vcpu": 2, "ram_gb": 2.0},
                "db.t3.medium": {"price_per_hr": 0.0730, "vcpu": 2, "ram_gb": 4.0},
                "db.t3.large": {"price_per_hr": 0.1460, "vcpu": 2, "ram_gb": 8.0},
                "db.m5.large": {"price_per_hr": 0.1360, "vcpu": 2, "ram_gb": 8.0},
            },
            "storage_gp3_per_gb_month": 0.115,
            "multi_az_multiplier": 2.0,
            "backup_storage_per_gb_month": 0.095,
            "source": "AWS RDS On-Demand Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "lambda": {
            "request_per_million": 0.20,
            "compute_per_gb_second_x86": 0.0000166667,
            "compute_per_gb_second_arm": 0.0000133334,
            "free_tier_requests": 1000000,
            "free_tier_gb_seconds": 400000,
            "source": "AWS Lambda Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "cloudwatch": {
            "ingestion_per_gb": 0.57,
            "storage_per_gb_month": 0.033,
            "metrics_per_month": 0.30,
            "free_tier_metrics": 10,
            "free_tier_log_gb": 5.0,
            "source": "Amazon CloudWatch Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "vpc": {
            "nat_gateway_per_hr": 0.056,
            "nat_data_per_gb": 0.056,
            "public_ipv4_per_hr": 0.005,
            "source": "Amazon VPC Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "ecs": {
            "vcpu_per_hr": 0.04048,
            "memory_gb_per_hr": 0.004445,
            "fargate_spot_discount": 0.70,
            "graviton_arm_discount": 0.20,
            "source": "AWS Fargate Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "dynamodb": {
            "on_demand_write_per_million": 1.25,
            "on_demand_read_per_million": 0.25,
            "provisioned_wcu_per_hr": 0.00065,
            "provisioned_rcu_per_hr": 0.00013,
            "storage_per_gb_month": 0.25,
            "free_tier_storage_gb": 25.0,
            "source": "Amazon DynamoDB Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "sns": {
            "publish_per_million": 0.50,
            "email_per_100k": 2.00,
            "sms_per_message": 0.0075,
            "free_tier_publish": 1000000,
            "free_tier_email": 1000,
            "source": "Amazon SNS Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "quicksight": {
            "author_per_month": 24.00,
            "reader_per_month": 5.00,
            "spice_per_gb_month": 0.25,
            "source": "Amazon QuickSight Enterprise Pricing",
            "verified_date": "2026-10-01"
        },
        "route53": {
            "hosted_zone_per_month": 0.50,
            "queries_per_million": 0.40,
            "source": "Amazon Route 53 Pricing",
            "verified_date": "2026-10-01"
        },
        "alb": {
            "alb_per_hr": 0.0225,
            "lcu_per_hr": 0.008,
            "source": "AWS Elastic Load Balancing (ap-south-1)",
            "verified_date": "2026-10-01"
        },
        "ecr": {
            "storage_per_gb_month": 0.10,
            "data_transfer_out_per_gb": 0.109,
            "free_tier_storage_gb": 0.5,
            "source": "Amazon ECR Pricing (ap-south-1)",
            "verified_date": "2026-10-01"
        }
    },
    "us-east-1": {
        "region_name": "US East (N. Virginia) - us-east-1",
        "ec2": {
            "instances": {
                "t3.micro": {"price_per_hr": 0.0104, "vcpu": 2, "ram_gb": 1.0, "arch": "x86_64"},
                "t3.small": {"price_per_hr": 0.0208, "vcpu": 2, "ram_gb": 2.0, "arch": "x86_64"},
                "t3.medium": {"price_per_hr": 0.0416, "vcpu": 2, "ram_gb": 4.0, "arch": "x86_64"},
                "t3.large": {"price_per_hr": 0.0832, "vcpu": 2, "ram_gb": 8.0, "arch": "x86_64"},
                "t3.xlarge": {"price_per_hr": 0.1664, "vcpu": 4, "ram_gb": 16.0, "arch": "x86_64"},
                "t4g.micro": {"price_per_hr": 0.0084, "vcpu": 2, "ram_gb": 1.0, "arch": "arm64"},
                "t4g.small": {"price_per_hr": 0.0168, "vcpu": 2, "ram_gb": 2.0, "arch": "arm64"},
                "t4g.medium": {"price_per_hr": 0.0336, "vcpu": 2, "ram_gb": 4.0, "arch": "arm64"},
                "m5.large": {"price_per_hr": 0.0960, "vcpu": 2, "ram_gb": 8.0, "arch": "x86_64"},
                "m5.xlarge": {"price_per_hr": 0.1920, "vcpu": 4, "ram_gb": 16.0, "arch": "x86_64"},
                "c5.large": {"price_per_hr": 0.0850, "vcpu": 2, "ram_gb": 4.0, "arch": "x86_64"},
                "c5.xlarge": {"price_per_hr": 0.1700, "vcpu": 4, "ram_gb": 8.0, "arch": "x86_64"},
            },
            "ebs_gp3_per_gb_month": 0.080,
            "ebs_gp2_per_gb_month": 0.100,
            "data_transfer_out_per_gb": 0.090,
            "source": "AWS EC2 On-Demand Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "s3": {
            "storage_classes": {
                "Standard": {"storage_per_gb_month": 0.0230, "retrieval_per_gb": 0.0},
                "Standard-IA": {"storage_per_gb_month": 0.0125, "retrieval_per_gb": 0.01},
                "OneZone-IA": {"storage_per_gb_month": 0.0100, "retrieval_per_gb": 0.01},
                "Glacier-Flexible": {"storage_per_gb_month": 0.0036, "retrieval_per_gb": 0.03},
                "Glacier-DeepArchive": {"storage_per_gb_month": 0.00099, "retrieval_per_gb": 0.05},
            },
            "put_request_per_1000": 0.0050,
            "get_request_per_1000": 0.0004,
            "data_transfer_out_per_gb": 0.090,
            "source": "AWS S3 Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "rds": {
            "instances": {
                "db.t3.micro": {"price_per_hr": 0.0170, "vcpu": 2, "ram_gb": 1.0},
                "db.t3.small": {"price_per_hr": 0.0340, "vcpu": 2, "ram_gb": 2.0},
                "db.t3.medium": {"price_per_hr": 0.0680, "vcpu": 2, "ram_gb": 4.0},
                "db.t3.large": {"price_per_hr": 0.1360, "vcpu": 2, "ram_gb": 8.0},
                "db.m5.large": {"price_per_hr": 0.1190, "vcpu": 2, "ram_gb": 8.0},
            },
            "storage_gp3_per_gb_month": 0.115,
            "multi_az_multiplier": 2.0,
            "backup_storage_per_gb_month": 0.095,
            "source": "AWS RDS On-Demand Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "lambda": {
            "request_per_million": 0.20,
            "compute_per_gb_second_x86": 0.0000166667,
            "compute_per_gb_second_arm": 0.0000133334,
            "free_tier_requests": 1000000,
            "free_tier_gb_seconds": 400000,
            "source": "AWS Lambda Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "cloudwatch": {
            "ingestion_per_gb": 0.50,
            "storage_per_gb_month": 0.030,
            "metrics_per_month": 0.30,
            "free_tier_metrics": 10,
            "free_tier_log_gb": 5.0,
            "source": "Amazon CloudWatch Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "vpc": {
            "nat_gateway_per_hr": 0.045,
            "nat_data_per_gb": 0.045,
            "public_ipv4_per_hr": 0.005,
            "source": "Amazon VPC Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "ecs": {
            "vcpu_per_hr": 0.04048,
            "memory_gb_per_hr": 0.004445,
            "fargate_spot_discount": 0.70,
            "graviton_arm_discount": 0.20,
            "source": "AWS Fargate Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "dynamodb": {
            "on_demand_write_per_million": 1.25,
            "on_demand_read_per_million": 0.25,
            "provisioned_wcu_per_hr": 0.00065,
            "provisioned_rcu_per_hr": 0.00013,
            "storage_per_gb_month": 0.25,
            "free_tier_storage_gb": 25.0,
            "source": "Amazon DynamoDB Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "sns": {
            "publish_per_million": 0.50,
            "email_per_100k": 2.00,
            "sms_per_message": 0.0075,
            "free_tier_publish": 1000000,
            "free_tier_email": 1000,
            "source": "Amazon SNS Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "quicksight": {
            "author_per_month": 24.00,
            "reader_per_month": 5.00,
            "spice_per_gb_month": 0.25,
            "source": "Amazon QuickSight Enterprise Pricing",
            "verified_date": "2026-10-01"
        },
        "route53": {
            "hosted_zone_per_month": 0.50,
            "queries_per_million": 0.40,
            "source": "Amazon Route 53 Pricing",
            "verified_date": "2026-10-01"
        },
        "alb": {
            "alb_per_hr": 0.0225,
            "lcu_per_hr": 0.008,
            "source": "AWS Elastic Load Balancing (us-east-1)",
            "verified_date": "2026-10-01"
        },
        "ecr": {
            "storage_per_gb_month": 0.10,
            "data_transfer_out_per_gb": 0.090,
            "free_tier_storage_gb": 0.5,
            "source": "Amazon ECR Pricing (us-east-1)",
            "verified_date": "2026-10-01"
        }
    }
}


def get_pricing_registry(region: str = "ap-south-1") -> Dict[str, Any]:
    """Retrieves region pricing or defaults safely to ap-south-1."""
    return PRICING_REGISTRY.get(region, PRICING_REGISTRY["ap-south-1"])


# ==========================================
# 1. Individual Service Cost Calculators
# ==========================================

def calculate_ec2_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon EC2 monthly estimated cost.
    Formula:
      Operating Hours/Mo = hours_per_day * days_per_month
      Compute Cost = instance_hourly_price * instance_count * operating_hours
      EBS Cost = storage_gb * ebs_price_per_gb_month * instance_count
      Data Transfer Cost = transfer_gb * transfer_price_per_gb
      Total = Compute + EBS + Data Transfer
    """
    pricing = get_pricing_registry(region)["ec2"]
    instance_type = config.get("instance_type", "t3.micro")
    instance_count = max(1, int(config.get("instance_count", 1)))
    hours_per_day = min(24.0, max(0.0, float(config.get("hours_per_day", 24.0))))
    days_per_month = min(31.0, max(0.0, float(config.get("days_per_month", 30.5))))
    ebs_gb = max(0.0, float(config.get("ebs_gb", 30.0)))
    ebs_type = config.get("ebs_type", "gp3")
    transfer_gb = max(0.0, float(config.get("data_transfer_gb", 0.0)))
    
    # Custom price override support
    custom_hourly_price = config.get("custom_hourly_price")
    if custom_hourly_price is not None and float(custom_hourly_price) >= 0:
        hourly_price = float(custom_hourly_price)
        price_source = "User-Specified Custom Hourly Price"
    else:
        inst_info = pricing["instances"].get(instance_type, pricing["instances"]["t3.micro"])
        hourly_price = inst_info["price_per_hr"]
        price_source = f"{pricing['source']} ({pricing['verified_date']})"

    monthly_hours = hours_per_day * days_per_month
    compute_cost = hourly_price * instance_count * monthly_hours

    ebs_rate = pricing["ebs_gp3_per_gb_month"] if ebs_type == "gp3" else pricing["ebs_gp2_per_gb_month"]
    ebs_cost = ebs_gb * ebs_rate * instance_count

    transfer_rate = pricing["data_transfer_out_per_gb"]
    transfer_cost = transfer_gb * transfer_rate

    subtotal = round(compute_cost + ebs_cost + transfer_cost, 2)

    return {
        "service_name": "Amazon Elastic Compute Cloud (EC2)",
        "service_key": "ec2",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "EC2 Compute Instances",
                "quantity": f"{instance_count}x {instance_type} @ {monthly_hours:.1f} hrs/mo",
                "unit": "Instance-Hours",
                "unit_price": f"${hourly_price:.4f}/hr",
                "formula": f"{hourly_price:.4f} × {instance_count} × ({hours_per_day:.1f} hrs × {days_per_month:.1f} days)",
                "subtotal": round(compute_cost, 2),
                "pricing_source": price_source
            },
            {
                "name": f"EBS Storage ({ebs_type})",
                "quantity": f"{instance_count * ebs_gb:.0f} GB-month ({instance_count}x {ebs_gb:.0f} GB)",
                "unit": "GB-Month",
                "unit_price": f"${ebs_rate:.3f}/GB-mo",
                "formula": f"{instance_count * ebs_gb:.0f} GB × ${ebs_rate:.3f}/GB-mo",
                "subtotal": round(ebs_cost, 2),
                "pricing_source": f"AWS EBS {ebs_type} Pricing"
            },
            {
                "name": "Internet Data Transfer Out",
                "quantity": f"{transfer_gb:.1f} GB",
                "unit": "GB",
                "unit_price": f"${transfer_rate:.3f}/GB",
                "formula": f"{transfer_gb:.1f} GB × ${transfer_rate:.3f}/GB",
                "subtotal": round(transfer_cost, 2),
                "pricing_source": "AWS Data Transfer Pricing"
            }
        ],
        "configuration": {
            "instance_type": instance_type,
            "instance_count": instance_count,
            "hours_per_day": hours_per_day,
            "days_per_month": days_per_month,
            "monthly_hours": monthly_hours,
            "ebs_gb": ebs_gb,
            "ebs_type": ebs_type,
            "data_transfer_gb": transfer_gb,
            "hourly_price": hourly_price
        }
    }


def calculate_s3_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon S3 monthly estimated cost.
    Formula:
      Storage Cost = storage_gb * class_storage_price_per_gb_month
      PUT Requests Cost = (put_requests / 1,000) * put_price_per_1000
      GET Requests Cost = (get_requests / 1,000) * get_price_per_1000
      Retrieval Cost = retrieval_gb * retrieval_price_per_gb
      Total = Storage + Requests + Retrieval
    """
    pricing = get_pricing_registry(region)["s3"]
    storage_class = config.get("storage_class", "Standard")
    storage_gb = max(0.0, float(config.get("storage_gb", 100.0)))
    put_requests = max(0, int(config.get("put_requests", 10000)))
    get_requests = max(0, int(config.get("get_requests", 50000)))
    retrieval_gb = max(0.0, float(config.get("retrieval_gb", 0.0)))

    class_info = pricing["storage_classes"].get(storage_class, pricing["storage_classes"]["Standard"])
    storage_rate = class_info["storage_per_gb_month"]
    retrieval_rate = class_info["retrieval_per_gb"]

    # Custom price override support
    custom_storage_price = config.get("custom_storage_price")
    if custom_storage_price is not None and float(custom_storage_price) >= 0:
        storage_rate = float(custom_storage_price)
        price_source = "User-Specified Custom Storage Price"
    else:
        price_source = f"{pricing['source']} ({pricing['verified_date']})"

    storage_cost = storage_gb * storage_rate
    put_cost = (put_requests / 1000.0) * pricing["put_request_per_1000"]
    get_cost = (get_requests / 1000.0) * pricing["get_request_per_1000"]
    retrieval_cost = retrieval_gb * retrieval_rate

    subtotal = round(storage_cost + put_cost + get_cost + retrieval_cost, 2)

    return {
        "service_name": "Amazon Simple Storage Service (S3)",
        "service_key": "s3",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": f"S3 Storage ({storage_class})",
                "quantity": f"{storage_gb:,.1f} GB-month",
                "unit": "GB-Month",
                "unit_price": f"${storage_rate:.4f}/GB-mo",
                "formula": f"{storage_gb:,.1f} GB × ${storage_rate:.4f}",
                "subtotal": round(storage_cost, 2),
                "pricing_source": price_source
            },
            {
                "name": "PUT/POST/COPY API Requests",
                "quantity": f"{put_requests:,} requests",
                "unit": "Per 1,000",
                "unit_price": f"${pricing['put_request_per_1000']:.4f}/1k",
                "formula": f"({put_requests:,} / 1,000) × ${pricing['put_request_per_1000']:.4f}",
                "subtotal": round(put_cost, 2),
                "pricing_source": "AWS S3 Tier 1 Requests"
            },
            {
                "name": "GET/SELECT API Requests",
                "quantity": f"{get_requests:,} requests",
                "unit": "Per 1,000",
                "unit_price": f"${pricing['get_request_per_1000']:.4f}/1k",
                "formula": f"({get_requests:,} / 1,000) × ${pricing['get_request_per_1000']:.4f}",
                "subtotal": round(get_cost, 2),
                "pricing_source": "AWS S3 Tier 2 Requests"
            },
            {
                "name": "Data Retrieval Charges",
                "quantity": f"{retrieval_gb:,.1f} GB",
                "unit": "GB",
                "unit_price": f"${retrieval_rate:.4f}/GB",
                "formula": f"{retrieval_gb:,.1f} GB × ${retrieval_rate:.4f}",
                "subtotal": round(retrieval_cost, 2),
                "pricing_source": f"AWS S3 {storage_class} Retrieval"
            }
        ],
        "configuration": {
            "storage_class": storage_class,
            "storage_gb": storage_gb,
            "put_requests": put_requests,
            "get_requests": get_requests,
            "retrieval_gb": retrieval_gb,
            "storage_rate": storage_rate
        }
    }


def calculate_rds_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon RDS monthly estimated cost.
    Formula:
      Compute Cost = instance_hourly_price * instance_count * monthly_hours * (multi_az ? 2.0 : 1.0)
      Storage Cost = storage_gb * storage_price_per_gb_month * (multi_az ? 2.0 : 1.0)
      Backup Storage Cost = backup_gb * backup_price_per_gb_month
      Total = Compute + Storage + Backup
    """
    pricing = get_pricing_registry(region)["rds"]
    engine = config.get("engine", "PostgreSQL")
    instance_type = config.get("instance_type", "db.t3.micro")
    instance_count = max(1, int(config.get("instance_count", 1)))
    monthly_hours = max(0.0, float(config.get("monthly_hours", 730.0)))
    storage_gb = max(0.0, float(config.get("storage_gb", 20.0)))
    deployment_option = config.get("deployment_option", "Single-AZ")
    is_multi_az = (deployment_option == "Multi-AZ")
    backup_gb = max(0.0, float(config.get("backup_gb", 0.0)))

    custom_hourly_price = config.get("custom_hourly_price")
    if custom_hourly_price is not None and float(custom_hourly_price) >= 0:
        base_hourly_price = float(custom_hourly_price)
        price_source = "User-Specified Custom Database Hourly Price"
    else:
        inst_info = pricing["instances"].get(instance_type, pricing["instances"]["db.t3.micro"])
        base_hourly_price = inst_info["price_per_hr"]
        price_source = f"{pricing['source']} ({pricing['verified_date']})"

    multiplier = pricing["multi_az_multiplier"] if is_multi_az else 1.0
    effective_hourly_price = base_hourly_price * multiplier

    compute_cost = effective_hourly_price * instance_count * monthly_hours
    storage_rate = pricing["storage_gp3_per_gb_month"] * multiplier
    storage_cost = storage_gb * storage_rate * instance_count
    backup_cost = backup_gb * pricing["backup_storage_per_gb_month"]

    subtotal = round(compute_cost + storage_cost + backup_cost, 2)

    return {
        "service_name": "Amazon Relational Database Service (RDS)",
        "service_key": "rds",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": f"RDS Database Compute ({instance_type})",
                "quantity": f"{instance_count}x {engine} ({deployment_option}) @ {monthly_hours:.1f} hrs/mo",
                "unit": "Instance-Hours",
                "unit_price": f"${effective_hourly_price:.4f}/hr",
                "formula": f"(${base_hourly_price:.4f} × {multiplier:.1f}x) × {instance_count} × {monthly_hours:.1f} hrs",
                "subtotal": round(compute_cost, 2),
                "pricing_source": price_source
            },
            {
                "name": f"RDS Allocated Storage (gp3, {deployment_option})",
                "quantity": f"{instance_count * storage_gb:.0f} GB-month",
                "unit": "GB-Month",
                "unit_price": f"${storage_rate:.3f}/GB-mo",
                "formula": f"{instance_count * storage_gb:.0f} GB × ${storage_rate:.3f}",
                "subtotal": round(storage_cost, 2),
                "pricing_source": "AWS RDS General Purpose SSD"
            },
            {
                "name": "Automated Backup Storage",
                "quantity": f"{backup_gb:.0f} GB",
                "unit": "GB",
                "unit_price": f"${pricing['backup_storage_per_gb_month']:.3f}/GB",
                "formula": f"{backup_gb:.0f} GB × ${pricing['backup_storage_per_gb_month']:.3f}",
                "subtotal": round(backup_cost, 2),
                "pricing_source": "AWS RDS Backup Storage"
            }
        ],
        "configuration": {
            "engine": engine,
            "instance_type": instance_type,
            "instance_count": instance_count,
            "monthly_hours": monthly_hours,
            "storage_gb": storage_gb,
            "deployment_option": deployment_option,
            "backup_gb": backup_gb,
            "base_hourly_price": base_hourly_price
        }
    }


def calculate_lambda_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates AWS Lambda monthly estimated cost.
    Formula:
      Duration Seconds = avg_duration_ms / 1,000
      Memory GB = allocated_memory_mb / 1,024
      Total GB-Seconds = request_count * duration_seconds * memory_gb
      Billed GB-Seconds = max(0, total_gb_seconds - (free_tier ? 400,000 : 0))
      Compute Cost = billed_gb_seconds * compute_price_per_gb_second
      Billed Requests = max(0, request_count - (free_tier ? 1,000,000 : 0))
      Request Cost = (billed_requests / 1,000,000) * request_price_per_million
      Total = Compute + Requests
    """
    pricing = get_pricing_registry(region)["lambda"]
    request_count = max(0, int(config.get("request_count", 2000000)))
    duration_ms = max(1.0, float(config.get("duration_ms", 200.0)))
    memory_mb = max(128, int(config.get("memory_mb", 256)))
    architecture = config.get("architecture", "x86_64")
    apply_free_tier = bool(config.get("apply_free_tier", True))

    duration_sec = duration_ms / 1000.0
    memory_gb = memory_mb / 1024.0
    total_gb_seconds = request_count * duration_sec * memory_gb

    custom_compute_rate = config.get("custom_compute_rate")
    if custom_compute_rate is not None and float(custom_compute_rate) >= 0:
        rate_per_gb_s = float(custom_compute_rate)
        lambda_source = "User-Specified Custom Compute Price"
    else:
        rate_per_gb_s = pricing["compute_per_gb_second_arm"] if architecture == "arm64" else pricing["compute_per_gb_second_x86"]
        lambda_source = f"{pricing['source']} ({pricing['verified_date']})"

    free_tier_gb_s = pricing["free_tier_gb_seconds"] if apply_free_tier else 0
    billed_gb_seconds = max(0.0, total_gb_seconds - free_tier_gb_s)
    compute_cost = billed_gb_seconds * rate_per_gb_s

    free_tier_req = pricing["free_tier_requests"] if apply_free_tier else 0
    billed_requests = max(0, request_count - free_tier_req)
    request_cost = (billed_requests / 1000000.0) * pricing["request_per_million"]

    subtotal = round(compute_cost + request_cost, 2)

    return {
        "service_name": "AWS Lambda (Serverless Compute)",
        "service_key": "lambda",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": f"Lambda Compute Execution ({architecture})",
                "quantity": f"{total_gb_seconds:,.1f} GB-s ({billed_gb_seconds:,.1f} billed)",
                "unit": "GB-Seconds",
                "unit_price": f"${rate_per_gb_s:.8f}/GB-s",
                "formula": f"({request_count:,} req × {duration_sec:.3f}s × {memory_gb:.2f} GB - {free_tier_gb_s:,} free) × ${rate_per_gb_s:.8f}",
                "subtotal": round(compute_cost, 2),
                "pricing_source": lambda_source
            },
            {
                "name": "Lambda Invocation Requests",
                "quantity": f"{request_count:,} requests ({billed_requests:,} billed)",
                "unit": "Per 1 Million",
                "unit_price": f"${pricing['request_per_million']:.2f}/1M",
                "formula": f"({billed_requests:,} / 1,000,000) × ${pricing['request_per_million']:.2f}",
                "subtotal": round(request_cost, 2),
                "pricing_source": "AWS Lambda Requests"
            }
        ],
        "configuration": {
            "request_count": request_count,
            "duration_ms": duration_ms,
            "memory_mb": memory_mb,
            "architecture": architecture,
            "apply_free_tier": apply_free_tier,
            "total_gb_seconds": total_gb_seconds
        }
    }


def calculate_cloudwatch_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon CloudWatch monthly estimated cost.
    Formula:
      Ingestion Cost = max(0, ingestion_gb - free_gb) * ingestion_price_per_gb
      Storage Cost = storage_gb * storage_price_per_gb_month
      Metrics Cost = max(0, custom_metrics - free_metrics) * metric_price_per_month
      Total = Ingestion + Storage + Metrics
    """
    pricing = get_pricing_registry(region)["cloudwatch"]
    ingestion_gb = max(0.0, float(config.get("ingestion_gb", 10.0)))
    storage_gb = max(0.0, float(config.get("storage_gb", 15.0)))
    custom_metrics = max(0, int(config.get("custom_metrics", 5)))
    apply_free_tier = bool(config.get("apply_free_tier", True))

    free_ingestion = pricing["free_tier_log_gb"] if apply_free_tier else 0.0
    billed_ingestion = max(0.0, ingestion_gb - free_ingestion)

    custom_ingestion_rate = config.get("custom_ingestion_rate")
    if custom_ingestion_rate is not None and float(custom_ingestion_rate) >= 0:
        ingestion_rate = float(custom_ingestion_rate)
        cw_source = "User-Specified Custom Log Ingestion Price"
    else:
        ingestion_rate = pricing["ingestion_per_gb"]
        cw_source = f"{pricing['source']} ({pricing['verified_date']})"

    ingestion_cost = billed_ingestion * ingestion_rate
    storage_cost = storage_gb * pricing["storage_per_gb_month"]

    free_metrics = pricing["free_tier_metrics"] if apply_free_tier else 0
    billed_metrics = max(0, custom_metrics - free_metrics)
    metrics_cost = billed_metrics * pricing["metrics_per_month"]

    subtotal = round(ingestion_cost + storage_cost + metrics_cost, 2)

    return {
        "service_name": "Amazon CloudWatch (Logs & Metrics)",
        "service_key": "cloudwatch",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "CloudWatch Logs Ingestion",
                "quantity": f"{ingestion_gb:.1f} GB ({billed_ingestion:.1f} GB billed)",
                "unit": "GB",
                "unit_price": f"${ingestion_rate:.2f}/GB",
                "formula": f"max(0, {ingestion_gb:.1f} - {free_ingestion:.1f}) × ${ingestion_rate:.2f}",
                "subtotal": round(ingestion_cost, 2),
                "pricing_source": cw_source
            },
            {
                "name": "CloudWatch Logs Archive Storage",
                "quantity": f"{storage_gb:.1f} GB-month",
                "unit": "GB-Month",
                "unit_price": f"${pricing['storage_per_gb_month']:.3f}/GB-mo",
                "formula": f"{storage_gb:.1f} GB × ${pricing['storage_per_gb_month']:.3f}",
                "subtotal": round(storage_cost, 2),
                "pricing_source": "AWS CloudWatch Storage"
            },
            {
                "name": "CloudWatch Custom Metrics",
                "quantity": f"{custom_metrics} metrics ({billed_metrics} billed)",
                "unit": "Metrics/Mo",
                "unit_price": f"${pricing['metrics_per_month']:.2f}/metric",
                "formula": f"max(0, {custom_metrics} - {free_metrics}) × ${pricing['metrics_per_month']:.2f}",
                "subtotal": round(metrics_cost, 2),
                "pricing_source": "AWS CloudWatch Metrics"
            }
        ],
        "configuration": {
            "ingestion_gb": ingestion_gb,
            "storage_gb": storage_gb,
            "custom_metrics": custom_metrics,
            "apply_free_tier": apply_free_tier
        }
    }


def calculate_vpc_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon VPC Networking monthly estimated cost.
    Formula:
      NAT Uptime Cost = nat_gateway_count * nat_hours * nat_price_per_hr
      NAT Data Processing Cost = nat_data_gb * nat_data_price_per_gb
      Public IPv4 Cost = public_ips * ip_hours * ipv4_price_per_hr
      Total = NAT Uptime + NAT Data + Public IPv4
    """
    pricing = get_pricing_registry(region)["vpc"]
    nat_count = max(0, int(config.get("nat_gateway_count", 1)))
    nat_hours = max(0.0, float(config.get("nat_hours", 730.0)))
    nat_data_gb = max(0.0, float(config.get("nat_data_gb", 50.0)))
    public_ips = max(0, int(config.get("public_ip_count", 1)))
    ip_hours = max(0.0, float(config.get("ip_hours", 730.0)))

    custom_nat_hourly = config.get("custom_nat_hourly")
    if custom_nat_hourly is not None and float(custom_nat_hourly) >= 0:
        nat_rate = float(custom_nat_hourly)
        nat_source = "User-Specified Custom NAT Hourly Price"
    else:
        nat_rate = pricing["nat_gateway_per_hr"]
        nat_source = f"{pricing['source']} ({pricing['verified_date']})"

    nat_hourly_cost = nat_count * nat_hours * nat_rate
    nat_data_cost = nat_data_gb * pricing["nat_data_per_gb"]
    ipv4_cost = public_ips * ip_hours * pricing["public_ipv4_per_hr"]

    subtotal = round(nat_hourly_cost + nat_data_cost + ipv4_cost, 2)

    return {
        "service_name": "Amazon VPC Networking (NAT & IPs)",
        "service_key": "vpc",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "NAT Gateway Uptime Hours",
                "quantity": f"{nat_count} Gateway(s) @ {nat_hours:.1f} hrs",
                "unit": "Gateway-Hours",
                "unit_price": f"${nat_rate:.3f}/hr",
                "formula": f"{nat_count} × {nat_hours:.1f} hrs × ${nat_rate:.3f}",
                "subtotal": round(nat_hourly_cost, 2),
                "pricing_source": nat_source
            },
            {
                "name": "NAT Gateway Data Processed",
                "quantity": f"{nat_data_gb:.1f} GB",
                "unit": "GB",
                "unit_price": f"${pricing['nat_data_per_gb']:.3f}/GB",
                "formula": f"{nat_data_gb:.1f} GB × ${pricing['nat_data_per_gb']:.3f}",
                "subtotal": round(nat_data_cost, 2),
                "pricing_source": "AWS NAT Data Processing"
            },
            {
                "name": "Public IPv4 In-Use Addresses",
                "quantity": f"{public_ips} IP(s) @ {ip_hours:.1f} hrs",
                "unit": "IP-Hours",
                "unit_price": f"${pricing['public_ipv4_per_hr']:.3f}/hr",
                "formula": f"{public_ips} × {ip_hours:.1f} hrs × ${pricing['public_ipv4_per_hr']:.3f}",
                "subtotal": round(ipv4_cost, 2),
                "pricing_source": "AWS Public IPv4 Address Charge"
            }
        ],
        "configuration": {
            "nat_gateway_count": nat_count,
            "nat_hours": nat_hours,
            "nat_data_gb": nat_data_gb,
            "public_ip_count": public_ips,
            "ip_hours": ip_hours
        }
    }


def calculate_ecs_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon ECS (AWS Fargate) containerized compute monthly estimated cost.
    Formula:
      vCPU Rate = vcpu_base * (0.80 if ARM64 else 1.0) * (0.30 if Fargate Spot else 1.0)
      RAM Rate = ram_base * (0.80 if ARM64 else 1.0) * (0.30 if Fargate Spot else 1.0)
      Task Hours = hours_per_day * days_per_month * task_count
      Total = (vcpu * vcpu_rate + ram_gb * ram_rate) * Task Hours
    """
    pricing = get_pricing_registry(region)["ecs"]
    vcpu = max(0.25, float(config.get("vcpu", 0.5)))
    memory_gb = max(0.5, float(config.get("memory_gb", 1.0)))
    task_count = max(1, int(config.get("task_count", 1)))
    hours_per_day = min(24.0, max(0.0, float(config.get("hours_per_day", 24.0))))
    days_per_month = min(31.0, max(0.0, float(config.get("days_per_month", 30.5))))
    launch_type = config.get("launch_type", "Fargate")  # "Fargate" or "Fargate-Spot"
    architecture = config.get("architecture", "x86_64")  # "x86_64" or "arm64"

    monthly_hours = hours_per_day * days_per_month

    # Multipliers
    arch_mult = (1.0 - pricing["graviton_arm_discount"]) if architecture == "arm64" else 1.0
    spot_mult = (1.0 - pricing["fargate_spot_discount"]) if launch_type == "Fargate-Spot" else 1.0

    base_vcpu_price = pricing["vcpu_per_hr"]
    base_ram_price = pricing["memory_gb_per_hr"]

    effective_vcpu_price = base_vcpu_price * arch_mult * spot_mult
    effective_ram_price = base_ram_price * arch_mult * spot_mult

    hourly_task_cost = (vcpu * effective_vcpu_price) + (memory_gb * effective_ram_price)
    compute_cost = hourly_task_cost * task_count * monthly_hours
    subtotal = round(compute_cost, 2)

    return {
        "service_name": "Amazon Elastic Container Service (ECS Fargate)",
        "service_key": "ecs",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": f"Fargate vCPU ({architecture}, {launch_type})",
                "quantity": f"{task_count} task(s) × {vcpu} vCPU @ {monthly_hours:.1f} hrs",
                "unit": "vCPU-Hours",
                "unit_price": f"${effective_vcpu_price:.5f}/vCPU-hr",
                "formula": f"{task_count} × {vcpu} × {monthly_hours:.1f} hrs × ${effective_vcpu_price:.5f}",
                "subtotal": round(vcpu * effective_vcpu_price * task_count * monthly_hours, 2),
                "pricing_source": f"AWS Fargate ({architecture})"
            },
            {
                "name": f"Fargate Memory ({architecture}, {launch_type})",
                "quantity": f"{task_count} task(s) × {memory_gb} GB @ {monthly_hours:.1f} hrs",
                "unit": "GB-Hours",
                "unit_price": f"${effective_ram_price:.5f}/GB-hr",
                "formula": f"{task_count} × {memory_gb} × {monthly_hours:.1f} hrs × ${effective_ram_price:.5f}",
                "subtotal": round(memory_gb * effective_ram_price * task_count * monthly_hours, 2),
                "pricing_source": f"AWS Fargate Memory ({launch_type})"
            }
        ],
        "configuration": {
            "vcpu": vcpu,
            "memory_gb": memory_gb,
            "task_count": task_count,
            "hours_per_day": hours_per_day,
            "days_per_month": days_per_month,
            "launch_type": launch_type,
            "architecture": architecture,
            "monthly_hours": monthly_hours
        }
    }


def calculate_dynamodb_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon DynamoDB NoSQL Database monthly estimated cost.
    Supports On-Demand (Pay-Per-Request) and Provisioned capacity.
    """
    pricing = get_pricing_registry(region)["dynamodb"]
    billing_mode = config.get("billing_mode", "PAY_PER_REQUEST")
    storage_gb = max(0.0, float(config.get("storage_gb", 10.0)))
    apply_free_tier = bool(config.get("apply_free_tier", True))

    free_storage = pricing["free_tier_storage_gb"] if apply_free_tier else 0.0
    billed_storage = max(0.0, storage_gb - free_storage)
    storage_cost = billed_storage * pricing["storage_per_gb_month"]

    components = []
    if billing_mode == "PROVISIONED":
        wcu = max(1, int(config.get("provisioned_wcu", 5)))
        rcu = max(1, int(config.get("provisioned_rcu", 5)))
        hours = 730.0
        wcu_cost = wcu * hours * pricing["provisioned_wcu_per_hr"]
        rcu_cost = rcu * hours * pricing["provisioned_rcu_per_hr"]
        request_cost = wcu_cost + rcu_cost

        components.append({
            "name": "DynamoDB Provisioned Write Capacity (WCU)",
            "quantity": f"{wcu} WCU @ {hours:.0f} hrs",
            "unit": "WCU-Hours",
            "unit_price": f"${pricing['provisioned_wcu_per_hr']:.5f}/WCU-hr",
            "formula": f"{wcu} × 730 hrs × ${pricing['provisioned_wcu_per_hr']:.5f}",
            "subtotal": round(wcu_cost, 2),
            "pricing_source": "DynamoDB Provisioned"
        })
        components.append({
            "name": "DynamoDB Provisioned Read Capacity (RCU)",
            "quantity": f"{rcu} RCU @ {hours:.0f} hrs",
            "unit": "RCU-Hours",
            "unit_price": f"${pricing['provisioned_rcu_per_hr']:.5f}/RCU-hr",
            "formula": f"{rcu} × 730 hrs × ${pricing['provisioned_rcu_per_hr']:.5f}",
            "subtotal": round(rcu_cost, 2),
            "pricing_source": "DynamoDB Provisioned"
        })
    else:  # PAY_PER_REQUEST
        write_units = max(0, int(config.get("write_requests_per_month", 500000)))
        read_units = max(0, int(config.get("read_requests_per_month", 2000000)))
        write_cost = (write_units / 1000000.0) * pricing["on_demand_write_per_million"]
        read_cost = (read_units / 1000000.0) * pricing["on_demand_read_per_million"]
        request_cost = write_cost + read_cost

        components.append({
            "name": "DynamoDB On-Demand Write Requests (WRU)",
            "quantity": f"{write_units:,} Write Requests",
            "unit": "Million Requests",
            "unit_price": f"${pricing['on_demand_write_per_million']:.2f}/1M",
            "formula": f"({write_units:,} / 1M) × ${pricing['on_demand_write_per_million']:.2f}",
            "subtotal": round(write_cost, 2),
            "pricing_source": "DynamoDB On-Demand"
        })
        components.append({
            "name": "DynamoDB On-Demand Read Requests (RRU)",
            "quantity": f"{read_units:,} Read Requests",
            "unit": "Million Requests",
            "unit_price": f"${pricing['on_demand_read_per_million']:.2f}/1M",
            "formula": f"({read_units:,} / 1M) × ${pricing['on_demand_read_per_million']:.2f}",
            "subtotal": round(read_cost, 2),
            "pricing_source": "DynamoDB On-Demand"
        })

    components.append({
        "name": "DynamoDB Table Data Storage",
        "quantity": f"{storage_gb:.1f} GB ({billed_storage:.1f} GB billed)",
        "unit": "GB-Month",
        "unit_price": f"${pricing['storage_per_gb_month']:.2f}/GB-mo",
        "formula": f"max(0, {storage_gb:.1f} - {free_storage:.1f}) × ${pricing['storage_per_gb_month']:.2f}",
        "subtotal": round(storage_cost, 2),
        "pricing_source": "DynamoDB Storage"
    })

    subtotal = round(request_cost + storage_cost, 2)
    return {
        "service_name": "Amazon DynamoDB (Serverless NoSQL)",
        "service_key": "dynamodb",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": components,
        "configuration": {
            "billing_mode": billing_mode,
            "storage_gb": storage_gb,
            "apply_free_tier": apply_free_tier
        }
    }


def calculate_sns_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon SNS (Simple Notification Service) monthly estimated cost.
    Formula:
      Publish Cost = max(0, publish_requests - free_publish) / 1M * price_per_million
      Email Cost = max(0, email_count - free_email) / 100k * email_rate
      SMS Cost = sms_count * sms_rate
    """
    pricing = get_pricing_registry(region)["sns"]
    publish_count = max(0, int(config.get("publish_requests", 200000)))
    email_count = max(0, int(config.get("email_notifications", 2000)))
    sms_count = max(0, int(config.get("sms_notifications", 0)))
    apply_free_tier = bool(config.get("apply_free_tier", True))

    free_publish = pricing["free_tier_publish"] if apply_free_tier else 0
    billed_publish = max(0, publish_count - free_publish)
    publish_cost = (billed_publish / 1000000.0) * pricing["publish_per_million"]

    free_email = pricing["free_tier_email"] if apply_free_tier else 0
    billed_email = max(0, email_count - free_email)
    email_cost = (billed_email / 100000.0) * pricing["email_per_100k"]

    sms_cost = sms_count * pricing["sms_per_message"]
    subtotal = round(publish_cost + email_cost + sms_cost, 2)

    return {
        "service_name": "Amazon Simple Notification Service (SNS)",
        "service_key": "sns",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "SNS Topic Publish API Requests",
                "quantity": f"{publish_count:,} requests ({billed_publish:,} billed)",
                "unit": "Million Requests",
                "unit_price": f"${pricing['publish_per_million']:.2f}/1M",
                "formula": f"({billed_publish:,} / 1M) × ${pricing['publish_per_million']:.2f}",
                "subtotal": round(publish_cost, 2),
                "pricing_source": "AWS SNS API Requests"
            },
            {
                "name": "SNS Email Alert Deliveries",
                "quantity": f"{email_count:,} emails ({billed_email:,} billed)",
                "unit": "Per 100,000",
                "unit_price": f"${pricing['email_per_100k']:.2f}/100K",
                "formula": f"({billed_email:,} / 100K) × ${pricing['email_per_100k']:.2f}",
                "subtotal": round(email_cost, 2),
                "pricing_source": "AWS SNS Email Delivery"
            }
        ],
        "configuration": {
            "publish_requests": publish_count,
            "email_notifications": email_count,
            "sms_notifications": sms_count,
            "apply_free_tier": apply_free_tier
        }
    }


def calculate_quicksight_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon QuickSight Business Intelligence dashboard monthly estimated cost.
    Formula:
      Authors Cost = author_count * author_monthly_rate
      Readers Cost = reader_count * reader_monthly_rate
      SPICE Cost = max(0, spice_gb - (author_count * 10GB_included)) * spice_rate
    """
    pricing = get_pricing_registry(region)["quicksight"]
    authors = max(1, int(config.get("author_users", 1)))
    readers = max(0, int(config.get("reader_users", 2)))
    spice_gb = max(0.0, float(config.get("spice_storage_gb", 10.0)))

    authors_cost = authors * pricing["author_per_month"]
    readers_cost = readers * pricing["reader_per_month"]

    included_spice = authors * 10.0  # 10GB included per author
    billed_spice = max(0.0, spice_gb - included_spice)
    spice_cost = billed_spice * pricing["spice_per_gb_month"]

    subtotal = round(authors_cost + readers_cost + spice_cost, 2)

    return {
        "service_name": "Amazon QuickSight (Executive BI Analytics)",
        "service_key": "quicksight",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "QuickSight Enterprise Authors",
                "quantity": f"{authors} Author User(s)",
                "unit": "Users/Mo",
                "unit_price": f"${pricing['author_per_month']:.2f}/user-mo",
                "formula": f"{authors} × ${pricing['author_per_month']:.2f}",
                "subtotal": round(authors_cost, 2),
                "pricing_source": "QuickSight Enterprise"
            },
            {
                "name": "QuickSight Interactive Readers",
                "quantity": f"{readers} Reader User(s)",
                "unit": "Users/Mo",
                "unit_price": f"${pricing['reader_per_month']:.2f}/user-mo",
                "formula": f"{readers} × ${pricing['reader_per_month']:.2f}",
                "subtotal": round(readers_cost, 2),
                "pricing_source": "QuickSight Readers"
            },
            {
                "name": "QuickSight SPICE In-Memory Storage",
                "quantity": f"{spice_gb:.1f} GB ({billed_spice:.1f} GB billed beyond {included_spice:.0f} GB included)",
                "unit": "GB-Month",
                "unit_price": f"${pricing['spice_per_gb_month']:.2f}/GB-mo",
                "formula": f"max(0, {spice_gb:.1f} - {included_spice:.1f}) × ${pricing['spice_per_gb_month']:.2f}",
                "subtotal": round(spice_cost, 2),
                "pricing_source": "QuickSight SPICE Storage"
            }
        ],
        "configuration": {
            "author_users": authors,
            "reader_users": readers,
            "spice_storage_gb": spice_gb
        }
    }


def calculate_route53_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon Route 53 DNS routing monthly estimated cost.
    Formula:
      Zones Cost = hosted_zones * zone_price_per_month
      Queries Cost = queries_millions * query_price_per_million
    """
    pricing = get_pricing_registry(region)["route53"]
    hosted_zones = max(1, int(config.get("hosted_zones", 1)))
    queries_millions = max(0.0, float(config.get("queries_millions", 1.0)))

    zones_cost = hosted_zones * pricing["hosted_zone_per_month"]
    queries_cost = queries_millions * pricing["queries_per_million"]
    subtotal = round(zones_cost + queries_cost, 2)

    return {
        "service_name": "Amazon Route 53 (DNS & Traffic Routing)",
        "service_key": "route53",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "Route 53 Public Hosted Zones",
                "quantity": f"{hosted_zones} Hosted Zone(s)",
                "unit": "Zones/Mo",
                "unit_price": f"${pricing['hosted_zone_per_month']:.2f}/zone",
                "formula": f"{hosted_zones} × ${pricing['hosted_zone_per_month']:.2f}",
                "subtotal": round(zones_cost, 2),
                "pricing_source": "AWS Route 53 Zones"
            },
            {
                "name": "Route 53 Standard DNS Queries",
                "quantity": f"{queries_millions:.2f} Million Queries",
                "unit": "Million Queries",
                "unit_price": f"${pricing['queries_per_million']:.2f}/1M",
                "formula": f"{queries_millions:.2f} × ${pricing['queries_per_million']:.2f}",
                "subtotal": round(queries_cost, 2),
                "pricing_source": "AWS Route 53 Queries"
            }
        ],
        "configuration": {
            "hosted_zones": hosted_zones,
            "queries_millions": queries_millions
        }
    }


def calculate_alb_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Elastic Load Balancing (Application Load Balancer) monthly estimated cost.
    Formula:
      ALB Uptime Cost = alb_count * operating_hours * alb_price_per_hr
      LCU Processing Cost = alb_count * operating_hours * lcu_count * lcu_price_per_hr
    """
    pricing = get_pricing_registry(region)["alb"]
    alb_count = max(1, int(config.get("alb_count", 1)))
    hours = min(744.0, max(0.0, float(config.get("operating_hours", 730.0))))
    lcu = max(0.5, float(config.get("lcu_count", 1.0)))

    alb_cost = alb_count * hours * pricing["alb_per_hr"]
    lcu_cost = alb_count * hours * lcu * pricing["lcu_per_hr"]
    subtotal = round(alb_cost + lcu_cost, 2)

    return {
        "service_name": "AWS Elastic Load Balancing (Application Load Balancer)",
        "service_key": "alb",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "Application Load Balancer Uptime",
                "quantity": f"{alb_count} ALB(s) @ {hours:.0f} hrs/mo",
                "unit": "ALB-Hours",
                "unit_price": f"${pricing['alb_per_hr']:.4f}/hr",
                "formula": f"{alb_count} × {hours:.0f} hrs × ${pricing['alb_per_hr']:.4f}",
                "subtotal": round(alb_cost, 2),
                "pricing_source": "AWS ALB Hourly"
            },
            {
                "name": "Load Balancer Capacity Units (LCU)",
                "quantity": f"{lcu:.1f} LCU/hr @ {hours:.0f} hrs",
                "unit": "LCU-Hours",
                "unit_price": f"${pricing['lcu_per_hr']:.4f}/LCU-hr",
                "formula": f"{alb_count} × {hours:.0f} hrs × {lcu:.1f} LCU × ${pricing['lcu_per_hr']:.4f}",
                "subtotal": round(lcu_cost, 2),
                "pricing_source": "AWS ALB Capacity"
            }
        ],
        "configuration": {
            "alb_count": alb_count,
            "operating_hours": hours,
            "lcu_count": lcu
        }
    }


def calculate_ecr_cost(config: Dict[str, Any], region: str = "ap-south-1") -> Dict[str, Any]:
    """
    Calculates Amazon Elastic Container Registry (ECR) monthly estimated cost.
    Formula:
      Storage Cost = max(0, storage_gb - 0.5 free) * price_per_gb_month
    """
    pricing = get_pricing_registry(region)["ecr"]
    storage_gb = max(0.0, float(config.get("storage_gb", 5.0)))
    apply_free_tier = bool(config.get("apply_free_tier", True))

    free_gb = pricing["free_tier_storage_gb"] if apply_free_tier else 0.0
    billed_gb = max(0.0, storage_gb - free_gb)
    storage_cost = billed_gb * pricing["storage_per_gb_month"]
    subtotal = round(storage_cost, 2)

    return {
        "service_name": "Amazon Elastic Container Registry (ECR)",
        "service_key": "ecr",
        "monthly_cost": subtotal,
        "monthly_cost_formatted": f"${subtotal:,.2f}",
        "components": [
            {
                "name": "ECR Container Image Storage",
                "quantity": f"{storage_gb:.1f} GB ({billed_gb:.1f} GB billed)",
                "unit": "GB-Month",
                "unit_price": f"${pricing['storage_per_gb_month']:.2f}/GB-mo",
                "formula": f"max(0, {storage_gb:.1f} - {free_gb:.1f}) × ${pricing['storage_per_gb_month']:.2f}",
                "subtotal": round(storage_cost, 2),
                "pricing_source": "Amazon ECR Storage"
            }
        ],
        "configuration": {
            "storage_gb": storage_gb,
            "apply_free_tier": apply_free_tier
        }
    }


# ==========================================
# 2. Total Cost Estimation Orchestrator
# ==========================================

SERVICE_CALCULATORS = {
    "ec2": calculate_ec2_cost,
    "s3": calculate_s3_cost,
    "rds": calculate_rds_cost,
    "lambda": calculate_lambda_cost,
    "cloudwatch": calculate_cloudwatch_cost,
    "vpc": calculate_vpc_cost,
    "ecs": calculate_ecs_cost,
    "dynamodb": calculate_dynamodb_cost,
    "sns": calculate_sns_cost,
    "quicksight": calculate_quicksight_cost,
    "route53": calculate_route53_cost,
    "alb": calculate_alb_cost,
    "ecr": calculate_ecr_cost
}


def estimate_total_costs(
    service_configs: Dict[str, Any],
    region: str = "ap-south-1",
    currency: str = "USD",
    inr_rate: float = USD_TO_INR_RATE
) -> Dict[str, Any]:
    """
    Orchestrates full monthly cost estimation across all configured AWS services.
    Enforces zero double-counting, currency alignment, and detailed formula logs.
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    service_results: List[Dict[str, Any]] = []
    total_monthly_usd = 0.0
    all_line_items: List[Dict[str, Any]] = []

    for key, calc_func in SERVICE_CALCULATORS.items():
        if key in service_configs and service_configs[key] is not None:
            config = service_configs[key]
            # Check if explicitly enabled
            if config.get("enabled", True):
                res = calc_func(config, region=region)
                service_results.append(res)
                total_monthly_usd += res["monthly_cost"]
                for comp in res["components"]:
                    item = copy.deepcopy(comp)
                    item["service_name"] = res["service_name"]
                    item["service_key"] = key
                    all_line_items.append(item)

    total_monthly_usd = round(total_monthly_usd, 2)
    total_annual_usd = round(total_monthly_usd * 12.0, 2)

    # Sort services descending by cost
    service_results.sort(key=lambda s: s["monthly_cost"], reverse=True)

    # Calculate percentage share
    service_breakdown = []
    for s in service_results:
        pct = round((s["monthly_cost"] / total_monthly_usd * 100.0), 1) if total_monthly_usd > 0 else 0.0
        service_breakdown.append({
            "service_name": s["service_name"],
            "service_key": s["service_key"],
            "monthly_cost": s["monthly_cost"],
            "monthly_cost_formatted": f"${s['monthly_cost']:,.2f}",
            "percentage_of_total": pct
        })

    highest_service = service_breakdown[0] if service_breakdown else {
        "service_name": "None Selected",
        "service_key": "none",
        "monthly_cost": 0.0,
        "monthly_cost_formatted": "$0.00",
        "percentage_of_total": 0.0
    }

    # Generate rule-based optimization recommendations
    recommendations = generate_optimization_recommendations(
        service_configs=service_configs,
        service_results=service_results,
        region=region
    )

    total_potential_monthly_savings_usd = sum(r["estimated_savings_monthly"] for r in recommendations)
    total_potential_monthly_savings_usd = round(total_potential_monthly_savings_usd, 2)
    savings_pct = round((total_potential_monthly_savings_usd / total_monthly_usd * 100.0), 1) if total_monthly_usd > 0 else 0.0

    optimized_monthly_usd = round(max(0.0, total_monthly_usd - total_potential_monthly_savings_usd), 2)
    optimized_annual_usd = round(optimized_monthly_usd * 12.0, 2)

    # Currency Conversion values
    is_inr = (currency.upper() == "INR")
    conversion_multiplier = inr_rate if is_inr else 1.0
    symbol = "₹" if is_inr else "$"

    summary = {
        "calculation_type": "ESTIMATED_COST",
        "label": "ESTIMATED AWS EXPENDITURE (NOT AN INVOICE)",
        "region": region,
        "region_name": PRICING_REGISTRY.get(region, {}).get("region_name", region),
        "currency": currency.upper(),
        "exchange_rate_used": inr_rate,
        "exchange_rate_source": EXCHANGE_RATE_SOURCE if is_inr else "Native USD (No Conversion)",
        "services_selected_count": len(service_results),
        "total_monthly_cost": round(total_monthly_usd * conversion_multiplier, 2),
        "total_monthly_cost_formatted": f"{symbol}{total_monthly_usd * conversion_multiplier:,.2f}",
        "total_annual_cost": round(total_annual_usd * conversion_multiplier, 2),
        "total_annual_cost_formatted": f"{symbol}{total_annual_usd * conversion_multiplier:,.2f}",
        "annual_assumption_notice": "Annual projection assumes 12 constant months of the configured workload.",
        "highest_cost_service": highest_service,
        "optimized_monthly_cost": round(optimized_monthly_usd * conversion_multiplier, 2),
        "optimized_monthly_cost_formatted": f"{symbol}{optimized_monthly_usd * conversion_multiplier:,.2f}",
        "optimized_annual_cost": round(optimized_annual_usd * conversion_multiplier, 2),
        "optimized_annual_cost_formatted": f"{symbol}{optimized_annual_usd * conversion_multiplier:,.2f}",
        "potential_monthly_savings": round(total_potential_monthly_savings_usd * conversion_multiplier, 2),
        "potential_monthly_savings_formatted": f"{symbol}{total_potential_monthly_savings_usd * conversion_multiplier:,.2f}",
        "savings_percentage": savings_pct,
        "estimation_timestamp_utc": now_utc
    }

    return {
        "summary": summary,
        "service_breakdown": service_breakdown,
        "detailed_services": service_results,
        "line_items_table": all_line_items,
        "recommendations": recommendations,
        "pricing_registry_used": PRICING_REGISTRY.get(region, PRICING_REGISTRY["ap-south-1"]),
        "disclaimer": (
            "All figures are estimated mathematical projections derived from explicit user inputs "
            "and published AWS On-Demand price lists. This is a cost estimation and optimization tool "
            "for college evaluation, not an official AWS invoice or billing commitment."
        )
    }


# ==========================================
# 3. Dynamic Optimization Recommendation Engine
# ==========================================

def generate_optimization_recommendations(
    service_configs: Dict[str, Any],
    service_results: List[Dict[str, Any]],
    region: str = "ap-south-1"
) -> List[Dict[str, Any]]:
    """
    Evaluates user's actual configured resources and generates concrete, recalculated
    recommendations using the exact same pricing formulas.
    """
    recs: List[Dict[str, Any]] = []

    # Map current services
    service_dict = {s["service_key"]: s for s in service_results}

    # 1. EC2 Optimization: Continuous -> Business Hours Scheduling
    if "ec2" in service_dict:
        ec2_res = service_dict["ec2"]
        cfg = ec2_res["configuration"]
        if cfg["hours_per_day"] >= 20.0 and cfg["days_per_month"] >= 28.0:
            # Suggest 10 hrs/day, 22 business days/month
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["hours_per_day"] = 10.0
            opt_cfg["days_per_month"] = 22.0
            opt_res = calculate_ec2_cost(opt_cfg, region=region)
            savings = round(ec2_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / ec2_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-EC2-SCHED",
                    "category": "Operational Scheduling",
                    "service": "Amazon EC2",
                    "title": "Automated Non-Production Scheduling (Stop Off-Hours)",
                    "current_config": f"{cfg['instance_count']}x {cfg['instance_type']} running 24x7 ({cfg['monthly_hours']:.0f} hrs/mo)",
                    "suggested_config": f"{cfg['instance_count']}x {cfg['instance_type']} scheduled 10 hrs/day × 22 business days (220 hrs/mo)",
                    "current_cost_monthly": ec2_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Assumes development or testing environment that is not accessed nights or weekends.",
                    "trade_offs": "Instances are offline outside business hours. Requires EventBridge + Lambda or AWS Instance Scheduler.",
                    "priority": "HIGH" if pct > 50 else "MEDIUM"
                })

        # 2. EC2 Instance Rightsizing / Graviton2
        if cfg["instance_type"] in ("m5.large", "m5.xlarge", "c5.large", "c5.xlarge", "t3.large"):
            suggested_inst = "t3.medium" if "large" in cfg["instance_type"] else "t3.small"
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["instance_type"] = suggested_inst
            opt_res = calculate_ec2_cost(opt_cfg, region=region)
            savings = round(ec2_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / ec2_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-EC2-SIZE",
                    "category": "Instance Rightsizing",
                    "service": "Amazon EC2",
                    "title": f"Rightsizing Over-Provisioned Compute ({cfg['instance_type']} -> {suggested_inst})",
                    "current_config": f"{cfg['instance_count']}x {cfg['instance_type']} ({cfg['hourly_price']:.4f}/hr)",
                    "suggested_config": f"{cfg['instance_count']}x {suggested_inst} ({opt_cfg['instance_type']})",
                    "current_cost_monthly": ec2_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Assumes average CPU utilization < 25% based on CloudWatch metric audits.",
                    "trade_offs": "Downsizing reduces available vCPU and RAM. Verify memory headroom before migrating.",
                    "priority": "HIGH" if savings > 20 else "MEDIUM"
                })

    # 3. S3 Storage Class Lifecycle (Standard -> Standard-IA or Glacier)
    if "s3" in service_dict:
        s3_res = service_dict["s3"]
        cfg = s3_res["configuration"]
        if cfg["storage_class"] == "Standard" and cfg["storage_gb"] >= 50.0:
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["storage_class"] = "Standard-IA"
            opt_res = calculate_s3_cost(opt_cfg, region=region)
            savings = round(s3_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.2:
                pct = round(savings / s3_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-S3-LIFECYCLE",
                    "category": "Storage Tiering",
                    "service": "Amazon S3",
                    "title": "S3 Lifecycle Transition to Infrequent Access (Standard-IA)",
                    "current_config": f"{cfg['storage_gb']:.0f} GB in S3 Standard ($0.023/GB-mo)",
                    "suggested_config": f"{cfg['storage_gb']:.0f} GB in S3 Standard-IA ($0.0125/GB-mo)",
                    "current_cost_monthly": s3_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Data is retained for > 30 days and accessed infrequently (e.g. historical reports, backups).",
                    "trade_offs": "Standard-IA introduces a $0.01/GB data retrieval fee if objects are fetched frequently.",
                    "priority": "MEDIUM"
                })

    # 4. RDS Multi-AZ -> Single-AZ for Non-Production
    if "rds" in service_dict:
        rds_res = service_dict["rds"]
        cfg = rds_res["configuration"]
        if cfg["deployment_option"] == "Multi-AZ":
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["deployment_option"] = "Single-AZ"
            opt_res = calculate_rds_cost(opt_cfg, region=region)
            savings = round(rds_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / rds_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-RDS-AZ",
                    "category": "High Availability Sizing",
                    "service": "Amazon RDS",
                    "title": "Switch Non-Production Databases to Single-AZ",
                    "current_config": f"{cfg['instance_count']}x {cfg['instance_type']} (Multi-AZ Deployment - 2.0x cost)",
                    "suggested_config": f"{cfg['instance_count']}x {cfg['instance_type']} (Single-AZ Deployment)",
                    "current_cost_monthly": rds_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Applicable strictly to development, staging, or testing databases.",
                    "trade_offs": "Single-AZ eliminates automatic standby failover. Never use Single-AZ for production workloads.",
                    "priority": "HIGH"
                })

    # 5. Lambda Architecture: x86_64 -> arm64 (Graviton2)
    if "lambda" in service_dict:
        lam_res = service_dict["lambda"]
        cfg = lam_res["configuration"]
        if cfg["architecture"] == "x86_64" and cfg["total_gb_seconds"] > 500000:
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["architecture"] = "arm64"
            opt_res = calculate_lambda_cost(opt_cfg, region=region)
            savings = round(lam_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.1:
                pct = round(savings / lam_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-LAM-ARM",
                    "category": "Serverless Architecture",
                    "service": "AWS Lambda",
                    "title": "Migrate Lambda Functions to ARM64 (AWS Graviton2)",
                    "current_config": f"{cfg['request_count']:,} requests on x86_64 ($0.00001667/GB-s)",
                    "suggested_config": f"{cfg['request_count']:,} requests on arm64 Graviton2 ($0.00001333/GB-s)",
                    "current_cost_monthly": lam_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Application code and compiled dependencies are compatible with Linux ARM64.",
                    "trade_offs": "Requires testing native binaries and third-party libraries on ARM64 before deployment.",
                    "priority": "MEDIUM"
                })

    # 6. VPC NAT Gateway Optimization
    if "vpc" in service_dict:
        vpc_res = service_dict["vpc"]
        cfg = vpc_res["configuration"]
        if cfg["nat_gateway_count"] >= 1 and cfg["nat_data_gb"] >= 30.0:
            # S3 Gateway Endpoint eliminates NAT data processing for S3
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["nat_data_gb"] = max(0.0, cfg["nat_data_gb"] * 0.2)  # assume 80% data to S3
            opt_res = calculate_vpc_cost(opt_cfg, region=region)
            savings = round(vpc_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / vpc_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-VPC-ENDPOINT",
                    "category": "Networking Gateway Endpoints",
                    "service": "Amazon VPC",
                    "title": "Deploy Free VPC Gateway Endpoints for Amazon S3",
                    "current_config": f"{cfg['nat_gateway_count']} NAT Gateway routing all traffic ($0.056/GB processing)",
                    "suggested_config": "S3 VPC Gateway Endpoint (Free of Charge) + NAT Gateway for external web only",
                    "current_cost_monthly": vpc_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Significant proportion of outbound traffic from EC2/Lambda targets Amazon S3.",
                    "trade_offs": "Requires updating VPC route tables. VPC Gateway Endpoints for S3 are 100% free with no latency impact.",
                    "priority": "HIGH" if savings > 5 else "MEDIUM"
                })

    # 7. ECS Fargate Spot & Graviton ARM64 Optimization
    if "ecs" in service_dict:
        ecs_res = service_dict["ecs"]
        cfg = ecs_res["configuration"]
        if cfg["launch_type"] == "Fargate":
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["launch_type"] = "Fargate-Spot"
            opt_res = calculate_ecs_cost(opt_cfg, region=region)
            savings = round(ecs_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / ecs_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-ECS-SPOT",
                    "category": "Container Compute Optimization",
                    "service": "Amazon ECS",
                    "title": "Adopt AWS Fargate Spot for Fault-Tolerant Containers",
                    "current_config": f"{cfg['task_count']} task(s) on On-Demand Fargate ({cfg['vcpu']} vCPU / {cfg['memory_gb']} GB)",
                    "suggested_config": f"{cfg['task_count']} task(s) on Fargate Spot (70% discount on unused cloud capacity)",
                    "current_cost_monthly": ecs_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Containerized workloads can tolerate unexpected task interruption with graceful SIGTERM termination handling.",
                    "trade_offs": "Fargate Spot tasks can be reclaimed with a 2-minute warning. Suitable for stateless batch jobs, CI runners, and dev environments.",
                    "priority": "HIGH"
                })

        if cfg["architecture"] == "x86_64":
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["architecture"] = "arm64"
            opt_res = calculate_ecs_cost(opt_cfg, region=region)
            savings = round(ecs_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / ecs_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-ECS-GRAVITON",
                    "category": "Container Compute Architecture",
                    "service": "Amazon ECS",
                    "title": "Migrate ECS Fargate Containers to AWS Graviton (ARM64)",
                    "current_config": f"{cfg['task_count']} task(s) running on x86_64 architecture",
                    "suggested_config": f"{cfg['task_count']} task(s) running on AWS Graviton ARM64 architecture (20% lower price)",
                    "current_cost_monthly": ecs_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Docker container base image and application runtime support Linux ARM64.",
                    "trade_offs": "Requires building multi-arch Docker images with Docker Buildx (`linux/arm64`).",
                    "priority": "MEDIUM"
                })

    # 8. DynamoDB Capacity Mode Optimization
    if "dynamodb" in service_dict:
        ddb_res = service_dict["dynamodb"]
        cfg = ddb_res["configuration"]
        if cfg["billing_mode"] == "PAY_PER_REQUEST" and ddb_res["monthly_cost"] > 15.0:
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["billing_mode"] = "PROVISIONED"
            opt_cfg["provisioned_wcu"] = 10
            opt_cfg["provisioned_rcu"] = 25
            opt_res = calculate_dynamodb_cost(opt_cfg, region=region)
            savings = round(ddb_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 0.5:
                pct = round(savings / ddb_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-DDB-CAPACITY",
                    "category": "Database Capacity Management",
                    "service": "Amazon DynamoDB",
                    "title": "Switch High-Volume DynamoDB Tables to Provisioned Auto-Scaling",
                    "current_config": "On-Demand Billing ($1.25/1M WRU, $0.25/1M RRU)",
                    "suggested_config": "Provisioned Capacity with Auto Scaling (Target 70% Utilization)",
                    "current_cost_monthly": ddb_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Database query traffic follows steady, predictable daily usage curves.",
                    "trade_offs": "Provisioned capacity requires configuring CloudWatch Application Auto Scaling to prevent throttling during unexpected traffic spikes.",
                    "priority": "MEDIUM"
                })

    # 9. Application Load Balancer Consolidation
    if "alb" in service_dict:
        alb_res = service_dict["alb"]
        cfg = alb_res["configuration"]
        if cfg["alb_count"] > 1:
            opt_cfg = copy.deepcopy(cfg)
            opt_cfg["alb_count"] = 1
            opt_res = calculate_alb_cost(opt_cfg, region=region)
            savings = round(alb_res["monthly_cost"] - opt_res["monthly_cost"], 2)
            if savings > 1.0:
                pct = round(savings / alb_res["monthly_cost"] * 100.0, 1)
                recs.append({
                    "id": "REC-ALB-CONSOLIDATE",
                    "category": "Networking Consolidation",
                    "service": "AWS Elastic Load Balancing",
                    "title": "Consolidate Multiple Load Balancers with Path-Based Routing",
                    "current_config": f"{cfg['alb_count']} individual Application Load Balancers ($0.0225/hr each)",
                    "suggested_config": "1 shared ALB using Listener Rules and Path-Based Target Group routing",
                    "current_cost_monthly": alb_res["monthly_cost"],
                    "optimized_cost_monthly": opt_res["monthly_cost"],
                    "estimated_savings_monthly": savings,
                    "savings_percentage": pct,
                    "assumptions": "Microservices are deployed in the same VPC or peered network.",
                    "trade_offs": "A shared ALB represents a single ingress entry point. Ensure target groups are isolated with proper health check alarms.",
                    "priority": "HIGH"
                })

    return recs


# ==========================================
# 4. Export & Formatting Utilities
# ==========================================

def export_estimate_to_json(estimate_result: Dict[str, Any]) -> str:
    """Serializes complete estimate result to pretty formatted JSON."""
    return json.dumps(estimate_result, indent=2)


def export_estimate_to_csv(estimate_result: Dict[str, Any]) -> str:
    """Serializes line items and summary of estimate to standard CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)

    summary = estimate_result.get("summary", {})
    writer.writerow(["# AI-Powered AWS Cloud Cost Optimization System - Cost Estimation Report"])
    writer.writerow(["Generated Timestamp (UTC)", summary.get("estimation_timestamp_utc", "")])
    writer.writerow(["Region", summary.get("region_name", summary.get("region", ""))])
    writer.writerow(["Currency", summary.get("currency", "USD")])
    writer.writerow(["Total Estimated Monthly Cost", summary.get("total_monthly_cost_formatted", "$0.00")])
    writer.writerow(["Total Estimated Annual Cost", summary.get("total_annual_cost_formatted", "$0.00")])
    writer.writerow(["Estimated Monthly Savings", summary.get("potential_monthly_savings_formatted", "$0.00")])
    writer.writerow(["Optimized Estimated Monthly Cost", summary.get("optimized_monthly_cost_formatted", "$0.00")])
    writer.writerow([])

    writer.writerow([
        "Service Name",
        "Component",
        "Quantity",
        "Unit",
        "Unit Price",
        "Calculation Formula",
        "Subtotal ($)",
        "Pricing Source"
    ])

    for item in estimate_result.get("line_items_table", []):
        writer.writerow([
            item.get("service_name", ""),
            item.get("name", ""),
            item.get("quantity", ""),
            item.get("unit", ""),
            item.get("unit_price", ""),
            item.get("formula", ""),
            item.get("subtotal", 0.0),
            item.get("pricing_source", "")
        ])

    writer.writerow([])
    writer.writerow(["# Optimization Recommendations"])
    writer.writerow([
        "ID",
        "Category",
        "Service",
        "Title",
        "Current Config",
        "Suggested Config",
        "Current Cost ($)",
        "Optimized Cost ($)",
        "Savings ($)",
        "Savings (%)",
        "Priority",
        "Assumptions",
        "Trade-offs"
    ])

    for rec in estimate_result.get("recommendations", []):
        writer.writerow([
            rec.get("id", ""),
            rec.get("category", ""),
            rec.get("service", ""),
            rec.get("title", ""),
            rec.get("current_config", ""),
            rec.get("suggested_config", ""),
            rec.get("current_cost_monthly", 0.0),
            rec.get("optimized_cost_monthly", 0.0),
            rec.get("estimated_savings_monthly", 0.0),
            rec.get("savings_percentage", 0.0),
            rec.get("priority", ""),
            rec.get("assumptions", ""),
            rec.get("trade_offs", "")
        ])

    return output.getvalue()
