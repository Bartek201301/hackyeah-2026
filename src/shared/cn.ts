/** Skleja klasy CSS, pomijając puste wartości: cn("a", warunek && "b"). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
