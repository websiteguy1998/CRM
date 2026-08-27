import PageHeader from "@/components/page-header";
import ImportForm from "./import-form";

export default function ImportLeadsPage() {
  return (
    <div>
      <PageHeader title="Import leads" description="Upload a CSV of leads to bulk-create them." />
      <div className="max-w-2xl p-6">
        <div className="card p-5">
          <p className="mb-4 text-sm text-slate-600">
            Expected columns (case-insensitive, any order — matches your sheet):{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              Id Name, ID URL, Client Name, Country, Website URL, Contact, Email, Delivery, Price,
              Duration, Status
            </code>
            . Each row needs a client name and at least a phone, email, or website. Rows matching an
            existing lead (by phone, email, or website/ID URL) are skipped as duplicates. New leads
            come in unassigned — a Super Admin allocates them to a sales agent afterwards.
          </p>
          <ImportForm />
        </div>
      </div>
    </div>
  );
}
