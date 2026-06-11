import Link from "next/link";

export default function NotFound() {
  return (
    <div className="screen">
      <div className="tb"><span className="pg-t">Not found</span></div>
      <div className="screen-body">
        <div className="card">
          <div className="card-body placeholder-note">
            <strong>That document or page wasn&rsquo;t found.</strong>{" "}
            <Link href="/" className="al">← Back to Document Library</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
