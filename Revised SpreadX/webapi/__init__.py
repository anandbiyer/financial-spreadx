"""webapi — thin subprocess-op layer bridging the Next.js frontend to the Python backend.

The frontend invokes ``python -m webapi.ops <command> --json '<payload>'``; each command
reuses the existing ``db.queries`` / ``spreading`` / ``export`` code and prints a single
JSON object to stdout. See ``Design Docs/FrontendDesign.md`` §9.1 for the contract.
"""
