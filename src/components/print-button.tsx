"use client";

export function PrintButton({ label = "PDFで保存（印刷）" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary w-full print:hidden"
    >
      {label}
    </button>
  );
}
