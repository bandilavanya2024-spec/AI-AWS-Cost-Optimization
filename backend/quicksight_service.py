"""
Amazon QuickSight Integration Module for AI-Powered AWS Cost Optimization System
Generates QuickSight S3 Manifest files, SPICE tabular dataset exports,
and BI dashboard specifications to deliver "Optimized Cost ($)" visual intelligence.
"""

import csv
import datetime
import io
import json
import logging
import os
from typing import Any, Dict, List, Tuple

logger = logging.getLogger("quicksight_service")
logger.setLevel(logging.INFO)

DEFAULT_REPORTS_BUCKET = os.environ.get(
    "REPORTS_S3_BUCKET",
    "cost-optimizer-reports-226234259454"
)


def generate_quicksight_manifest(
    bucket_name: str = DEFAULT_REPORTS_BUCKET,
    prefix: str = "reports/"
) -> Dict[str, Any]:
    """
    Generates official AWS QuickSight S3 Manifest JSON.
    Allows QuickSight SPICE engine to connect directly to the private S3 reports bucket.
    """
    return {
        "fileLocations": [
            {
                "URIPrefixes": [
                    f"s3://{bucket_name}/{prefix}"
                ]
            }
        ],
        "globalUploadSettings": {
            "format": "JSON",
            "delimiter": ",",
            "textqualifier": "\"",
            "firstRowAsHeader": "true"
        }
    }


def format_tabular_dataset_for_spice(report_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Transforms multi-service cost report into tabular rows optimized for QuickSight SPICE.
    """
    summary = report_data.get("summary", {})
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    currency = summary.get("currency", "USD")
    region = summary.get("region", "ap-south-1")

    rows = []
    service_breakdown = report_data.get("service_breakdown", {})
    recs = report_data.get("recommendations", [])

    # Map recommendations by service for easy lookup
    rec_by_service: Dict[str, str] = {}
    if isinstance(recs, list):
        for r in recs:
            s_name = (r.get("service") or r.get("service_name") or "").lower()
            if s_name:
                rec_by_service[s_name] = r.get("title") or r.get("recommendation", "")

    if isinstance(service_breakdown, dict):
        for svc_key, svc_info in service_breakdown.items():
            if not isinstance(svc_info, dict):
                continue
            base_cost = svc_info.get("monthly_cost") or svc_info.get("cost") or 0.0
            optimized_cost = svc_info.get("optimized_monthly_cost") or (base_cost * 0.70)
            savings = max(0.0, round(base_cost - optimized_cost, 2))
            savings_pct = round((savings / base_cost * 100), 1) if base_cost > 0 else 0.0

            rows.append({
                "Date": now_str,
                "Region": region,
                "Currency": currency,
                "ServiceKey": svc_key.upper(),
                "ServiceName": svc_info.get("service_name") or svc_key.title(),
                "BaselineCost": round(float(base_cost), 2),
                "OptimizedCost": round(float(optimized_cost), 2),
                "PotentialSavings": savings,
                "SavingsPercentage": savings_pct,
                "TopRecommendation": rec_by_service.get(svc_key.lower(), "Standard Cost Governance")
            })

    # If no services were broken down, add summary baseline
    if not rows:
        total_cost = float(summary.get("total_monthly_cost") or 0.0)
        total_savings = float(summary.get("potential_monthly_savings") or 0.0)
        rows.append({
            "Date": now_str,
            "Region": region,
            "Currency": currency,
            "ServiceKey": "TOTAL",
            "ServiceName": "All Services Combined",
            "BaselineCost": round(total_cost, 2),
            "OptimizedCost": round(max(0.0, total_cost - total_savings), 2),
            "PotentialSavings": round(total_savings, 2),
            "SavingsPercentage": float(summary.get("savings_percentage") or 0.0),
            "TopRecommendation": "Holistic Architecture Optimization"
        })

    return rows


def export_spice_dataset_csv(report_data: Dict[str, Any]) -> str:
    """Exports QuickSight SPICE compatible CSV text."""
    rows = format_tabular_dataset_for_spice(report_data)
    if not rows:
        return ""

    output = io.StringIO()
    headers = list(rows[0].keys())
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def get_quicksight_analysis_spec() -> Dict[str, Any]:
    """Returns visual layout definition for QuickSight Cloud Cost Intelligence."""
    return {
        "AnalysisName": "AI AWS Cost Optimization Executive Dashboard",
        "Visuals": [
            {
                "Title": "Baseline vs Optimized Monthly Spend",
                "VisualType": "StackedBarChart",
                "XAxis": "Date",
                "YAxis": ["BaselineCost", "OptimizedCost"],
                "Category": "ServiceKey"
            },
            {
                "Title": "Realized Savings Distribution by Service",
                "VisualType": "DonutChart",
                "Measure": "PotentialSavings",
                "Group": "ServiceName"
            },
            {
                "Title": "High-Impact Architectural Remediation Table",
                "VisualType": "PivotTable",
                "Columns": ["ServiceName", "TopRecommendation", "PotentialSavings", "SavingsPercentage"]
            }
        ]
    }
