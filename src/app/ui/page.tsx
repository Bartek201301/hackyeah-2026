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
  { label: "Sty", value: 32000, compare: 41000 },
  { label: "Lut", value: 30000, compare: 52000 },
  { label: "Mar", value: 18000, compare: 22000 },
  { label: "Kwi", value: 39784, compare: 43787 },
  { label: "Maj", value: 16000, compare: 31000 },
  { label: "Cze", value: 29000, compare: 36000 },
  { label: "Lip", value: 17000, compare: 34000 },
];

/* Żywy katalog klocków UI. Zanim zbudujesz ekran — zobacz, co już jest. Zasady: DESIGN.md. */
export default function UiCatalogPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Klocki UI"
        description="Wszystko z @/shared/ui. Ekrany budujemy wyłącznie z tych elementów — zasady w DESIGN.md."
        actions={<Button>Akcja</Button>}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Wzorzec: dashboard</h2>
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <StatCard
                highlight
                icon={Wallet}
                label="Łączna sprzedaż"
                value="612 917 zł"
                hint="vs poprzedni miesiąc"
                change="+2,08%"
              />
              <StatCard
                icon={ShoppingBag}
                label="Zamówienia"
                value="34 760"
                hint="vs poprzedni miesiąc"
                change="+12,4%"
              />
              <StatCard
                icon={UserRound}
                label="Odwiedzający"
                value="14 987"
                hint="vs poprzedni miesiąc"
                change="−2,08%"
                trend="down"
              />
              <StatCard
                icon={PackageCheck}
                label="Sprzedane produkty"
                value="12 987"
                hint="vs poprzedni miesiąc"
                change="+12,1%"
              />
            </div>
            <Card>
              <CardHeader
                title="Nawyki klientów"
                description="Śledź zachowania klientów"
                actions={
                  <Select defaultValue="year" className="h-9 w-auto">
                    <option value="year">Ten rok</option>
                    <option value="month">Ten miesiąc</option>
                  </Select>
                }
              />
              <BarChart data={months} valueLabel="Sprzedaż" compareLabel="Wyświetlenia" />
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                title="Kategorie"
                description="Udział w sprzedaży"
                actions={<Badge tone="success">+5,34%</Badge>}
              />
              <div className="flex flex-col gap-5">
                <ProgressBar label="Elektronika" valueLabel="2 487" value={82} />
                <ProgressBar label="Gry" valueLabel="1 828" value={60} />
                <ProgressBar label="Meble" valueLabel="1 463" value={48} tone="danger" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Ostatnie zgłoszenia" description="Lista z ikoną i statusem" />
              <ul className="flex flex-col gap-4">
                {[
                  { name: "Zgłoszenie #128", tone: "success" as const, status: "Gotowe" },
                  { name: "Zgłoszenie #127", tone: "warning" as const, status: "W toku" },
                  { name: "Zgłoszenie #126", tone: "neutral" as const, status: "Nowe" },
                ].map((row) => (
                  <li key={row.name} className="flex items-center gap-3">
                    <IconTile icon={ClipboardList} tone="brand" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{row.name}</span>
                      <span className="text-xs text-muted">2 godziny temu</span>
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Pojedyncze klocki</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <CardHeader title="Button" description="Primary tylko dla głównej akcji ekranu" />
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Zapisywanie</Button>
              <Button size="sm">Mały</Button>
            </div>
            <h3 className="font-semibold">Badge</h3>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="success">+12,4%</Badge>
              <Badge tone="warning">W toku</Badge>
              <Badge tone="danger">−2,08%</Badge>
            </div>
            <h3 className="font-semibold">Notice</h3>
            <Notice>Informacja dla użytkownika.</Notice>
            <Notice tone="success">Zapisano zmiany.</Notice>
            <Notice tone="danger">Nie udało się zapisać.</Notice>
          </Card>
          <Card className="flex flex-col gap-4">
            <CardHeader title="Formularz" description="Field + Input / Textarea / Select" />
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
            <h3 className="font-semibold">EmptyState</h3>
            <EmptyState
              title="Brak elementów"
              description="Dodaj pierwszy element, aby zacząć."
              action={<Button>Dodaj</Button>}
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">ErrorState</h3>
            <ErrorState
              description="Nie udało się pobrać danych."
              action={<Button variant="secondary">Spróbuj ponownie</Button>}
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
