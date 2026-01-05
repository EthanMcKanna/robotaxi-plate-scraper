#!/usr/bin/env python3
"""
CLI entry point for running the LangGraph agent.
"""
import sys
import os

# Add project root to path so we can import as package
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
grandparent_dir = os.path.dirname(parent_dir)
project_root = os.path.dirname(grandparent_dir)  # Go one more level to project root
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.scrapers.python.agent_main import main

if __name__ == "__main__":
    main()

