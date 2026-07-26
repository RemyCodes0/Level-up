import { Check, X } from "lucide-react";
import {
  getPasswordChecks,
  scorePassword,
  getPasswordStrengthLabel,
  PASSWORD_MIN_LENGTH,
} from "../lib/passwordStrength";

const SEGMENT_COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500"];
const LABEL_COLORS = ["text-red-600", "text-orange-600", "text-amber-600", "text-emerald-600", "text-emerald-600"];

interface PasswordStrengthMeterProps {
  password: string;
}

// Shown live under a password field as the user types — a segmented bar for
// an at-a-glance read, plus a checklist so it's obvious exactly WHAT to add
// next rather than just "try harder".
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const checks = getPasswordChecks(password);
  const score = scorePassword(password);
  const label = getPasswordStrengthLabel(score);
  const filledSegments = Math.max(1, score); // even a score of 0 shows 1 red segment once the user has typed something

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-4 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-colors duration-200 ${
                i < filledSegments ? SEGMENT_COLORS[Math.min(score, 3)] : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-semibold ${LABEL_COLORS[score]} shrink-0`}>{label}</span>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        <ChecklistItem met={checks.minLength} label={`${PASSWORD_MIN_LENGTH}+ characters`} />
        <ChecklistItem met={checks.mixedCase} label="Upper & lowercase" />
        <ChecklistItem met={checks.hasNumber} label="A number" />
        <ChecklistItem met={checks.hasSymbol} label="A symbol" />
      </ul>
    </div>
  );
}

function ChecklistItem({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${met ? "text-emerald-600" : "text-gray-400"}`}>
      {met ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
      {label}
    </li>
  );
}
