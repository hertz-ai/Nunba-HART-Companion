import logging
import os
import subprocess
import sys
import time

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('DebugHang')

# Ensure we can import modules from current directory
logger.info(f"Current working directory: {os.getcwd()}")
sys.path.append(os.getcwd())
logger.info(f"sys.path: {sys.path}")

logger.info("Starting debug_hang.py")

try:
    logger.info("Importing LlamaConfig...")
    from llama.llama_config import LlamaConfig
    logger.info("Imported LlamaConfig")
except Exception as e:
    logger.error(f"Failed to import LlamaConfig: {e}")
    sys.exit(1)

try:
    logger.info("Initializing LlamaConfig...")
    # This is where we suspect the hang is
    config = LlamaConfig() 
    logger.info("LlamaConfig initialized successfully")
except Exception as e:
    logger.error(f"LlamaConfig init failed: {e}")

logger.info("Checking subprocess.run behavior separately...")
try:
    logger.info("Running nvidia-smi check...")
    si = None
    cf = 0
    if sys.platform == 'win32':
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0
        cf = subprocess.CREATE_NO_WINDOW
    
    start_time = time.time()
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
        capture_output=True,
        text=True,
        timeout=5,
        startupinfo=si,
        creationflags=cf
    )
    logger.info(f"nvidia-smi finished in {time.time() - start_time:.2f}s")
    logger.info(f"Return code: {result.returncode}")
    logger.info(f"Output: {result.stdout}")
except subprocess.TimeoutExpired:
    logger.error("nvidia-smi timed out!")
except FileNotFoundError:
    logger.info("nvidia-smi not found")
except Exception as e:
    logger.error(f"subprocess.run failed: {e}")

logger.info("Finished debug_hang.py")
