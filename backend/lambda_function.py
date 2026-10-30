"""
AWS Lambda Handler: Cost Optimization Backend Microservice
Serves Amazon API Gateway HTTP API requests with CORS support.
Routes:
- GET /cost-analysis : Retrieves cost breakdown and heuristic recommendations
- POST /save-report  : Explicitly saves cost analysis report snapshot to Amazon S3
- GET /health        : Health check
- OPTIONS (any path) : CORS preflight
"""

import json
import logging
from typing import Any, Dict

# Support relative import when running as package, or local import in Lambda root
try:
    from backend.cost_analyzer import analyze_costs, fetch_aws_cost_data, save_report_to_s3
    from backend.estimator_engine import estimate_total_costs, export_estimate_to_json, export_estimate_to_csv
    from backend.dynamodb_service import save_record_to_dynamodb, get_record_from_dynamodb, list_recent_records
    from backend.sns_service import publish_cost_alert
    from backend.quicksight_service import generate_quicksight_manifest, format_tabular_dataset_for_spice, export_spice_dataset_csv
except ImportError:
    from cost_analyzer import analyze_costs, fetch_aws_cost_data, save_report_to_s3
    from estimator_engine import estimate_total_costs, export_estimate_to_json, export_estimate_to_csv
    from dynamodb_service import save_record_to_dynamodb, get_record_from_dynamodb, list_recent_records
    from sns_service import publish_cost_alert
    from quicksight_service import generate_quicksight_manifest, format_tabular_dataset_for_spice, export_spice_dataset_csv

logger = logging.getLogger("lambda_handler")
logger.setLevel(logging.INFO)

CORS_HEADERS: Dict[str, str] = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
}


