import { ImportWizard } from "./import-wizard";

export default function ContactImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Import contacts</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV or XLSX file, map columns, and review validation results before importing.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
