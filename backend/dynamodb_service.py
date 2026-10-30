"""
Amazon DynamoDB Service Module for AI-Powered AWS Cloud Cost Optimization System
Provides persistence for cost estimates, optimization audits, and savings reports.
Includes defensive fallback when DynamoDB tables or IAM permissions are not yet provisioned.
"""

import datetime
import decimal
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("dynamodb_service")
logger.setLevel(logging.INFO)

DEFAULT_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "CostOptimizerRecords")
DEFAULT_REGION = os.environ.get("AWS_REGION", "ap-south-1")

# In-memory defensive cache for local development or when AWS DynamoDB is not provisioned
_FALLBACK_RECORDS_CACHE: Dict[str, Dict[str, Any]] = {}


def _json_serial_for_dynamodb(obj: Any) -> Any:
    """Helper to convert floats to Decimals for DynamoDB serialization."""
    if isinstance(obj, float):
        return decimal.Decimal(str(round(obj, 4)))
    elif isinstance(obj, dict):
        return {k: _json_serial_for_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_json_serial_for_dynamodb(item) for item in obj]
    return obj


def _decimal_to_native(obj: Any) -> Any:
    """Helper to convert Decimals back to float/int for JSON responses."""
    if isinstance(obj, decimal.Decimal):
        return float(obj) if "." in str(obj) else int(obj)
    elif isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_decimal_to_native(item) for item in obj]
    return obj


def get_dynamodb_client(region: str = DEFAULT_REGION) -> Tuple[Optional[Any], Optional[str]]:
    """Initializes DynamoDB resource with error handling."""
    try:
        import boto3
        from botocore.config import Config
        boto_config = Config(
            region_name=region,
            connect_timeout=3,
            read_timeout=3,
            retries={"max_attempts": 2}
        )
        dynamodb = boto3.resource("dynamodb", config=boto_config)
        return dynamodb, None
    except Exception as e:
        logger.warning(f"Could not initialize DynamoDB resource: {e}")
        return None, str(e)


def save_record_to_dynamodb(
    record_data: Dict[str, Any],
    record_type: str = "ESTIMATE",
    table_name: str = DEFAULT_TABLE_NAME,
    region: str = DEFAULT_REGION
) -> Dict[str, Any]:
    """
    Saves a cost estimate, optimization report, or alert audit into DynamoDB.
    Guarantees safe fallback without crashing if DynamoDB is unavailable.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp_iso = now.isoformat()
    record_id = f"REC-{now.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    item = {
        "record_id": record_id,
        "created_at": timestamp_iso,
        "record_type": record_type.upper(),
        "region": region,
        "currency": record_data.get("currency") or record_data.get("summary", {}).get("currency", "USD"),
        "total_monthly_cost": record_data.get("summary", {}).get("total_monthly_cost") or record_data.get("total_monthly_cost", 0.0),
        "potential_savings": record_data.get("summary", {}).get("potential_monthly_savings") or 0.0,
        "payload": record_data
    }

    # Attempt live DynamoDB put_item
    dynamodb, err = get_dynamodb_client(region)
    if dynamodb and not err:
        try:
            table = dynamodb.Table(table_name)
            dynamo_item = _json_serial_for_dynamodb(item)
            table.put_item(Item=dynamo_item)
            logger.info(f"Successfully saved record {record_id} to DynamoDB table {table_name}")
            return {
                "status": "success",
                "storage_backend": "DynamoDB",
                "table_name": table_name,
                "record_id": record_id,
                "created_at": timestamp_iso,
                "message": f"Record persisted securely to Amazon DynamoDB ({table_name})."
            }
        except Exception as dynamo_exc:
            logger.warning(f"DynamoDB put_item unavailable ({dynamo_exc}). Falling back to safe in-memory store.")

    # Graceful fallback to in-memory store
    _FALLBACK_RECORDS_CACHE[record_id] = item
    return {
        "status": "success",
        "storage_backend": "Fallback-Cache",
        "table_name": table_name,
        "record_id": record_id,
        "created_at": timestamp_iso,
        "message": f"Record saved to application cache (DynamoDB table '{table_name}' pending IAM/provisioning)."
    }


def get_record_from_dynamodb(
    record_id: str,
    table_name: str = DEFAULT_TABLE_NAME,
    region: str = DEFAULT_REGION
) -> Optional[Dict[str, Any]]:
    """Retrieves a single record from DynamoDB or in-memory fallback cache."""
    # Check in-memory fallback first
    if record_id in _FALLBACK_RECORDS_CACHE:
        return _FALLBACK_RECORDS_CACHE[record_id]

    dynamodb, err = get_dynamodb_client(region)
    if dynamodb and not err:
        try:
            table = dynamodb.Table(table_name)
            response = table.get_item(Key={"record_id": record_id})
            if "Item" in response:
                return _decimal_to_native(response["Item"])
        except Exception as e:
            logger.warning(f"Error fetching {record_id} from DynamoDB: {e}")

    return None


def list_recent_records(
    limit: int = 10,
    table_name: str = DEFAULT_TABLE_NAME,
    region: str = DEFAULT_REGION
) -> List[Dict[str, Any]]:
    """Returns a list of recent optimization and estimation records."""
    records = list(_FALLBACK_RECORDS_CACHE.values())
    dynamodb, err = get_dynamodb_client(region)
    if dynamodb and not err:
        try:
            table = dynamodb.Table(table_name)
            scan_res = table.scan(Limit=limit)
            items = scan_res.get("Items", [])
            for item in items:
                native_item = _decimal_to_native(item)
                if not any(r["record_id"] == native_item.get("record_id") for r in records):
                    records.append(native_item)
        except Exception as e:
            logger.warning(f"Error scanning DynamoDB: {e}")

    # Sort descending by created_at
    records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return records[:limit]


def get_dynamodb_table_schema() -> Dict[str, Any]:
    """Returns CloudFormation resource definition for the DynamoDB table."""
    return {
        "Type": "AWS::DynamoDB::Table",
        "Properties": {
            "TableName": DEFAULT_TABLE_NAME,
            "BillingMode": "PAY_PER_REQUEST",  # Serverless On-Demand: Zero idle cost
            "AttributeDefinitions": [
                {"AttributeName": "record_id", "AttributeType": "S"}
            ],
            "KeySchema": [
                {"AttributeName": "record_id", "KeyType": "HASH"}
            ],
            "TimeToLiveSpecification": {
                "AttributeName": "ttl_timestamp",
                "Enabled": True
            },
            "Tags": [
                {"Key": "Project", "Value": "AI-AWS-Cost-Optimization"},
                {"Key": "Environment", "Value": "Production"}
            ]
        }
    }
