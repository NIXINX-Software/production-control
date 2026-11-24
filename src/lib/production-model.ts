/** Contratos iniciales. No implican persistencia ni colecciones creadas. */
export type SiteId = string;
export type ProductCategory = "protein" | "prepared" | "other";
export type CountPeriod = "opening" | "closing";
export type ActivityState = "running" | "paused" | "completed";
export type BatchState = "planned" | "active" | "completed";
export type Unit = "kg" | "g" | "lb" | "l" | "ml" | "unit";

export interface ControlledProduct {
  id: string;
  name: string;
  category: ProductCategory;
  bagWeightKg: number;
  active: boolean;
  siteIds: SiteId[];
  updatedAt?: string; // timestamp del servidor en persistencia futura
}
export interface CountLine {
  productId: string;
  bagCount: number;
  bagWeightKgSnapshot: number; // conserva histórico si cambia catálogo
}
export interface InventoryCount {
  id: string;
  siteId: SiteId;
  operationalDate: string; // YYYY-MM-DD, fecha declarada
  period: CountPeriod;
  capturedAt: string; // timestamp asignado por servidor en producción
  enteredById: string;
  isLateEntry: boolean; // calculado respecto de la jornada correspondiente
  lines: CountLine[];
}
export interface ProductionInput {
  id: string;
  batchId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  recordedById: string;
  recordedAt: string;
}
export interface ProductionActivity {
  id: string;
  batchId: string;
  employeeId: string;
  label: string;
  state: ActivityState;
  /** Intervalos separados: no atribuir cocción desatendida a horas-hombre. */
  intervals: Array<{ startedAt: string; stoppedAt?: string }>;
}
export interface ProductionBatch {
  id: string;
  siteId: SiteId;
  productId: string;
  operationalDate: string;
  status: BatchState;
  outputBagCount?: number;
  outputBagWeightKgSnapshot?: number;
  outputKg?: number;
  completedAt?: string;
  /** Output confirmado alimentará conciliación, nunca se inventa venta. */
}
export function countKg(line: CountLine): number {
  return line.bagCount * line.bagWeightKgSnapshot;
}
export function elapsedWorkMs(activity: ProductionActivity, asOf: string): number {
  const end = Date.parse(asOf);
  return activity.intervals.reduce((total, slot) => {
    const start = Date.parse(slot.startedAt);
    const stop = slot.stoppedAt ? Date.parse(slot.stoppedAt) : end;
    return total + (Number.isFinite(start) && Number.isFinite(stop) ? Math.max(0, stop - start) : 0);
  }, 0);
}
/** Consumo o salida no explicada estimada: apertura + producción - cierre.
 * Solo fiable cuando los registros de la jornada están completos.
 */
export function estimatedOutflowKg(openingKg: number, producedKg: number, closingKg: number) {
  return openingKg + producedKg - closingKg;
}
