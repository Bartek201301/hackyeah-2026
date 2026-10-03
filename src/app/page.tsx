import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader } from "@/shared/ui";
import { APP_NAME, nav } from "./nav";

export default function Home() {
  return (
    <>
      <PageHeader
        title={APP_NAME}
        description="Start page. Tomorrow: solution overview and entry to the features."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="group">
            <Card className="flex items-center justify-between transition-colors group-hover:border-brand">
              <span className="font-medium">{item.label}</span>
              <ArrowRight className="size-4 text-muted group-hover:text-brand" aria-hidden />
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