def build_response(status_code: int, body_data: Any) -> Dict[str, Any]:
    """Generates standard API Gateway proxy response with CORS headers."""
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_data)
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point.
    Compatible with API Gateway HTTP API (Payload v2.0) and REST API (Payload v1.0).
    """
    logger.info("Received event for cost optimization microservice.")

    # Determine HTTP method
    http_method = "GET"
    if "requestContext" in event:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    elif "httpMethod" in event:
        http_method = event.get("httpMethod", "GET")

    # Handle CORS preflight OPTIONS request
    if http_method.upper() == "OPTIONS":
        return build_response(200, {"message": "Preflight OK"})

    # Determine requested path
    raw_path = event.get("rawPath") or event.get("path") or "/"

    # Health check route
    if raw_path in ("/health", "/api/health"):
        return build_response(200, {
            "status": "healthy",
            "service": "ai-aws-cost-optimization",
            "description": "Serverless AWS Cost Optimization Backend Microservice"
        })

    # Route: Explicit User-Triggered Report Save to S3
    if raw_path in ("/save-report", "/api/save-report") or (http_method.upper() == "POST" and "save-report" in raw_path.lower()):
        logger.info("Processing user-triggered S3 report save request.")
        try:
            report_payload = None
            if event.get("body"):
                try:
                    report_payload = json.loads(event["body"])
                except Exception:
                    report_payload = None

            if not report_payload or not isinstance(report_payload, dict) or "summary" not in report_payload:
                # If no valid report was sent in body, generate a fresh analysis to store
                service_costs, data_source, message = fetch_aws_cost_data(bypass_cache=False)
                report_payload = analyze_costs(service_costs, data_source, message)

            save_result = save_report_to_s3(report_payload)
            # Seamlessly mirror report snapshot to Amazon DynamoDB
            try:
                dynamo_res = save_record_to_dynamodb(report_payload, record_type="REPORT_SNAPSHOT")
                save_result["dynamodb"] = dynamo_res
            except Exception as d_exc:
                logger.warning(f"DynamoDB record storage skipped: {d_exc}")

            status_code = 200 if save_result.get("status") == "success" else 500
            return build_response(status_code, save_result)

        except Exception as s3_exc:
            logger.error(f"Error handling S3 report save: {str(s3_exc)}")
            return build_response(500, {
                "status": "error",
                "message": "Failed to persist report snapshot to S3.",
                "error_details": str(s3_exc)
            })

    # Route: Explicit Amazon DynamoDB Persistence
    if raw_path in ("/save-dynamodb", "/api/save-dynamodb"):
        logger.info("Processing DynamoDB record persistence request.")
        try:
            body_data = json.loads(event.get("body") or "{}")
            record_payload = body_data.get("record_data", body_data)
            rec_type = body_data.get("record_type", "ESTIMATE")
            result = save_record_to_dynamodb(record_payload, record_type=rec_type)
            return build_response(200, result)
        except Exception as d_exc:
            logger.error(f"Error persisting to DynamoDB: {d_exc}")
            return build_response(500, {"status": "error", "message": str(d_exc)})

    # Route: List Recent DynamoDB Records
    if raw_path in ("/list-records", "/api/list-records"):
        logger.info("Fetching recent records from DynamoDB / fallback store.")
        try:
            query_params = event.get("queryStringParameters") or {}
            limit = int(query_params.get("limit", 10))
            records = list_recent_records(limit=limit)
            return build_response(200, {"status": "success", "count": len(records), "records": records})
        except Exception as list_exc:
            logger.error(f"Error listing records: {list_exc}")
            return build_response(500, {"status": "error", "message": str(list_exc)})

    # Route: Amazon SNS Optimization Alert Dispatcher
    if raw_path in ("/send-alert", "/api/send-alert") or (http_method.upper() == "POST" and "alert" in raw_path.lower()):
        logger.info("Processing Amazon SNS cost optimization alert request.")
        try:
            body_data = json.loads(event.get("body") or "{}")
            report_data = body_data.get("report_data", body_data)
            alert_type = body_data.get("alert_type", "SAVINGS_OPPORTUNITY")
            alert_res = publish_cost_alert(report_data, alert_type=alert_type)
            return build_response(200, alert_res)
        except Exception as alert_exc:
            logger.error(f"Error dispatching SNS alert: {alert_exc}")
            return build_response(500, {"status": "error", "message": str(alert_exc)})

    # Route: Amazon QuickSight Manifest
    if raw_path in ("/quicksight-manifest", "/api/quicksight-manifest"):
        logger.info("Generating Amazon QuickSight S3 dataset manifest.")
        manifest = generate_quicksight_manifest()
        return build_response(200, manifest)

    # Route: Amazon QuickSight Tabular Dataset Export
    if raw_path in ("/quicksight-dataset", "/api/quicksight-dataset"):
        logger.info("Exporting QuickSight SPICE dataset.")
        try:
            body_data = json.loads(event.get("body") or "{}") if event.get("body") else {}
            report_data = body_data.get("report_data", body_data)
            as_csv = str(event.get("queryStringParameters", {}).get("format", "")).lower() == "csv"

            if as_csv:
                csv_data = export_spice_dataset_csv(report_data)
                return {
                    "statusCode": 200,
                    "headers": {
                        "Content-Type": "text/csv",
                        "Content-Disposition": "attachment; filename=quicksight_spice_dataset.csv",
                        "Access-Control-Allow-Origin": "*"
                    },
                    "body": csv_data
                }
            else:
                tabular_rows = format_tabular_dataset_for_spice(report_data)
                return build_response(200, {"status": "success", "rows": tabular_rows})
        except Exception as qs_exc:
            logger.error(f"Error formatting QuickSight dataset: {qs_exc}")
            return build_response(500, {"status": "error", "message": str(qs_exc)})

    # Route: Interactive Cost Estimation
    if raw_path in ("/estimate-cost", "/api/estimate-cost", "/estimate") or (http_method.upper() == "POST" and "estimate" in raw_path.lower()):
        logger.info("Processing interactive cost estimation request.")
        try:
            body_data = {}
            if event.get("body"):
                try:
                    body_data = json.loads(event["body"])
                except Exception:
                    body_data = {}

            service_configs = body_data.get("service_configs", body_data)
            region = body_data.get("region", "ap-south-1")
            currency = body_data.get("currency", "USD")
            inr_rate = float(body_data.get("inr_rate", 83.50))

            estimate_result = estimate_total_costs(
                service_configs=service_configs,
                region=region,
                currency=currency,
                inr_rate=inr_rate
            )
            return build_response(200, estimate_result)
        except Exception as est_exc:
            logger.error(f"Error calculating cost estimate: {str(est_exc)}")
            return build_response(500, {
                "status": "error",
                "message": "Failed to calculate cost estimate.",
                "error_details": str(est_exc)
            })

    # Default Route: Cost Analysis & Optimization Recommendations
    try:
        query_params = event.get("queryStringParameters") or {}
        force_demo = str(query_params.get("force_demo", "")).lower() in ("true", "1", "yes")
        bypass_cache = str(query_params.get("bypass_cache", "")).lower() in ("true", "1", "yes")

        service_costs, data_source, message = fetch_aws_cost_data(
            bypass_cache=bypass_cache,
            force_demo=force_demo
        )

        analysis_result = analyze_costs(
            service_costs=service_costs,
            data_source=data_source,
            data_source_message=message
        )

        return build_response(200, analysis_result)

    except Exception as exc:
        logger.error(f"Error handling cost analysis request: {str(exc)}")
        return build_response(500, {
            "status": "error",
            "message": "Internal processing error during cost analysis.",
            "error_hint": "Please check CloudWatch logs for details."
        })


if __name__ == "__main__":
    # Quick local test
    res = lambda_handler({"rawPath": "/cost-analysis", "queryStringParameters": {"force_demo": "true"}}, None)
    print("Cost Analysis Response:", res["statusCode"])
