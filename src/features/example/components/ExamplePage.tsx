import { Card, EmptyState, PageHeader } from "@/shared/ui";
import { meta } from "../meta";
import { getExampleItems } from "../queries";
import { ExampleForm } from "./ExampleForm";

/* Feature screen (server component): loads data and builds the view from @/shared/ui blocks. */
export async function ExamplePage() {
  const items = await getExampleItems();

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <ExampleForm />
        </Card>
        {items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Items will appear once a database table is connected."
          />
        ) : (
          <Card className="flex flex-col divide-y divide-border p-0">
            {items.map((item) => (
              <div key={item.id} className="px-5 py-3">
                {item.name}
              </div>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
