"""
Structured logging initialization and job-specific log dispatch.
"""
import logging
import logging.config
import os
from pathlib import Path
import yaml
from backend.app.core.config import PROJECT_ROOT

LOGS_DIR = PROJECT_ROOT / "storage" / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = PROJECT_ROOT / "config" / "logging_config.yaml"

def setup_logging():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
            # Update log file path to absolute path
            log_filename = LOGS_DIR / "platform.log"
            if "handlers" in cfg and "file" in cfg["handlers"]:
                cfg["handlers"]["file"]["filename"] = str(log_filename)
            logging.config.dictConfig(cfg)
    else:
        logging.basicConfig(
            level=logging.INFO,
            format="[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s"
        )

def get_job_logger(job_id: str) -> logging.Logger:
    """
    Creates or returns a dedicated logger for a specific reconstruction job,
    writing directly to a dedicated job log file.
    """
    logger_name = f"job.{job_id}"
    logger = logging.getLogger(logger_name)
    
    # Avoid duplicate handlers
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        job_log_file = LOGS_DIR / f"job_{job_id}.log"
        fh = logging.FileHandler(str(job_log_file), encoding="utf-8")
        formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s")
        fh.setFormatter(formatter)
        logger.addHandler(fh)
        
        # Also log to console
        ch = logging.StreamHandler()
        ch.setFormatter(formatter)
        logger.addHandler(ch)
        logger.propagate = False
        
    return logger
