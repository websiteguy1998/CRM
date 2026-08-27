import PageHeader from "@/components/page-header";
import ImportForm from "./import-form";

export default function ImportLeadsPage() {
  return (
    <div>
      <PageHeader title="Import leads" description="Upload a CSV of leads to bulk-create them." />
      <div className="max-w-2xl p-6">
        <div className="card p-5">
          <p className="mb-4 text-sm text-slate-600">
            Expected columns (case-insensitive, any order):{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
              First Name, Last Name, Company, Phone, Email, Website, Industry, City, State, Country,
              Lead Source, Campaign
            </code>
            . Each row needs a first name and at least a phone or an email. Duplicate phone/email
            within your org are skipped automatically, and new leads are assigned round-robin.
          </p>
          <ImportForm />
        </div>
      </div>
    </div>
  );
}
