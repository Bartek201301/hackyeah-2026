import { ClipboardList, PackageCheck, ShoppingBag, UserRound, Wallet } from "lucide-react";
import {
  Badge,
  BarChart,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  Input,
  LoadingState,
  Notice,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  Textarea,
} from "@/shared/ui";

const months = [
  { label: "Jan", value: 32000, compare: 41000 },
  { label: "Feb", value: 30000, compare: 52000 },
  { label: "Mar", value: 18000, compare: 22000 },
  { label: "Apr", value: 39784, compare: 43787 },
  { label: "May", value: 16000, compare: 31000 },
  { label: "Jun", value: 29000, compare: 36000 },
  { label: "Jul", value: 17000, compare: 34000 },
];

/* Live catalogue of UI blocks. Before you build a screen, see what already exists. Rules: DESIGN.md. */
export default function UiCatalogPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="UI blocks"
        description="Everything from @/shared/ui. Screens are built only from these elements — rules in DESIGN.md."
        actions={<Button>Action</Button>}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Pattern: dashboard</h2>
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <StatCard
                highlight
                icon={Wallet}
                label="Total sales"
                value="$612,917"
                hint="vs last month"
                change="+2.08%"
              />
              <StatCard
                icon={ShoppingBag}
                label="Orders"
                value="34,760"
                hint="vs last month"
                change="+12.4%"
              />
              <StatCard
                icon={UserRound}
                label="Visitors"
                value="14,987"
                hint="vs last month"
                change="−2.08%"
                trend="down"
              />
              <StatCard
                icon={PackageCheck}
                label="Products sold"
                value="12,987"
                hint="vs last month"
                change="+12.1%"
              />
            </div>
            <Card>
              <CardHeader
                title="Customer habits"
                description="Track customer behaviour"
                actions={
                  <Select defaultValue="year" className="h-9 w-auto">
                    <option value="year">This year</option>
                    <option value="month">This month</option>
                  </Select>
                }
              />
              <BarChart data={months} valueLabel="Sales" compareLabel="Views" />
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                title="Categories"
                description="Share of sales"
                actions={<Badge tone="success">+5.34%</Badge>}
              />
              <div className="flex flex-col gap-5">
                <ProgressBar label="Electronics" valueLabel="2,487" value={82} />
                <ProgressBar label="Games" valueLabel="1,828" value={60} />
                <ProgressBar label="Furniture" valueLabel="1,463" value={48} tone="danger" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent tickets" description="List with icon and status" />
              <ul className="flex flex-col gap-4">
                {[
                  { name: "Ticket #128", tone: "success" as const, status: "Done" },
                  { name: "Ticket #127", tone: "warning" as const, status: "In progress" },
                  { name: "Ticket #126", tone: "neutral" as const, status: "New" },
                ].map((row) => (
                  <li key={row.name} className="flex items-center gap-3">
                    <IconTile icon={ClipboardList} tone="brand" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{row.name}</span>
                      <span className="text-xs text-muted">2 hours ago</span>
                    </div>
                    <Badge tone={row.tone}>{row.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Individual blocks</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <CardHeader title="Button" description="Primary only for the main action on a screen" />
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Saving</Button>
              <Button size="sm">Small</Button>
            </div>
            <h3 className="font-semibold">Badge</h3>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="success">+12.4%</Badge>
              <Badge tone="warning">In progress</Badge>
              <Badge tone="danger">−2.08%</Badge>
            </div>
            <h3 className="font-semibold">Notice</h3>
            <Notice>Information for the user.</Notice>
            <Notice tone="success">Changes saved.</Notice>
            <Notice tone="danger">Could not save.</Notice>
          </Card>
          <Card className="flex flex-col gap-4">
            <CardHeader title="Form" description="Field + Input / Textarea / Select" />
            <Field label="Title" hint="Short and specific.">
              <Input placeholder="E.g. Fault report" />
            </Field>
            <Field label="Description" error="This field is required.">
              <Textarea />
            </Field>
            <Field label="Category">
              <Select defaultValue="a">
                <option value="a">Option A</option>
                <option value="b">Option B</option>
              </Select>
            </Field>
          </Card>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">EmptyState</h3>
            <EmptyState
              title="No items"
              description="Add the first item to get started."
              action={<Button>Add</Button>}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">ErrorState</h3>
            <ErrorState
              description="Could not load data."
              action={<Button variant="secondary">Try again</Button>}
            />
          </div>
          <Card className="flex flex-col gap-3">
            <CardHeader title="LoadingState + Skeleton" />
            <LoadingState />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-24 w-full" />
          </Card>
        </div>
      </section>
    </div>
  );
}
