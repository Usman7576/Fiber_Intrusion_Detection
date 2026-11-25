import {
  AlertOctagon,
  AlertTriangle,
  Droplets,
  Footprints,
  Hammer,
  HelpCircle,
  Info,
  ShieldCheck,
  Shovel,
  Vibrate,
  type LucideIcon,
} from "lucide-react";

export const CLASS_NAMES = ["background", "dig", "knock", "water", "shake", "walk"] as const;
export type ClassName = (typeof CLASS_NAMES)[number];

export type AlertLevel = "critical" | "warning" | "info" | "normal" | "uncertain";

type ClassMeta = { label: string; color: string; icon: LucideIcon; blurb: string };

/** One fixed colour per class, used by every chart, badge and bar. */
export const CLASSES: Record<ClassName, ClassMeta> = {
  background: { label: "Background", color: "#94A3B8", icon: ShieldCheck, blurb: "Quiet fiber, no activity" },
  dig: { label: "Digging", color: "#F43F5E", icon: Shovel, blurb: "Excavation near the cable" },
  knock: { label: "Knocking", color: "#F59E0B", icon: Hammer, blurb: "Striking the ground or conduit" },
  water: { label: "Watering", color: "#38BDF8", icon: Droplets, blurb: "Water flowing over the ground" },
  shake: { label: "Shaking", color: "#A78BFA", icon: Vibrate, blurb: "Shaking or pulling the cable" },
  walk: { label: "Walking", color: "#10B981", icon: Footprints, blurb: "People walking above the route" },
};

export function classMeta(name: string): ClassMeta {
  return CLASSES[name as ClassName] ?? { label: name, color: "#94A3B8", icon: HelpCircle, blurb: "" };
}

type LevelMeta = { label: string; color: string; icon: LucideIcon };

export const LEVELS: Record<AlertLevel, LevelMeta> = {
  critical: { label: "Critical", color: "#F43F5E", icon: AlertOctagon },
  warning: { label: "Warning", color: "#F59E0B", icon: AlertTriangle },
  info: { label: "Info", color: "#38BDF8", icon: Info },
  normal: { label: "Normal", color: "#10B981", icon: ShieldCheck },
  uncertain: { label: "Uncertain", color: "#94A3B8", icon: HelpCircle },
};

export function levelMeta(level: string): LevelMeta {
  return LEVELS[level as AlertLevel] ?? LEVELS.uncertain;
}

export const THREATS = new Set<string>(["dig", "knock", "shake"]);

/** Sensing points are 10 m apart in the UI's route drawing (illustrative spacing). */
export const POINT_SPACING_M = 10;
