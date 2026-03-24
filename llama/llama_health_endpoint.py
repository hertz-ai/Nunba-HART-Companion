"""
llama_health_endpoint.py - Health endpoint wrapper for Nunba-managed Llama.cpp server

This module provides a health endpoint that wraps the standard llama.cpp health endpoint
and adds Nunba identification, allowing external processes to detect whether this is
a Nunba-managed server or an external llama.cpp installation.
"""

import logging
import time

import requests
from flask import Flask, jsonify

logger = logging.getLogger('NunbaLlamaHealth')


class LlamaHealthWrapper:
    """Wraps llama.cpp health endpoint with Nunba identification"""

    def __init__(self, llama_port: int = 8080, wrapper_port: int | None = None):
        """
        Initialize health wrapper

        Args:
            llama_port: Port where llama.cpp server is running
            wrapper_port: Port to run wrapper on (defaults to llama_port)
        """
        self.llama_port = llama_port
        self.wrapper_port = wrapper_port or llama_port
        self.llama_base_url = f"http://127.0.0.1:{llama_port}"

    def get_llama_health(self) -> dict:
        """
        Get health status from the underlying llama.cpp server

        Returns:
            Health status dict from llama.cpp
        """
        try:
            response = requests.get(f"{self.llama_base_url}/health", timeout=2)
            if response.status_code == 200:
                return response.json()
            else:
                return {"status": "error", "error": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_nunba_health(self) -> dict:
        """
        Get health status with Nunba identification

        Returns:
            Enhanced health status including Nunba metadata
        """
        # Get base health from llama.cpp
        llama_health = self.get_llama_health()

        # Add Nunba identification
        nunba_health = {
            "managed_by": "Nunba",
            "nunba_version": "2.0.0",
            "wrapper_port": self.wrapper_port,
            "llama_port": self.llama_port,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "llama_health": llama_health
        }

        # Merge status from llama.cpp
        if "status" in llama_health:
            nunba_health["status"] = llama_health["status"]
        else:
            nunba_health["status"] = "ok"

        return nunba_health


def add_health_routes(app: Flask, llama_config=None):
    """
    Add Nunba health endpoints to a Flask app

    Args:
        app: Flask application instance
        llama_config: Optional LlamaConfig instance to get port info
    """

    @app.route('/health', methods=['GET'])
    def health():
        """
        Nunba health endpoint

        Returns health status with Nunba identification marker
        """
        try:
            # Get port from config or use default
            if llama_config:
                llama_port = llama_config.config.get("server_port", 8080)
                wrapper = LlamaHealthWrapper(llama_port=llama_port)
            else:
                wrapper = LlamaHealthWrapper()

            health_data = wrapper.get_nunba_health()
            return jsonify(health_data), 200

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return jsonify({
                "managed_by": "Nunba",
                "status": "error",
                "error": str(e),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }), 500

    @app.route('/nunba/info', methods=['GET'])
    def nunba_info():
        """
        Nunba information endpoint

        Returns information about Nunba and the local AI setup
        """
        try:
            info = {
                "application": "Nunba",
                "version": "2.0.0",
                "description": "A Friend, A Well Wisher, Your LocalMind",
                "ai_capabilities": {
                    "local_llm": True,
                    "managed_by": "Nunba",
                    "engine": "llama.cpp"
                },
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }

            # Add config info if available
            if llama_config:
                info["ai_config"] = {
                    "port": llama_config.config.get("server_port", 8080),
                    "gpu_enabled": llama_config.config.get("use_gpu", False),
                    "context_size": llama_config.config.get("context_size", 4096),
                    "selected_model_index": llama_config.config.get("selected_model_index", 0)
                }

                # Add model info
                model_preset = llama_config.get_selected_model_preset()
                if model_preset:
                    info["ai_config"]["model"] = {
                        "name": model_preset.display_name,
                        "size_mb": model_preset.size_mb,
                        "has_vision": model_preset.has_vision,
                        "description": model_preset.description
                    }

            return jsonify(info), 200

        except Exception as e:
            logger.error(f"Info endpoint failed: {e}")
            return jsonify({
                "error": str(e)
            }), 500

    @app.route('/nunba/ai/status', methods=['GET'])
    def ai_status():
        """
        AI status endpoint

        Returns detailed status of the AI server
        """
        try:
            if not llama_config:
                return jsonify({
                    "error": "AI configuration not available"
                }), 503

            port = llama_config.config.get("server_port", 8080)
            is_running = llama_config.check_server_running(port)
            server_type, server_info = llama_config.check_server_type(port)

            status = {
                "running": is_running,
                "server_type": server_type,
                "port": port,
                "api_base": llama_config.api_base,
                "gpu_available": llama_config.installer.gpu_available,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
            }

            if server_info:
                status["server_info"] = server_info

            # Add model info
            model_preset = llama_config.get_selected_model_preset()
            if model_preset:
                status["model"] = {
                    "name": model_preset.display_name,
                    "size_mb": model_preset.size_mb,
                    "has_vision": model_preset.has_vision
                }

                # Check if model is downloaded
                model_path = llama_config.installer.get_model_path(model_preset)
                status["model"]["downloaded"] = model_path is not None
                if model_path:
                    status["model"]["path"] = model_path

            return jsonify(status), 200

        except Exception as e:
            logger.error(f"AI status endpoint failed: {e}")
            return jsonify({
                "error": str(e),
                "running": False
            }), 500

    logger.info("Nunba health and info endpoints registered")


if __name__ == "__main__":
    # Test the health wrapper
    import sys

    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = 8080

    wrapper = LlamaHealthWrapper(llama_port=port)
    health_data = wrapper.get_nunba_health()

    print("\nNunba Health Check:")
    print("=" * 50)
    import json
    print(json.dumps(health_data, indent=2))
    print("=" * 50)
