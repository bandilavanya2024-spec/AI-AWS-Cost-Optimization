"""
Amazon ECS (Fargate) Container HTTP Server
Wraps the cost optimization microservice as a standalone HTTP server.
Designed for containerized execution on Amazon ECS with Application Load Balancer (ALB) health checks.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import logging
import os
import sys
from urllib.parse import parse_qs, urlparse

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from lambda_function import lambda_handler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ecs_container_server")

PORT = int(os.environ.get("PORT", 8080))


class ECSRequestHandler(BaseHTTPRequestHandler):
    """HTTP request handler compatible with AWS ALB and API Gateway schemas."""

    def _send_response(self, result: dict):
        status_code = result.get("statusCode", 200)
        self.send_response(status_code)

        headers = result.get("headers", {})
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()

        body = result.get("body", "")
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        self.wfile.write(body.encode("utf-8"))

    def do_OPTIONS(self):
        """Handles CORS preflight requests from web browsers."""
        event = {
            "httpMethod": "OPTIONS",
            "path": self.path,
            "rawPath": self.path,
            "headers": dict(self.headers)
        }
        res = lambda_handler(event, None)
        self._send_response(res)

    def do_GET(self):
        parsed = urlparse(self.path)
        query_dict = {k: v[0] if len(v) == 1 else v for k, v in parse_qs(parsed.query).items()}

        event = {
            "httpMethod": "GET",
            "path": parsed.path,
            "rawPath": parsed.path,
            "queryStringParameters": query_dict,
            "headers": dict(self.headers)
        }
        res = lambda_handler(event, None)
        self._send_response(res)

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get("Content-Length", 0))
        body_str = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else ""

        event = {
            "httpMethod": "POST",
            "path": parsed.path,
            "rawPath": parsed.path,
            "body": body_str,
            "headers": dict(self.headers)
        }
        res = lambda_handler(event, None)
        self._send_response(res)

    def log_message(self, format, *args):
        logger.info("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))


def run_server():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, ECSRequestHandler)
    logger.info(f"🚀 AI-Powered AWS Cost Optimizer ECS Microservice running on 0.0.0.0:{PORT}")
    logger.info("Ready for Application Load Balancer (ALB) health checks on /health")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopping ECS server gracefully...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
