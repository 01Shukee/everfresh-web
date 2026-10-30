"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap sec" role="alert">
      <h1 className="serif page-title">Something went wrong.</h1>
      <p>Please try again. If it keeps happening, contact us.</p>
      <button className="pill" onClick={reset}>Try again</button>
    </div>
  );
}
