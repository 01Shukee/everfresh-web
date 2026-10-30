import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export function ComingSoon({ title }: { title: string }) {
  return (
    <section className="wrap sec">
      <span className="lab green">In the next build phase</span>
      <h1 className="serif page-title">{title}</h1>
      <EmptyState title="This page is being designed.">
        <p>Its layout is planned in the approved design direction and arrives in a later phase.</p>
        <Button href="/">Back to home</Button>
      </EmptyState>
    </section>
  );
}
