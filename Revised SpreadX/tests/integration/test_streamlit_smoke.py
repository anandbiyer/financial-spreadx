"""Smoke tests for the Streamlit app — verify imports and callability."""


def test_app_imports():
    """The app module can be imported without error."""
    # Streamlit st.set_page_config etc. run at import time in app.py,
    # so we test the underlying modules instead.
    from pipeline.orchestrator import run_pipeline, PipelineResult
    from export.xlsx_export import build_raw_extraction_xlsx

    assert callable(run_pipeline)
    assert callable(build_raw_extraction_xlsx)
    assert PipelineResult is not None


def test_pipeline_callable():
    """run_pipeline has the expected signature parameters."""
    import inspect
    from pipeline.orchestrator import run_pipeline

    sig = inspect.signature(run_pipeline)
    params = list(sig.parameters.keys())
    assert "pdf_bytes" in params
    assert "template_type" in params
    assert "progress_callback" in params
