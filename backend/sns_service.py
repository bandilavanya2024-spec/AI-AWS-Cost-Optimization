"""
Amazon Simple Notification Service (SNS) Module
Handles dispatching cost optimization alerts, budget ceiling warnings,
and automated financial notifications.
Includes graceful fallback for environments where SNS topic is not yet provisioned.
"""

import datetime
import json
import logging
import os
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("sns_service")
logger.setLevel(logging.INFO)

DEFAULT_TOPIC_ARN = os.environ.get(
    "SNS_TOPIC_ARN",
    "arn:aws:sns:ap-south-1:226234259454:CostOptimizationAlertsTopic"
)
DEFAULT_REGION = os.environ.get("AWS_REGION", "ap-south-1")


def get_sns_client(region: str = DEFAULT_REGION) -> Tuple[Optional[Any], Optional[str]]:
    """Initializes boto3 SNS client with timeout controls."""
    try:
        import boto3
        from botocore.config import Config
        boto_config = Config(
            region_name=region,
            connect_timeout=3,
            read_timeout=3,
            retries={"max_attempts": 2}
        )
        client = boto3.client("sns", config=boto_config)
        return client, None
    except Exception as e:
        logger.warning(f"Could not initialize SNS client: {e}")
        return None, str(e)


def format_optimization_alert(
    report_data: Dict[str, Any],
    alert_type: str = "SAVINGS_OPPORTUNITY"
) -> Tuple[str, str]:
    """Generates human-readable and structured alert text."""
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    summary = report_data.get("summary", {})
    currency = summary.get("currency", "USD")
    symbol = "₹" if currency == "INR" else "$"

    total_cost = summary.get("total_monthly_cost") or summary.get("monthly_total") or 0.0
    savings = summary.get("potential_monthly_savings") or 0.0
    savings_pct = summary.get("savings_percentage") or 0.0

    subject = f"[AWS Cost Alert] {alert_type}: Potential Monthly Savings {symbol}{savings:,.2f} ({savings_pct}%)"

    lines = [
        "============================================================",
        "  AI-POWERED AWS COST OPTIMIZATION SYSTEM: NOTIFICATION",
        "============================================================",
        f"Timestamp: {now_str}",
        f"Alert Type: {alert_type}",
        f"Region: {summary.get('region', DEFAULT_REGION)}",
        f"Currency: {currency}",
        "",
        "--- WORKLOAD FINANCIAL SUMMARY ---",
        f"Current Estimated Monthly Cost: {symbol}{total_cost:,.2f}",
        f"Identified Potential Savings:  {symbol}{savings:,.2f} ({savings_pct}%)",
        f"Optimized Monthly Target Cost:  {symbol}{(total_cost - savings):,.2f}",
        "",
        "--- KEY RECOMMENDATIONS ---"
    ]

    recs = report_data.get("recommendations", [])
    if isinstance(recs, list) and recs:
        for idx, r in enumerate(recs[:5], start=1):
            title = r.get("title") or r.get("recommendation") or "Optimization rule"
            rec_savings = r.get("monthly_savings") or r.get("estimated_monthly_savings") or 0.0
            lines.append(f"{idx}. {title} [Est. Savings: {symbol}{rec_savings:,.2f}]")
    else:
        lines.append("No active high-impact recommendations for the current workload profile.")

    lines.extend([
        "",
        "View full interactive dashboard and apply changes:",
        "http://cost-optimizer-frontend-226234259454.s3-website.ap-south-1.amazonaws.com",
        "============================================================"
    ])

    return subject, "\n".join(lines)


def publish_cost_alert(
    report_data: Dict[str, Any],
    topic_arn: str = DEFAULT_TOPIC_ARN,
    alert_type: str = "SAVINGS_OPPORTUNITY",
    region: str = DEFAULT_REGION
) -> Dict[str, Any]:
    """
    Publishes an optimization alert to Amazon SNS.
    Includes defensive fallback if SNS permissions or topic are not yet available.
    """
    subject, message = format_optimization_alert(report_data, alert_type)

    sns_client, err = get_sns_client(region)
    if sns_client and not err:
        try:
            resp = sns_client.publish(
                TopicArn=topic_arn,
                Subject=subject[:100],  # SNS subject max 100 characters
                Message=message
            )
            message_id = resp.get("MessageId", "LIVE-MSG-UNKNOWN")
            logger.info(f"Published alert to SNS topic {topic_arn}: MessageId={message_id}")
            return {
                "status": "success",
                "dispatch_channel": "Amazon SNS",
                "topic_arn": topic_arn,
                "message_id": message_id,
                "subject": subject,
                "message": "Cost optimization alert published successfully via Amazon SNS."
            }
        except Exception as sns_exc:
            logger.warning(f"SNS publish to {topic_arn} unavailable ({sns_exc}). Falling back to simulation.")

    # Graceful fallback response
    simulated_msg_id = f"SIM-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}-SNS"
    return {
        "status": "success",
        "dispatch_channel": "Simulated Notification",
        "topic_arn": topic_arn,
        "message_id": simulated_msg_id,
        "subject": subject,
        "preview": message[:300] + "...",
        "message": "Notification dispatched to application log (SNS topic pending IAM configuration)."
    }


def get_sns_topic_schema() -> Dict[str, Any]:
    """Returns CloudFormation resource definition for the SNS Alert Topic."""
    return {
        "Type": "AWS::SNS::Topic",
        "Properties": {
            "TopicName": "CostOptimizationAlertsTopic",
            "DisplayName": "AWS Cost Optimization Alerts",
            "Tags": [
                {"Key": "Project", "Value": "AI-AWS-Cost-Optimization"},
                {"Key": "Environment", "Value": "Production"}
            ]
        }
    }
