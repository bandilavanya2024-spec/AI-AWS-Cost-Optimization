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
except ImportError:
    from cost_analyzer import analyze_costs, fetch_aws_cost_data, save_report_to_s3

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
    if raw_path in ("/save-report", "/api/save-report") or (http_method.upper() == "POST" and "save" in raw_path.lower()):
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
            status_code = 200 if save_result.get("status") == "success" else 500
            return build_response(status_code, save_result)

        except Exception as s3_exc:
            logger.error(f"Error handling S3 report save: {str(s3_exc)}")
            return build_response(500, {
                "status": "error",
                "message": "Failed to persist report snapshot to S3.",
                "error_details": str(s3_exc)
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
