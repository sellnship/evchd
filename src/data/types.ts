/**
 * Typed access to the data layer (the site's "moat").
 *
 * The three JSON files in this folder are imported with Astro's built-in JSON
 * support: Vite handles `.json` natively at runtime, and `resolveJsonModule`
 * (enabled by Astro's base tsconfig) types them at compile time. No import
 * assertions — they're unnecessary under Vite/esbuild and can break bundling.
 *
 * Each import is annotated with its interface below, so the annotation both
 * documents the shape and makes the compiler verify the JSON still matches it,
 * and every consumer imports an already-typed value.
 */

/* ===================================================================
 * local-facts.json  →  LocalFacts
 * =================================================================== */

export interface LocalFactsMeta {
  purpose: string;
  lastVerified: string;
  region: string;
}

export interface LowSpeedExemption {
  criteria: string;
  licence_required: boolean;
  rto_registration_required: boolean;
  road_tax: boolean;
  number_plate: boolean;
  min_age: number;
  insurance_mandatory: boolean;
  insurance_note: string;
  registration_saving_inr: string;
  key_nuance: string;
  ready_to_ride: string;
  source: string;
}

export interface HighSpeedRules {
  applies_to: string;
  licence_required: boolean;
  rto_registration_required: boolean;
  road_tax: boolean;
  insurance_mandatory: boolean;
  min_age: number;
}

export interface TricityRegions {
  chandigarh: string;
  mohali: string;
  panchkula: string;
  note: string;
}

export interface LicenceRegistration {
  low_speed_exemption: LowSpeedExemption;
  high_speed: HighSpeedRules;
  tricity_regions: TricityRegions;
}

export interface ChandigarhDomesticTariff {
  tiered: string;
  fixed_charge_note: string;
  effective_from: string;
  order: string;
  source: string;
}

export interface ElectricityTariff {
  /** Realistic all-in rate used for running-cost math (~Rs 5/unit). */
  running_cost_basis_inr: number;
  basis_note: string;
  chandigarh_domestic: ChandigarhDomesticTariff;
  mohali_pspcl_inr: string;
  panchkula_haryana_note: string;
  local_hook: string;
}

export interface ChargingCost {
  full_charge_units: string;
  full_charge_cost_inr: string;
  per_km_inr: number;
  petrol_equivalent_for_same_distance_inr: string;
  worked_example: string;
  source: string;
}

export interface PmEDriveSubsidy {
  scheme: string;
  applies_to: string;
  incentive_per_kwh_inr: number;
  cap_per_vehicle_inr: number;
  deadline: string;
  low_speed_eligibility: boolean;
  low_speed_note: string;
  source: string;
}

export interface PunjabStateSubsidy {
  status: string;
  note: string;
}

export interface Subsidies {
  pm_e_drive: PmEDriveSubsidy;
  punjab_state: PunjabStateSubsidy;
}

export interface ValuePropositionEntry {
  angle: string;
  message: string;
}

export interface ValuePropositionSplit {
  low_speed_current: ValuePropositionEntry;
  high_speed_future: ValuePropositionEntry;
}

export interface LocalFacts {
  _meta: LocalFactsMeta;
  licence_registration: LicenceRegistration;
  electricity_tariff: ElectricityTariff;
  charging_cost: ChargingCost;
  subsidies: Subsidies;
  value_proposition_split: ValuePropositionSplit;
}

/* ===================================================================
 * models.json  →  ModelsData (brand-neutral spec CLASSES)
 *
 * Comparisons are by CLASS and SPEC, not per-SKU. Each class lists >=3
 * representative models across brands (Zelio is only ever one of them), and
 * prices are bands — so no exact ex-showroom figure is ever published.
 * =================================================================== */

export interface ModelsMeta {
  purpose: string;
  rule: string;
  verify_before_publish?: string;
}

export interface RepresentativeModel {
  brand: string;
  model: string;
}

export interface ClassSpec {
  /** A range band (e.g. "60-70") in km. */
  range_km: string;
  battery: string;
  /** A price band (e.g. "35,000-45,000") in INR — never an exact figure. */
  price_band_inr: string;
  body: string;
}

export interface SpecClass {
  id: string;
  label: string;
  who: string;
  spec: ClassSpec;
  tradeoff: string;
  representative_models: RepresentativeModel[];
}

export interface ModelsData {
  _meta: ModelsMeta;
  classes: SpecClass[];
}

/* ===================================================================
 * authors.json  →  AuthorsData (Author[] + Publisher)
 * =================================================================== */

export interface AuthorsMeta {
  purpose: string;
  instructions?: string;
  todo?: string;
}

export interface Author {
  id: string;
  name: string;
  role: string;
  bio: string;
  expertise: string[];
  photo: string;
}

export interface Publisher {
  name: string;
  legal_entity: string;
  address: string;
  phone: string;
  whatsapp: string;
  hours: string;
  note: string;
}

export interface AuthorsData {
  _meta: AuthorsMeta;
  authors: Author[];
  publisher: Publisher;
}

/* ===================================================================
 * Typed imports — consumers should import these, not the raw JSON.
 * =================================================================== */

import localFactsJson from './local-facts.json';
import modelsJson from './models.json';
import authorsJson from './authors.json';

export const localFacts: LocalFacts = localFactsJson;
export const models: ModelsData = modelsJson;
export const authors: AuthorsData = authorsJson;
