from pathlib import Path

from extraction import extract_zip_package, save_extraction_outputs


def main():
    print("Starting extraction test...")

    project_root = Path(__file__).resolve().parent.parent

    input_zip = project_root / "sample_audit_files" / "Northstar_Retail_Group_Mega_Audit_Package_2024.zip"
    output_folder = project_root / "validation_outputs"
    unzip_folder = output_folder / "unzipped_files"

    print(f"Project root: {project_root}")
    print(f"Input ZIP: {input_zip}")
    print(f"Output folder: {output_folder}")
    print(f"Input ZIP exists: {input_zip.exists()}")

    if not input_zip.exists():
        print("ERROR: ZIP file not found. Check the exact filename in sample_audit_files.")
        return

    output_folder.mkdir(parents=True, exist_ok=True)

    documents = extract_zip_package(input_zip, unzip_folder)

    print(f"Documents processed: {len(documents)}")

    total_tables = sum(len(document.tables) for document in documents)
    documents_with_text = sum(1 for document in documents if document.text.strip())
    total_warnings = sum(len(document.warnings) for document in documents)

    print(f"Documents with extracted text: {documents_with_text}")
    print(f"Tables extracted: {total_tables}")
    print(f"Warnings: {total_warnings}")

    save_extraction_outputs(documents, output_folder)

    print("Extraction complete.")
    print(f"Readable output saved to: {output_folder / 'extracted_output_readable.txt'}")
    print(f"Structured output saved to: {output_folder / 'extracted_output_structured.json'}")


if __name__ == "__main__":
    main()