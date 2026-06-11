"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="screen">
      <div className="tb"><span className="pg-t">Error</span></div>
      <div className="screen-body">
        <div className="card">
          <div className="card-body placeholder-note">
            <strong>Something went wrong.</strong> {error.message}
            <button className="btn bg btn-sm" style={{ marginLeft: 8 }} onClick={reset}>
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
