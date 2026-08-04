import { Wrench } from "lucide-react";

// Shown by App.tsx's maintenance gate for every route except /admin/* and the
// auth pages, whenever an admin has flipped the toggle on the Overview page.
export default function MaintenancePage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
          <Wrench className="h-7 w-7 text-indigo-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">We'll be right back</h1>
        <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
