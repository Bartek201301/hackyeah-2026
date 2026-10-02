import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Notice,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from "@/shared/ui";

/* Żywy katalog klocków UI. Zanim zbudujesz ekran — zobacz, co już jest. */
export default function UiCatalogPage() {
  return (
    <>
      <PageHeader
        title="Klocki UI"
        description="Wszystko z @/shared/ui. Ekrany budujemy wyłącznie z tych elementów."
        actions={<Button>Akcja</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Button</h2>
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Zapisywanie</Button>
            <Button size="sm">Mały</Button>
          </div>
          <h2 className="font-semibold">Badge</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="brand">Brand</Badge>
            <Badge tone="success">Gotowe</Badge>
            <Badge tone="warning">W toku</Badge>
            <Badge tone="danger">Błąd</Badge>
          </div>
          <h2 className="font-semibold">Notice</h2>
          <Notice>Informacja dla użytkownika.</Notice>
          <Notice tone="success">Zapisano zmiany.</Notice>
          <Notice tone="danger">Nie udało się zapisać.</Notice>
        </Card>
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Field + Input / Textarea / Select</h2>
          <Field label="Tytuł" hint="Krótki i konkretny.">
            <Input placeholder="Np. Zgłoszenie usterki" />
          </Field>
          <Field label="Opis" error="To pole jest wymagane.">
            <Textarea />
          </Field>
          <Field label="Kategoria">
            <Select defaultValue="a">
              <option value="a">Opcja A</option>
              <option value="b">Opcja B</option>
            </Select>
          </Field>
        </Card>
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">EmptyState</h2>
          <EmptyState
            title="Brak elementów"
            description="Dodaj pierwszy element, aby zacząć."
            action={<Button>Dodaj</Button>}
          />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">ErrorState</h2>
          <ErrorState
            description="Nie udało się pobrać danych."
            action={<Button variant="secondary">Spróbuj ponownie</Button>}
          />
        </div>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">LoadingState + Skeleton</h2>
          <LoadingState />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    </>
  );
}
