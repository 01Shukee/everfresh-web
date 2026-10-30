import { Button } from "@/components/ui/Button";
export default function NotFound() {
  return (
    <div className="wrap sec">
      <h1 className="serif page-title">We couldn&rsquo;t find that page.</h1>
      <Button href="/">Back to home</Button>
    </div>
  );
}
